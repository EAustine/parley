"use client";

import Link from "next/link";

import { formatElapsed } from "@/lib/meetings/format";
import { CopyLinkButton } from "@/components/meetings/CopyLinkButton";
import type { MeetingRowData } from "@/components/meetings/MeetingRow";

/**
 * v1.3 D1's live block: "Live is its own block above the filter."
 *
 * Its own card, above the segmented control and outside both lists — because a
 * meeting that is happening is neither something to be at nor something you
 * came out of. `partitionMeetings` has returned it as a third bucket since A1;
 * this is the presentation that bucket was waiting for.
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
 * ## No participant count
 *
 * The design prints "3 people". Nothing in this application ever writes
 * `meeting_participants` — the LiveKit webhook handles `room_started` and
 * `room_finished` and no participant events, so the only writer is the dev
 * seeder. The count is structurally zero, and a live meeting reading "0 people"
 * is worse than a live meeting saying nothing about who is in it.
 *
 * It belongs to A2, which is the item that would create the writer. Until then
 * the honest render omits it — and the same reasoning removed the figure from
 * past rows, where "0 participants" has been shipping.
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
  const since = meeting.started_at ?? meeting.created_at;

  return (
    <div
      className="flex items-center gap-3.5 rounded-xl border bg-card p-4"
      style={{ borderColor: "var(--boundary)" }}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-foreground"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{meeting.title}</p>
        <p className="type-small text-muted-foreground">
          {formatElapsed(since, now)}
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

      {/* The design's `.btn-primary.btn-sm`. 36px clears the 24px floor this
          surface is held to — the room's 44 is a room rule. */}
      <Link
        href={`/j/${meeting.code}`}
        className="type-small inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
      >
        Join
      </Link>
    </div>
  );
}
