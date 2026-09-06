import { NextResponse, type NextRequest } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { createClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountDisplayName } from "@/lib/auth/display-name";
import { decide } from "@/lib/meetings/door";
import { deviceCookie, readDeviceId, subjectFor } from "@/lib/room/device";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import {
  guestIdentity,
  sanitiseDisplayName,
  userIdentity,
} from "@/lib/livekit/identity";
import { consumeRateLimit, rateLimitSubject } from "@/lib/rate-limit";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/** Six hours, per §7. Long enough for a meeting, short enough to expire. */
const TOKEN_TTL_SECONDS = 6 * 60 * 60;

/**
 * §7's two tiers.
 *
 * A flat 10/min/IP was the original figure and it blocked the product's own
 * spec: seventeen people joining one meeting from one office share one public
 * IP, and carrier-grade NAT puts thousands of mobile subscribers behind a
 * handful of addresses. It was also guarding the wrong thing — at 8×10^14
 * codes, enumeration takes geological time whatever the limit is.
 *
 * What separates an office from an enumerator is not how many requests they
 * make but how many *resolve*. Seventeen colleagues produce seventeen hits; an
 * enumerator produces a stream of misses. So the tight limit is on misses,
 * counted only after the lookup says the code is not real.
 */
const OVERALL = { limit: 60, windowSeconds: 60 };
const MISSES = { limit: 5, windowSeconds: 60 };

type TokenError =
  | "invalid_request"
  | "display_name_required"
  | "guests_not_allowed"
  | "meeting_not_found"
  | "meeting_ended"
  | "rate_limited"
  /* v1.5 A1 and B1. Four outcomes rather than one, because they are four
     different screens: waiting for a host, waiting to be let in, turned away,
     and ejected. §3.11's rule that these must not share a screen applies to
     the door as much as to a dropped connection. */
  | "waiting_for_host"
  | "waiting_for_admission"
  | "denied"
  | "removed";

function fail(error: TokenError, status: number) {
  return NextResponse.json({ error }, { status });
}

/**
 * §7: "A 429 on join is not a dead end." The header is what lets the client
 * hold the pre-join screen and come back at the right moment instead of
 * guessing — a guess is how you get either a stampede or a screen that waits
 * longer than it needs to.
 */
