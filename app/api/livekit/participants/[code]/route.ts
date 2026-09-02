import { NextResponse, type NextRequest } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

import { createClient } from "@/lib/supabase/server";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Removing a participant — §3.8, host only.
 *
 * This exists as a server route rather than a client call because §7's token
 * grants deliberately withhold `roomAdmin`: a client that could remove people
 * could remove anyone, in any room, for as long as its token lived. The
 * authority stays on the server, where it is spent once per request against a
 * host we have just verified.
 *
 * Ownership is RLS, as everywhere else — the meeting is read as the caller,
 * and someone else's meeting simply is not found. Same 404 a made-up code
 * gets, which is true and declines to confirm the code exists.
 *
 * Removing is not muting. §3.8's rule that "a host can silence, never
 * activate" is about someone's microphone; asking them to leave is a different
 * power, it is visible to them, and it is the one a host actually needs when
 * something has gone wrong.
 */

type RemoveError =
  | "unauthenticated"
  | "invalid_request"
  | "not_found"
  | "not_host"
  | "remove_failed";

function fail(error: RemoveError, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = normaliseMeetingCode(raw);
  if (!code) return fail("not_found", 404);

  const identity = new URL(request.url).searchParams.get("identity");
  if (!identity) return fail("invalid_request", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", 401);

  // Read as the caller. RLS returns their own meetings and nothing else.
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (!meeting) return fail("not_found", 404);

  // A host removing themselves is a Leave with extra steps, and it would take
  // the only person who can undo it out of the room.
  if (identity === `user_${user.id}`) return fail("invalid_request", 400);

  const service = new RoomServiceClient(
    publicEnv.NEXT_PUBLIC_LIVEKIT_URL.replace(/^wss:/, "https:"),
    serverEnv.LIVEKIT_API_KEY,
    serverEnv.LIVEKIT_API_SECRET,
  );

  try {
    await service.removeParticipant(code, identity);
  } catch {
    // Already gone is the common case — they left while the host was deciding.
    // Not an error worth showing, and the outcome is the one that was wanted.
    return NextResponse.json({ code, identity, removed: false });
  }

  return NextResponse.json({ code, identity, removed: true });
}
