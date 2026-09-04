"use client";

import Link from "next/link";

import { formatMeetingTime } from "@/lib/meetings/format";
import type { MeetingStatus } from "@/lib/supabase/types";
import { CopyLinkButton } from "@/components/meetings/CopyLinkButton";
import { Badge } from "@/components/ui/badge";

export type MeetingRowData = {
  id: string;
  code: string;
  title: string;
  scheduled_start: string | null;
  /** Both read by `partitionMeetings` — see `lib/meetings/partition.ts`. */
  scheduled_end: string | null;
  status: MeetingStatus;
  created_at: string;
  started_at: string | null;
  participantCount: number;
};

/**
 * A client component because the time must be rendered in the *viewer's* zone,
 * which the server does not know. Rendering it on the server would print the
 * server's zone and hydrate into a different string.
 */
export function MeetingRow({
  meeting,
  past,
}: {
  meeting: MeetingRowData;
  past: boolean;
}) {
  const when = meeting.scheduled_start ?? meeting.created_at;

  return (
    <li className="flex items-center gap-4 py-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="type-body truncate">{meeting.title}</span>
          {/* One badge at most. "Live" and "Instant" were both rendering on a
              live instant meeting, which says the same thing twice and buries
              the half that matters. Live is what is happening now; instant is
              only how it was created. */}
          {meeting.status === "live" ? (
            <Badge variant="secondary" className="type-caption">
              Live
            </Badge>
          ) : meeting.status === "cancelled" ? (
            /* §3.2: cancelled meetings appear under past "labelled as
               cancelled rather than silently mixed in with meetings that took
               place". The label is the only thing distinguishing them. */
            <Badge variant="outline" className="type-caption">
              Cancelled
            </Badge>
          ) : meeting.scheduled_start === null && !past ? (
            <Badge variant="outline" className="type-caption">
              Instant
            </Badge>
          ) : null}
        </div>

        <div className="type-small flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span suppressHydrationWarning>{formatMeetingTime(when)}</span>
          {/* Selectable as a unit: mono, letter-spaced, and one text node. */}
          <code className="type-data select-all tracking-[0.08em]">
            {meeting.code}
          </code>
          {past && meeting.status !== "cancelled" && (
            <span>
              {meeting.participantCount}{" "}
              {meeting.participantCount === 1 ? "participant" : "participants"}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* A scheduled meeting has a page of its own: the calendar exports and
            the form to change it. Reachable whether or not it has passed —
            §3.9 keeps past meetings around, and a host still wants to see what
            was arranged. */}
        {meeting.scheduled_start !== null && (
          <Link
            href={`/schedule/${meeting.code}`}
            className="type-small rounded-md px-3 py-2 underline underline-offset-4"
          >
            Details
          </Link>
        )}
        {!past && (
          <>
            <CopyLinkButton code={meeting.code} />
            <Link
              href={`/j/${meeting.code}`}
              className="type-small rounded-md px-3 py-2 underline underline-offset-4"
            >
              Join
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
