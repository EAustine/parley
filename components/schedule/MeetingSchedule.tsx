"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

import { ICONS } from "@/lib/icons";
import {
  googleCalendarUrl,
  outlookCalendarUrl,
} from "@/lib/meetings/calendar-links";
import { formatMeetingTime, viewerTimeZone } from "@/lib/meetings/format";
import type { WallClock } from "@/lib/meetings/when";
import { Button } from "@/components/ui/button";
import { formatInTimeZone } from "date-fns-tz";

/**
 * The edit form is the heaviest thing on this page and most visits never open
 * it — a host comes here to copy the link or add the meeting to a calendar.
 * Loaded on demand for the same reason `livekit-client` is: weight that only
 * some visits need should only be fetched by those visits.
 */
const ScheduleForm = dynamic(
  () => import("@/components/schedule/ScheduleForm").then((m) => m.ScheduleForm),
  { loading: () => <p className="type-small text-muted-foreground">Loading the form…</p> },
);

/**
 * What a host does with a scheduled meeting: send the link, put it in a
 * calendar, change it, or call it off.
 *
 * The three calendar exports are §3.9's answer to not doing OAuth. Between
 * them they cover every client: Google and Outlook get a prefilled composer,
 * and everything else — Apple Calendar, Thunderbird, Fastmail — takes the file.
 */
export function MeetingSchedule({
  code,
  title,
  description,
  startISO,
  endISO,
  joinUrl,
  ended,
  wall,
  durationMinutes,
}: {
  code: string;
  title: string;
  description: string | null;
  startISO: string;
  endISO: string;
  joinUrl: string;
  ended: boolean;
  wall: WallClock;
  durationMinutes: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const start = new Date(startISO);
  const end = new Date(endISO);
  const event = { title, description, start, end, url: joinUrl };

  const viewer = viewerTimeZone();
  const elsewhere = viewer !== wall.timezone;

  async function cancel() {
    setCancelling(true);
    const response = await fetch(`/api/meetings/${code}`, { method: "DELETE" });
    setCancelling(false);
    if (!response.ok) {
      toast.error("Couldn't cancel the meeting. Try again.");
      return;
    }
    toast.success("Meeting cancelled");
    router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-6">
        <ScheduleForm
          existing={{ code, title, description, wall, durationMinutes }}
        />
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancel editing
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        {/* §3.9: always print the zone label. Both zones when they differ —
            the number alone is only checkable next to the zone it is in. */}
        <p className="type-body">
          <span suppressHydrationWarning>{formatMeetingTime(startISO)}</span>
        </p>
        {elsewhere && (
          <p className="type-small text-muted-foreground">
            {formatInTimeZone(start, wall.timezone, "EEE d MMM, HH:mm zzz")} where
            it was scheduled
          </p>
        )}
        <p className="type-small text-muted-foreground">
          {durationMinutes} minutes
        </p>
        {ended && (
          <p className="type-small text-[var(--state-critical)]">
            This meeting has been cancelled.
          </p>
        )}
      </section>

      {description && (
        <p className="type-body whitespace-pre-wrap text-muted-foreground">
          {description}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="type-h2">Meeting link</h2>
        <div className="flex items-center gap-3">
          <code className="type-data truncate rounded-lg bg-muted px-3 py-2">
            {joinUrl}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(joinUrl);
              // The action keeps its name through the flow — CLAUDE.md's copy
              // voice: "Copy link" produces "Link copied".
              toast.success("Link copied");
            }}
          >
            <HugeiconsIcon
              icon={ICONS.copy.icon}
              size={16}
              strokeWidth={1.5}
              color="currentColor"
              aria-hidden
            />
            Copy link
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="type-h2">Add to calendar</h2>
        <div className="flex flex-wrap gap-2">
          {/* A real navigation, not a fetch: the .ics is served with a
              Content-Disposition and the browser's own download handling is
              what puts it where the calendar app can see it. */}
          <Button asChild variant="outline" size="sm">
            <a href={`/api/meetings/${code}/ics`} download={`${code}.ics`}>
              <HugeiconsIcon
                icon={ICONS.calendar.icon}
                size={16}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
              Download .ics
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Calendar
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={outlookCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Outlook
            </a>
          </Button>
        </div>
        <p className="type-caption text-muted-foreground">
          The file works with Apple Calendar, Thunderbird, and anything else
          that reads calendar invites.
        </p>
      </section>

      {!ended && (
        <section className="flex flex-wrap gap-2 border-t pt-6">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={cancel}
            disabled={cancelling}
            className="text-[var(--state-critical)]"
          >
            {cancelling ? "Cancelling…" : "Cancel meeting"}
          </Button>
        </section>
      )}
    </div>
  );
}
