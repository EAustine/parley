import { NextResponse, type NextRequest } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import {
  guestIdentity,
  sanitiseDisplayName,
  userIdentity,
} from "@/lib/livekit/identity";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/** Six hours, per §7. Long enough for a meeting, short enough to expire. */
const TOKEN_TTL_SECONDS = 6 * 60 * 60;

const RATE_LIMIT = { limit: 10, windowSeconds: 60 };

type TokenError =
  | "invalid_request"
  | "display_name_required"
  | "guests_not_allowed"
  | "meeting_not_found"
  | "meeting_ended"
  | "rate_limited";

function fail(error: TokenError, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * Mints a room token.
 *
 * The whole endpoint exists because `LIVEKIT_API_SECRET` signs these, and a
 * signed token is authority: it says which room you may enter and what you may
 * do there. Two consequences run through everything below.
 *
 * **Joinability is decided here, not by the page.** `get_meeting_by_code`
 * resolves ended meetings so the join page can say so; that a row comes back
 * does not mean a room may be entered. This is the only place that answers
 * that question, and it re-asks it rather than trusting anything the client
 * sends.
 *
 * **Identity is derived, never accepted.** LiveKit uses identity to tell
 * participants apart, so honouring a client-supplied one would let someone
 * collide with — or impersonate — another participant. The display name rides
 * in metadata, where it is a label rather than a key.
 */
export async function POST(request: NextRequest) {
  const { allowed } = await consumeRateLimit({
    key: `livekit-token:${clientIp(request)}`,
    ...RATE_LIMIT,
  });
  if (!allowed) return fail("rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_request", 400);
  }

  const raw = body as { code?: unknown; displayName?: unknown };
  const code =
    typeof raw.code === "string" ? normaliseMeetingCode(raw.code) : null;
  if (!code) return fail("invalid_request", 400);

  // Public facts about the meeting, read the way a guest reads them.
  const anon = createAnonClient();
  const { data: rows, error } = await anon.rpc("get_meeting_by_code", {
    p_code: code,
  });
  if (error) return fail("meeting_not_found", 404);

  const meeting = rows?.[0];
  if (!meeting) return fail("meeting_not_found", 404);
  if (meeting.status === "ended") return fail("meeting_ended", 410);

  // Is this the host? Asked by trying to read the row as *them* — RLS returns
  // it only to its owner, so a successful read is the authorisation. No
  // separate ownership check to drift out of step with the policy.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isHost = false;
  if (user) {
    const { data: owned } = await supabase
      .from("meetings")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    isHost = Boolean(owned);
  }

  if (!user && !meeting.guests_allowed) return fail("guests_not_allowed", 403);

  const requested = sanitiseDisplayName(raw.displayName);

  // A guest is only ever a name. Without one there is nothing to label their
  // tile with, and "Guest" for everyone is worse than asking.
  if (!user && !requested) return fail("display_name_required", 400);

  const identity = user ? userIdentity(user.id) : guestIdentity();
  const displayName =
    requested ?? user?.user_metadata?.full_name ?? user?.email ?? "Host";

  const token = new AccessToken(
    serverEnv.LIVEKIT_API_KEY,
    serverEnv.LIVEKIT_API_SECRET,
    {
      identity,
      ttl: TOKEN_TTL_SECONDS,
      // Metadata, not the identity string: this is a label, and labels change.
      metadata: JSON.stringify({
        displayName,
        role: isHost ? "host" : "participant",
      }),
    },
  );

  // Exactly the grants in §7 and nothing wider. Notably absent: roomAdmin,
  // roomCreate, roomList, and canUpdateOwnMetadata — a participant renaming
  // themselves mid-call would undo the sanitisation above.
  token.addGrant({
    roomJoin: true,
    room: code,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: publicEnv.NEXT_PUBLIC_LIVEKIT_URL,
    identity,
    displayName,
    role: isHost ? "host" : "participant",
  });
}