function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: "rate_limited" satisfies TokenError, retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
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

  // Who is asking has to be settled before anything is counted, because a
  // signed-in caller is counted against their own bucket rather than against
  // whatever NAT they happen to be behind.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const subject = rateLimitSubject(request, user?.id ?? null);

  const overall = await consumeRateLimit({
    key: `livekit-token:${subject}`,
    ...OVERALL,
  });
  if (!overall.allowed) return tooManyRequests(overall.retryAfter);

  // Public facts about the meeting, read the way a guest reads them.
  const anon = createAnonClient();
  const { data: rows, error } = await anon.rpc("get_meeting_by_code", {
    p_code: code,
  });

  const meeting = error ? undefined : rows?.[0];

  // Counted here and nowhere else — after the lookup, and only on a miss. This
  // is the tier that actually defends the code space, and putting it before
  // the lookup would make it a limit on joining, which is what §7 removed.
  // A cancelled meeting is as unjoinable as an ended one. The contract has a
  // single code for "resolved but not joinable"; the join page is what draws
  // the distinction, because that is where it changes what someone reads.
  if (!meeting || meeting.status === "ended" || meeting.status === "cancelled") {
    const misses = await consumeRateLimit({
      key: `livekit-miss:${subject}`,
      ...MISSES,
    });
    // Past the miss allowance the answer stops distinguishing "no such code"
    // from "expired", which is the distinction an enumerator is paying for.
    if (!misses.allowed) return tooManyRequests(misses.retryAfter);
    if (!meeting) return fail("meeting_not_found", 404);
    return fail("meeting_ended", 410);
  }

  // Is this the host? Asked by trying to read the row as *them* — RLS returns
  // it only to its owner, so a successful read is the authorisation. No
  // separate ownership check to drift out of step with the policy.
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

  /**
   * Everyone joins under a name they chose, and there is no third source.
   *
   * The request supplies one, or the account carries one. What is *not* here
   * any more is the tail this used to end with — `?? user.email ?? "Host"` —
   * which put a host's email address on their tile, in the people panel, and
   * in front of every link-holder in the room. `lib/auth/display-name.ts`
   * carries that reasoning in full.
   *
   * A signed-in person whose account has no name is now refused exactly as a
   * guest without one is, and lands on the same designed state: pre-join shows
   * the field, they say what they want to be called, they join. §3.3 already
   * puts that screen before every room entry, the host's included.
   */
  const requested = sanitiseDisplayName(raw.displayName);
  const displayName = requested ?? accountDisplayName(user);
  if (!displayName) return fail("display_name_required", 400);

  /**
   * The door — v1.5 A1 and B1, and the only place that can actually refuse.
   *
   * A1: "checked in the token endpoint. Not the client — the client is the
   * thing being kept out." A waiting person leaves here with no token at all,
   * which is the whole design: they are not in the room, so no permission flag
   * has to be right for them to be unable to hear it.
   *
   * The name is resolved first, deliberately. Somebody joining the queue is
   * shown to the host by the name they typed, so it has to exist and be
   * sanitised before a row is written — C1 is blunt that a denied person's name
   * is "a string typed by someone who never got in".
   */
  const device = await readDeviceId();
  const who = subjectFor(user?.id, device.id);

  /**
   * The gate's own read, with the service role.
   *
   * `get_meeting_by_code` returns six columns and neither of the two this
   * needs — the row id and `waiting_room`. That narrowness is deliberate and
   * documented in §6 ("no host identity, no participant list, no settings
   * beyond the one flag the join page needs"), so the answer is not to widen
   * it: the join *page* is a display surface and this is a server decision, and
   * they should not share a contract just because they share a code.
   *
   * `createAdminClient` is already the established way to ask a question RLS
   * has no policy for, and it is `server-only`, so this cannot reach a bundle.
   */
  const admin = createAdminClient();
  const { data: gate } = await admin
    .from("meetings")
    .select("id, waiting_room")
    .eq("code", code)
    .maybeSingle();

  if (!gate) return fail("meeting_not_found", 404);

  /*
   * Has the host already let this person in? By subject rather than by an id
   * the client hands over — a client-supplied row id is a client claiming to be
   * a queue entry, which is the same mistake as accepting a display identity,
   * and §7 already refuses that for exactly this reason.
   */
  const { data: standing } = await admin
    .from("meeting_waiting")
    .select("status")
    .eq("meeting_id", gate.id)
    .eq("subject", who.subject)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const admitted = standing?.status === "admitted";

  const verdict = await decide({
    db: admin,
    meetingId: gate.id,
    code,
    waitingRoom: Boolean(gate.waiting_room),
    isHost,
    isSignedIn: Boolean(user),
    who,
    admitted,
  });

  if (verdict.kind !== "admit") {
    const body =
      verdict.kind === "blocked"
        ? { error: verdict.reason satisfies TokenError, retryAfter: verdict.retryAfter }
        : {
            error: (verdict.kind === "wait-for-host"
              ? "waiting_for_host"
              : "waiting_for_admission") satisfies TokenError,
          };
    /*
     * 403, not 401: this is not about credentials and there is nothing to log
     * in with. The device cookie rides along on the refusal so a blocked person
     * who has never been here before is still identifiable the next time — a
     * cookie only set on success would issue an identity exactly to the people
     * who do not need one.
     */
    const response = NextResponse.json(body, { status: 403 });
    if (device.minted) response.cookies.set(deviceCookie(device.id));
    return response;
  }

  const identity = user ? userIdentity(user.id) : guestIdentity();

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

  const minted = NextResponse.json({
    token: await token.toJwt(),
    url: publicEnv.NEXT_PUBLIC_LIVEKIT_URL,
    identity,
    displayName,
    role: isHost ? "host" : "participant",
  });
  // Same cookie on the way in as on the way out, so an identity exists before
  // anybody needs to be kept out with it.
  if (device.minted) minted.cookies.set(deviceCookie(device.id));
  return minted;
}
