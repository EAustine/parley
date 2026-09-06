import { NextResponse, type NextRequest } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

import { createAdminClient } from "@/lib/supabase/admin";
import { blockExpiry } from "@/lib/meetings/waiting";

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

  /**
   * Record *why* before disconnecting them — v1.5 C1.
   *
   * "A removal is indistinguishable from leaving. The removal route must write
   * the reason." It has to be written **first**: `removeParticipant` causes
   * LiveKit to fire `participant_left`, and that handler closes the row with
   * `left_at`. Writing afterwards is a race against a webhook that may already
   * have arrived, and losing it would leave an ejection recorded as a departure
   * — which is the one thing this column exists to prevent.
   *
   * Ordering it this way also fails safe: if the disconnect below throws
   * because they had already gone, the record says they were removed, which is
   * what the host did and what they experienced.
   */
  const admin = createAdminClient();
  const removedAt = new Date().toISOString();

  const { data: session } = await admin
    .from("meeting_participants")
    .select("display_name, user_id")
    .eq("meeting_id", meeting.id)
    .eq("identity", identity)
    .is("left_at", null)
    .maybeSingle();

  await admin
    .from("meeting_participants")
    .update({ removed_at: removedAt })
    .eq("meeting_id", meeting.id)
    .eq("identity", identity)
    .is("left_at", null);

  /**
   * And the block — v1.5 B1, which this route was missing.
   *
   * B1 says "denied and removed people stay out for ten minutes", and only the
   * deny path was writing one. So a removed person could rejoin instantly with
   * the link they still had, and A3's "The host removed you from the meeting"
   * screen was unreachable, because nothing ever wrote that reason.
   *
   * The subject is derived from the identity rather than from a cookie: this
   * request is the *host's*, so there is no device cookie for the person being
   * removed. `user_<uuid>` identities block the account; a guest identity is
   * `guest_<nanoid>`, which is per-connection and not a device — so a removed
   * guest is blocked for this session and can return in a new one, which is a
   * weaker guarantee than the denied path's and is recorded rather than
   * implied. Closing it would mean the room carrying every participant's device
   * id, which is a real cost for a case B2 can already undo.
   */
  /**
   * The durable subject behind this identity — v1.5 B1.
   *
   * `meeting_identities` is written by the token endpoint, the only place that
   * sees both the identity it mints and the device cookie behind it. Without
   * this lookup the block was written against `guest_<nanoid>`, which is minted
   * per connection and never presented twice, so removing a guest kept nobody
   * out.
   *
   * The fallback is the identity itself, which is right for two cases: a
   * signed-in participant, whose identity *is* `user_<uuid>` and durable; and a
   * session that predates this table, where blocking the identity is no worse
   * than the nothing it replaces.
   */
  const { data: known } = await admin
    .from("meeting_identities")
    .select("subject, subject_type")
    .eq("meeting_id", meeting.id)
    .eq("identity", identity)
    .maybeSingle();

  const subject = known
    ? { subject: known.subject, subjectType: known.subject_type }
    : identity.startsWith("user_")
      ? { subject: identity, subjectType: "user" as const }
      : { subject: identity, subjectType: "device" as const };

  await admin.from("meeting_blocks").upsert(
    {
      meeting_id: meeting.id,
      subject: subject.subject,
      subject_type: subject.subjectType,
      reason: "removed",
      expires_at: blockExpiry(),
      display_name: session?.display_name ?? null,
    },
    { onConflict: "meeting_id,subject_type,subject" },
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
