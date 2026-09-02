"use client";

import Link from "next/link";

import { formatMeetingTime } from "@/lib/meetings/format";
import { CopyLinkButton } from "@/components/meetings/CopyLinkButton";
import { Badge } from "@/components/ui/badge";

export type MeetingRowData = {
  id: string;
  code: string;
  title: string;
  scheduled_start: string | null;
  status: "scheduled" | "live" | "ended";
  created_at: string;
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
          {meeting.status === "live" && (
            <Badge variant="secondary" className="type-caption">
              Live
            </Badge>
          )}
          {meeting.scheduled_start === null && !past && (
            <Badge variant="outline" className="type-caption">
              Instant
            </Badge>
          )}
        </div>

        <div className="type-small flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <span suppressHydrationWarning>{formatMeetingTime(when)}</span>
          {/* Selectable as a unit: mono, letter-spaced, and one text node. */}
          <code className="type-data select-all tracking-[0.08em]">
            {meeting.code}
          </code>
          {past && (
            <span>
              {meeting.participantCount}{" "}
              {meeting.participantCount === 1 ? "participant" : "participants"}
            </span>
          )}
        </div>
      </div>

      {!past && (
        <div className="flex shrink-0 items-center gap-2">
          <CopyLinkButton code={meeting.code} />
          <Link
            href={`/j/${meeting.code}`}
            className="type-small rounded-md px-3 py-2 underline underline-offset-4"
          >
            Join
          </Link>
        </div>
      )}
    </li>
  );
}
