import "server-only";

import { NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";

import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * LiveKit's room lifecycle, written back to `meetings.status`.
 *
 * §7 lists this route and `CLAUDE.md`'s file layout names the file, but no
 * phase task list ever asked for it, which is how it went missing for seven
 * phases. What that cost is larger than it sounds: nothing in the product
 * wrote `status = 'live'` or `'ended'`, so a meeting that ran and emptied
 * stayed whatever it was created as, forever. The dashboard's past section
 * could not fill, the "Live" badge could not render, and §3.2's ended page —
 * with all the enum work that separated ended from cancelled — was unreachable
 * for every meeting that actually took place.
 *
 * A host pressing "End meeting" would cover some of it and not the host who
 * shuts a laptop, and `beforeunload` is not reliable enough to substitute. The
 * server is the only party that knows when a room really emptied.
 *
 * **Four events, and this paragraph used to say two.**
 *
 * It read: "Two events, deliberately. `participant_joined` and
 * `participant_left` arrive far more often and would tell us nothing
 * `room_started` and `room_finished` do not." That was true when the meeting's
 * lifecycle was all this recorded, and it stopped being true when v1.5 C1 added
 * the attendance record, which is built entirely from `meeting_participants` —
 * a table only `participant_joined` writes.
 *
 * **The sentence outlived the design and the configuration followed the
 * sentence.** The handlers below were added; the events were never enabled in
 * LiveKit Cloud, because the paragraph at the top of the file said they were
 * not wanted. A host held a meeting with six people in it and the record read
 * "Nobody joined this meeting": every one of them was admitted through the
 * queue, and not one `participant_joined` ever arrived. The only rows this
 * table has ever held came from `seed-dev`.
 *
 * **This file cannot enforce that.** `check:webhook` signs synthetic events and
 * posts them here, which proves the handlers work and can say nothing about
 * what LiveKit is configured to send — the failure was in the half we do not
 * control, and both checks only ever looked at ours. `MANUAL.md` carries the
 * one-line check that does cover it.
 *
 * The four events this route handles are `room_started`, `room_finished`,
 * `participant_joined`, and `participant_left` (with
 * `participant_connection_aborted` alongside the last). **All four must be
 * enabled on the webhook**, or the attendance record is silently empty.
 *
 * Rule 8d: `server-only` at the top. This module holds a service-role client
 * and the API secret, and importing it from a client component should be a
 * build error rather than a silent inclusion.
 */

/**
 * The signature covers the raw bytes, so the body must not be parsed first.
 * `request.json()` would consume the stream and re-serialising afterwards
 * would produce a different string and a failed check — for spacing, or key
 * order, neither of which is visible in a diff.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const receiver = new WebhookReceiver(
    serverEnv.LIVEKIT_API_KEY,
    serverEnv.LIVEKIT_API_SECRET,
  );

  let event;
  try {
    const body = await request.text();
    const authorization = request.headers.get("Authorization") ?? undefined;
    // Throws on a bad signature, a missing header, or a stale timestamp.
    event = await receiver.receive(body, authorization);
  } catch {
    // Deliberately not specific. Anyone can POST here, and telling an
    // unauthenticated caller *why* their signature failed is free help.
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const code = event.room?.name;
  if (!code) {
    // Well-formed and signed, but about nothing we track — an egress or
    // ingress event, say. Acknowledged so LiveKit stops retrying it.
    return NextResponse.json({ ok: true });
  }

  // Service-role: this is infrastructure the caller must not be able to
  // influence, which is the same reason the rate limiter uses it. There is no
  // session here to run RLS against — the caller is LiveKit, and the signature
  // is what authorises the write.
  const supabase = createAdminClient();

  if (event.event === "room_started") {
    // `started_at` is only set once. A room can be started, emptied, and
    // started again by someone rejoining, and the first arrival is the honest
    // answer to "when did this meeting begin" — it is also what §3.2's 12h
    // expiry reads to mean "never joined".
    const { error } = await supabase
      .from("meetings")
      .update({ status: "live", started_at: new Date().toISOString() })
      .eq("code", code)
      .is("started_at", null);
    if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });

    // A room restarted after ending goes live again, without moving
    // `started_at`.
    await supabase
      .from("meetings")
      .update({ status: "live" })
      .eq("code", code)
      .eq("status", "ended");

    return NextResponse.json({ ok: true });
  }

  if (event.event === "room_finished") {
    // Cancelled is not overwritten. A host who cancels a scheduled meeting
    // that someone had already opened would otherwise have the cancellation
    // silently rewritten to "ended" when the empty room closed — and §3.2 is
    // explicit that those are different events which must not be conflated.
    const { error } = await supabase
      .from("meetings")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("code", code)
      .neq("status", "cancelled");
    if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });

    /*
     * And close every session still open in it — v1.3 A2.
     *
     * `participant_left` is emitted per participant, but a room torn down by
     * `deleteRoom` — which is what "End meeting" does — is not obliged to send
     * one for everybody on the way out. A row left open after that counts
     * toward "here now" forever, on a meeting that has ended: the live count
     * would be the only number on the dashboard that never settles.
     *
     * Failure here does not fail the delivery. The meeting is already correctly
     * marked ended, and returning 500 would have LiveKit retry the whole event
     * — re-stamping `ended_at` to a later time to fix a participant count.
     */
    const meetingId = await supabase
      .from("meetings")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (meetingId.data) {
      await supabase
        .from("meeting_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("meeting_id", meetingId.data.id)
        .is("left_at", null);
    }

    return NextResponse.json({ ok: true });
  }

  /* ---------------------------------------------------------------- *
   * v1.3 A2: who is in the room.
   *
   * `meeting_participants` has existed since the first migration and until now
   * had **no writer anywhere in the application** — only `scripts/seed-dev.mjs`
   * inserted rows. So every count read from it was structurally zero, and the
   * dashboard was rendering "0 participants" on past meetings whatever had
   * actually happened. A wrong number, not a missing one.
   *
   * A row is a **session**: it opens on arrival and closes on departure. That
   * is what makes the two counts D1 asks for fall out of one table — every row
   * for "how many joined", `left_at is null` for "how many are here now" —
   * rather than needing a second one.
   * ---------------------------------------------------------------- */

  if (event.event === "participant_joined") {
    const participant = event.participant;
    if (!participant?.identity) return NextResponse.json({ ok: true });

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    // A room for a meeting we do not have. LiveKit will happily open one for
    // any name; acknowledged so it stops retrying.
    if (!meeting) return NextResponse.json({ ok: true });

    /*
     * Identity is derived server-side by the token route: `user_<uuid>` for a
     * signed-in participant, `guest_<nanoid>` for everyone else. Splitting it
     * back apart here is the only way to attribute a session to an account —
     * the webhook carries no session of its own.
     */
    const userId = participant.identity.startsWith("user_")
      ? participant.identity.slice("user_".length)
      : null;

    let role = "participant";
    /*
     * **`displayName`, not `name` — and reading the wrong key made every
     * attendance row say "Guest".**
     *
     * The token writes `{ displayName, role }`; this read `meta.name`, which
     * has never existed in that object. `role` sat directly beside it and was
     * read correctly, so the metadata parsed, the object was right, and one of
     * the two fields silently fell through to its default. Nothing failed — the
     * rows were written, with the wrong name on every one.
     *
     * `participant.name` stays as the fallback, and it is empty in practice:
     * the token sets `identity` and `metadata` and no `name` claim.
     * `displayNameOf` uses the same precedence for the room's own surfaces and
     * says why — "ours travels in metadata" — so the webhook now agrees with
     * the client instead of quietly disagreeing.
     */
    let name = participant.name?.trim() || "Guest";
    try {
      // The token puts `{ displayName, role }` here rather than in the
      // identity, because both are labels and labels change.
      const meta = JSON.parse(participant.metadata || "{}") as {
        displayName?: unknown;
        role?: unknown;
      };
      if (meta.role === "host" || meta.role === "participant") role = meta.role;
      if (typeof meta.displayName === "string" && meta.displayName.trim()) {
        name = meta.displayName.trim();
      }
    } catch {
      // Metadata is a string LiveKit hands back untouched. Malformed is a
      // reason to fall back to the participant's name, not to drop the row.
    }

    /*
     * Only if they are not already here.
     *
     * LiveKit retries a delivery it did not get a 2xx for, so one arrival can
     * produce two `participant_joined` events — and a second open row would
     * make the live count read one too many for the rest of the meeting.
     *
     * A check-then-insert, which `CLAUDE.md` warns about for meeting codes and
     * for the same reason: two concurrent retries can both find nothing. That
     * one case is closed by `mp_open_session_idx`, a partial unique index on
     * the open rows — and the insert below tolerates its violation rather than
     * failing the delivery, so this route is correct before the migration is
     * applied and airtight afterwards.
     */
    const { data: open } = await supabase
      .from("meeting_participants")
      .select("id")
      .eq("meeting_id", meeting.id)
      .eq("identity", participant.identity)
      .is("left_at", null)
      .maybeSingle();
    if (open) return NextResponse.json({ ok: true });

    const { error } = await supabase.from("meeting_participants").insert({
      meeting_id: meeting.id,
      user_id: userId,
      display_name: name,
      identity: participant.identity,
      role,
    });
    // 23505 is unique_violation — the index doing its job against a race, which
    // means the row this delivery wanted is already there.
    if (error && error.code !== "23505") {
      return NextResponse.json({ error: "write_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  /*
   * `participant_connection_aborted` is handled alongside `participant_left`.
   *
   * It fires when a connection fails before it is established, which usually
   * means there is no open row to close and the update matches nothing —
   * harmless. When there *is* one, closing it is the difference between a live
   * count that settles and one that never comes down.
   */
  if (
    event.event === "participant_left" ||
    event.event === "participant_connection_aborted"
  ) {
    const identity = event.participant?.identity;
    if (!identity) return NextResponse.json({ ok: true });

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!meeting) return NextResponse.json({ ok: true });

    // `is("left_at", null)` so a retry cannot rewrite a departure time that is
    // already recorded, and cannot reopen and reclose an older session.
    const { error } = await supabase
      .from("meeting_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("meeting_id", meeting.id)
      .eq("identity", identity)
      .is("left_at", null);
    if (error) return NextResponse.json({ error: "write_failed" }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  // Signed, understood, and not one of ours.
  return NextResponse.json({ ok: true });
}
