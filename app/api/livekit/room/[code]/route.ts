import { NextResponse, type NextRequest } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

import { createClient } from "@/lib/supabase/server";
import { normaliseMeetingCode } from "@/lib/meetings/code";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

/**
 * Ending a meeting for everyone — v1.3 B1, host only.
 *
 * `CLAUDE.md`'s vocabulary has always distinguished **Leave** from **End
 * meeting** and says the two must never be conflated. Until now only Leave
 * existed, so a host who was finished had no way to finish it for anyone else:
 * the room stayed open, the link kept working, and the only thing that could
 * close it was the last person happening to leave.
 *
 * **A sibling of the removal route, and deliberately so.** §3.8: "that route
 * ends and removes, nothing wider." §7's token grants withhold `roomAdmin` from
 * every client, because a client that could delete a room could delete any
 * room, in any meeting, for as long as its token lived. That authority stays on
 * the server and is spent once per request against a host we have just
 * verified. These two files are the entire surface that holds it.
 *
 * `DELETE` on the room, not `POST /end`, because that is what this is: the live
 * room ceases to exist. The `meetings` row survives — it moves to `ended` and
 * keeps its history, which is what the dashboard's past section reads.
 *
 * Ownership is RLS, as everywhere else. The meeting is read as the caller, so
 * someone else's meeting is simply not found — the same 404 a made-up code
 * gets, which is true and declines to confirm the code exists.
 */

type EndError =
  | "unauthenticated"
  | "not_found"
  | "already_ended"
  | "end_failed";

function fail(error: EndError, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = normaliseMeetingCode(raw);
  if (!code) return fail("not_found", 404);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", 401);

  // Read as the caller. RLS returns their own meetings and nothing else, which
  // is the host check — there is no separate comparison to get wrong.
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, status, started_at")
    .eq("code", code)
    .maybeSingle();
  if (!meeting) return fail("not_found", 404);

  /**
   * Cancelled is not ended, and must not be overwritten.
   *
   * §3.2 keeps them apart because they are different events a person
   * experiences differently — the join page says different things, and a
   * cancelled meeting that quietly became "ended" would lose the only signal
   * telling a late arrival it was called off rather than finished.
   */
  if (meeting.status === "ended" || meeting.status === "cancelled") {
    return fail("already_ended", 409);
  }

  const endedAt = new Date().toISOString();

  /**
   * The record first, the room second.
   *
   * Either order can fail halfway, so the question is which half-state is
   * survivable. Ending the room first and failing to write leaves a meeting
   * that is over but reads as live, still joinable, with nothing to correct
   * it. Writing first and failing to delete leaves people connected to a
   * meeting the database calls ended — and the token endpoint already refuses
   * `ended`, so **no one new gets in**, and `room_finished` writes the same
   * status again when the last of them leaves. One is self-healing; the other
   * needs a human.
   */
  const { error: writeError } = await supabase
    .from("meetings")
    .update({ status: "ended", ended_at: endedAt })
    .eq("id", meeting.id);
  if (writeError) return fail("end_failed", 500);

  const service = new RoomServiceClient(
    publicEnv.NEXT_PUBLIC_LIVEKIT_URL.replace(/^wss:/, "https:"),
    serverEnv.LIVEKIT_API_KEY,
    serverEnv.LIVEKIT_API_SECRET,
  );

  let disconnected = true;
  try {
    // Everyone still in it is disconnected with `ROOM_DELETED`, which is what
    // lets the client tell "the host ended this" from "your connection
    // dropped" — see `RoomStage`.
    await service.deleteRoom(code);
  } catch {
    // A room with nobody in it does not exist to LiveKit, so this throws for
    // the ordinary case of a host ending a meeting they are alone in. The
    // outcome wanted is already achieved; the caller is told which happened
    // rather than being shown an error for a success.
    disconnected = false;
  }

  return NextResponse.json({ code, ended: true, disconnected, endedAt });
}
