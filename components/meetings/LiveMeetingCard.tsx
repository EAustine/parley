"use client";

import Link from "next/link";

import { formatElapsed } from "@/lib/meetings/format";
import { CopyLinkButton } from "@/components/meetings/CopyLinkButton";
import type { MeetingRowData } from "@/components/meetings/MeetingRow";

/**
 * v1.3 D1's block, above the filter and outside both lists — because a meeting
 * that is happening is neither something to be at nor something you came out
 * of.
 *
 * ## It holds two different things, and they must read differently
 *
 * A1's revised table puts a **scheduled meeting inside its own window** here
 * too, not only a `live` one. That is the hole the first table had: at 10:15 in
 * a 10:00–10:30 booking that nobody has joined, `status = 'live'` is false and
 * `scheduled_start > now()` is false, so a two-way split had nowhere to put it.
 *
 * One has people in it. The other is due and empty, and saying "Started 3
 * minutes ago" alone would send someone into an empty room expecting company.
 * So the empty one says so, and says it in the same sentence.
 *
 * The distinction is carried in **value, not hue** — a `--muted-foreground` dot
 * against `--foreground`, and a secondary Join against a primary one. Rule 5,
 * and the same reasoning that made the dot neutral in the first place.
 *
 * ## The dot is neutral, and that was a decision
 *
 * The design draws it in `--state-critical` with a `color-mix` halo. Rule 5
 * spends hue on two things only — destructive actions and connection warnings —
 * and names "active speaker" among the things that must instead be "encoded in
 * weight, fill, and value". A live meeting is the dashboard's active speaker.
 *
 * So: a solid `--foreground` dot at 17.29:1, no halo. It loses nothing, because
 * the dot was never carrying the meaning on its own — the card, its boundary,
 * its position above the filter and a primary Join all say the same thing. Red
 * would have been a third permitted use of hue, and rule 5 would have had to
 * say so.
 *
 * ## The count, back with A2
 *
 * It was removed in D1 because nothing wrote `meeting_participants` — the
 * webhook handled `room_started` and `room_finished` and no participant events,
 * so every figure was structurally zero and a live meeting read "0 people". A
 * wrong number, not a missing one.
 *
 * A2 wired the writer, and this block wants the one that answers **how many are
 * connected right now** — `here`, the sessions with no `left_at` — not how many
 * ever arrived. On a meeting three people passed through and left, the two
 * differ by three, and putting the wrong one here would say a room is full when
 * it is empty.
 *
 * Shown only when it is non-zero. A `live` meeting with nobody in it is the
 * webhook lagging behind the room, and "0 people" beside "Started 14 minutes
 * ago" invites a reader to trust a number they should not — the due-but-empty
 * card says "no one has joined yet" from `status`, which is a fact rather than
 * a count.
 */
export function LiveMeetingCard({
  meeting,
  now,
}: {
  meeting: MeetingRowData;
  /**
   * The render clock, passed in rather than read here.
   *
   * The server already computes the partition from one `Date.now()`; taking a
   * second reading in the browser would let a row be bucketed as live against
   * one clock and described against another. It is also what makes this
   * testable without freezing time globally.
   */
  now: number;
}) {
  /**
   * Someone is actually in it, as opposed to it being due.
   *
   * Read from `status` rather than passed in: the row already carries the
   * distinction, and the partition deliberately does not — it answers *which
   * section*, and this answers *which sentence*.
   */
  const joined = meeting.status === "live";

  /**
   * When it started, or was due to.
   *
   * `scheduled_start` before `created_at`, and that ordering is the whole of
   * this line. A meeting booked last Tuesday for today at 10:00 has a
   * `created_at` a week old and no `started_at` until somebody arrives — so
   * falling through to `created_at` would greet a meeting that is three minutes
   * overdue with "Started 7 days ago".
   */
  const since =
    meeting.started_at ?? meeting.scheduled_start ?? meeting.created_at;

  return (
    <div
      className="flex items-center gap-3.5 rounded-xl border bg-card p-4"
      style={{ borderColor: "var(--boundary)" }}
    >
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full ${joined ? "bg-foreground" : "bg-muted-foreground"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{meeting.title}</p>
        <p className="type-small text-muted-foreground">
          {formatElapsed(since, now)}
          {!joined && " · no one has joined yet"}
          {joined && meeting.here > 0 && (
            <>
              {" · "}
              {meeting.here} {meeting.here === 1 ? "person" : "people"}
            </>
          )}
        </p>
      </div>
      {/*
        Copy link, which the design's live block does not have.
        
        It is not an addition so much as a removal avoided: a live meeting used
        to render as an ordinary row and carried this button, and the block that
        replaced the row is the one place inviting someone matters most — a
        meeting that is happening is the one you are asked to send the link to.
        Losing it would have been a regression the design was not drawn against.
        Secondary, and quiet, so Join is still the thing the block points at.
      */}
      <CopyLinkButton code={meeting.code} />

      {/* Primary when there are people to join, secondary when there are not —
          the design's `.btn-primary.btn-sm` against `.btn-secondary.btn-sm`.
          36px clears the 24px floor this surface is held to; the room's 44 is a
          room rule. */}
      <Link
        href={`/j/${meeting.code}`}
        className={`type-small inline-flex h-9 shrink-0 items-center rounded-md px-4 font-medium ${
          joined
            ? "bg-primary text-primary-foreground"
            : "border bg-secondary text-foreground"
        }`}
        style={joined ? undefined : { borderColor: "var(--boundary)" }}
      >
        Join
      </Link>
    </div>
  );
}
