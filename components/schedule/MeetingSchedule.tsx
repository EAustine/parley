"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";

import { ICONS } from "@/lib/icons";
import {
  googleCalendarUrl,
  mailtoInviteUrl,
  outlookCalendarUrl,
} from "@/lib/meetings/calendar-links";
import type { WallClock } from "@/lib/meetings/when";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CopyLinkButton } from "@/components/meetings/CopyLinkButton";
import { FormSection } from "@/components/schedule/FormSection";

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
 * What a host does with a scheduled meeting: send the link, invite people,
 * change it, or call it off — v1.3 D4.
 *
 * The three calendar exports are §3.9's answer to not doing OAuth. Between
 * them they cover every client: Google and Outlook get a prefilled composer,
 * and everything else — Apple Calendar, Thunderbird, Fastmail — takes the file.
 * D4 adds the fourth, which is a `mailto:` and covers the case none of them do:
 * telling a person about it.
 */
export function MeetingSchedule({
  code,
  title,
  description,
  startISO,
  endISO,
  joinUrl,
  cancelled,
  ended,
  wall,
  durationMinutes,
  waitingRoom,
}: {
  code: string;
  title: string;
  description: string | null;
  startISO: string;
  endISO: string;
  joinUrl: string;
  cancelled: boolean;
  ended: boolean;
  wall: WallClock;
  durationMinutes: number;
  /** §3.2's door, so the edit form shows the meeting's real setting. */
  waitingRoom: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  /**
   * The viewer's own zone, resolved **after mount**.
   *
   * It used to be read during render from `Intl`, which on the server is the
   * server's zone — and it gated a whole paragraph, so React sent markup for
   * one zone and hydrated expecting another. Every user outside the deployment
   * region had a live hydration mismatch on this page, and the neighbouring
   * line's `suppressHydrationWarning` could not have covered it: that silences
   * a text difference, not an element that is there in one tree and absent from
   * the other.
   */
  const [viewerZone, setViewerZone] = useState<string | null>(null);
  useEffect(() => {
    setViewerZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const start = new Date(startISO);
  const end = new Date(endISO);
  const zone = wall.timezone;
  const event = { title, description, start, end, url: joinUrl };

  /** "Friday 11 September, 10:00 – 10:30 GMT" — the design's subtitle. */
  const when =
    `${formatInTimeZone(start, zone, "EEEE d MMMM")}, ` +
    `${formatInTimeZone(start, zone, "HH:mm")} – ${formatInTimeZone(end, zone, "HH:mm")} ` +
    formatInTimeZone(start, zone, "zzz");

  /**
   * Compared as the rendered fact, not as zone names — `UTC` and
   * `Africa/Accra` are different strings and the same clock, and a line saying
   * so carries no information about the meeting.
   */
  const shown = (z: string) =>
    `${formatInTimeZone(start, z, "HH:mm")}–${formatInTimeZone(end, z, "HH:mm")} ${formatInTimeZone(start, z, "zzz")}`;
  const elsewhere = viewerZone !== null && shown(viewerZone) !== shown(zone);
  /**
   * Does the viewer's calendar day differ from the meeting's own?
   *
   * 19:56 EDT on Friday is 01:56 on **Saturday** in Berlin, and a second line
   * reading "01:56 – 02:26 GMT+2 where you are" under "Friday 11 September"
   * says the meeting is at two in the morning on the Friday. It is not. That is
   * §3.9's trap exactly — a number that looks checkable and is wrong by a day —
   * and it is the one case the second line exists to catch.
   *
   * Printed only when it differs. Repeating the date on every meeting whose
   * zone happens to be offset is noise; omitting it when it changes is a missed
   * meeting.
   */
  const crossesMidnight =
    viewerZone !== null &&
    formatInTimeZone(start, viewerZone, "yyyy-MM-dd") !==
      formatInTimeZone(start, zone, "yyyy-MM-dd");

  async function cancel() {
    setCancelling(true);
    const response = await fetch(`/api/meetings/${code}`, { method: "DELETE" });
    setCancelling(false);
    setConfirming(false);
    if (!response.ok) {
      toast.error("Couldn't cancel the meeting. Try again.");
      return;
    }
    toast.success("Meeting cancelled");
    router.refresh();
  }

  if (editing) {
    return (
      <ScheduleForm
        existing={{ code, title, description, wall, durationMinutes, waitingRoom }}
        /*
         * Both handlers, and the first one is a bug fix.
         *
         * The form used to `router.push("/schedule/" + code)` on save — the URL
         * it was already on. A no-op navigation, so `editing` never flipped
         * back and the submit button stayed disabled reading "Saving…" for
         * good, with no way out but a reload. The save had worked; nothing
         * threw and nothing was logged.
         *
         * `onCancel` rather than a second button beside the form's own: the
         * design puts Cancel next to the submit, and having one there *and* one
         * below would put two ways out on a page whose next control is
         * "Cancel meeting".
         */
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        {/* The whole slot, not just its start. The subtitle used to print the
            start time and put "30 minutes" on a line of its own, which says
            the same thing in two places and neither of them says when it
            finishes. */}
        <p className="type-body text-muted-foreground">
          {when} · {durationMinutes} minutes
        </p>
        {elsewhere && (
          <p className="type-small text-muted-foreground">
            {crossesMidnight && `${formatInTimeZone(start, viewerZone, "EEE d MMM")}, `}
            {formatInTimeZone(start, viewerZone, "HH:mm")} –{" "}
            {formatInTimeZone(end, viewerZone, "HH:mm")}{" "}
            {formatInTimeZone(start, viewerZone, "zzz")} where you are
          </p>
        )}
        {cancelled && (
          <p className="type-small text-[var(--state-critical)]">
            This meeting was cancelled. The link still resolves, and says so.
          </p>
        )}
        {ended && !cancelled && (
          <p className="type-small text-muted-foreground">This meeting has ended.</p>
        )}
      </div>

      {description && (
        <p className="type-body whitespace-pre-wrap text-muted-foreground">
          {description}
        </p>
      )}

      <FormSection title="Meeting link">
        <div className="flex items-center gap-2">
          {/* `flex-1`, so the box is the row rather than sized to its content
              — and the scheme is dropped. At 12px mono in a truncating box the
              part that gets ellipsed is the end of the string, which is the
              meeting code: the only part of the URL that differs between two
              meetings. */}
          <code className="type-data flex h-11 min-w-0 flex-1 items-center truncate rounded-lg bg-muted px-3 text-muted-foreground">
            {joinUrl.replace(/^https?:\/\//, "")}
          </code>
          {/* `CopyLinkButton`, not a bespoke handler. The one here awaited
              `navigator.clipboard.writeText` with no `catch`, so a refused
              clipboard — an insecure origin, a declined permission — threw
              inside the click handler and produced no toast at all: a button
              that silently did nothing. That path is already handled once. */}
          <CopyLinkButton code={code} label="Copy link" withLabel />
        </div>
        <p className="type-caption text-muted-foreground">
          Anyone with the link can join. They don&rsquo;t need an account.
        </p>
      </FormSection>

      <FormSection title="Invite people">
        <div className="flex flex-wrap gap-2">
          {/* First, and the only one of the four that reaches a person. */}
          <Button asChild variant="secondary" size="sm">
            <a href={mailtoInviteUrl({ ...event, when })}>
              <HugeiconsIcon
                icon={ICONS.mail.icon}
                size={15}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
              Email an invite
            </a>
          </Button>
          {/* A real navigation, not a fetch: the .ics is served with a
              Content-Disposition and the browser's own download handling is
              what puts it where the calendar app can see it. */}
          <Button asChild variant="secondary" size="sm">
            <a href={`/api/meetings/${code}/ics`} download={`${code}.ics`}>
              <HugeiconsIcon
                icon={ICONS.calendar.icon}
                size={15}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
              Download .ics
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Calendar
            </a>
          </Button>
          <Button asChild variant="secondary" size="sm">
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
          The email opens in your own mail app with the time and link filled in.
          The .ics works with Apple Calendar, Thunderbird, and anything else that
          reads invites.
        </p>
      </FormSection>

      {!ended && !cancelled && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-6">
          <Button variant="secondary" size="touch" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {/* Borderless, and the hue is the whole signal — rule 5 spends it on
              destructive actions and this is one. It asks rather than acting:
              there is no un-cancel path in the API, so a misclick was
              unrecoverable from the UI. */}
          <Button
            variant="ghost"
            size="touch"
            onClick={() => setConfirming(true)}
            className="text-[var(--state-critical)] hover:bg-secondary hover:text-[var(--state-critical)]"
          >
            Cancel meeting
          </Button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          id="cancel-meeting"
          title="Cancel this meeting?"
          body={
            <>
              <strong className="font-medium text-foreground">{title}</strong> on{" "}
              {formatInTimeZone(start, zone, "EEEE d MMMM")}. Anyone with the
              link will be told it was cancelled. This can&rsquo;t be undone.
            </>
          }
          confirmLabel="Cancel meeting"
          // Not "Cancel". Two buttons a word apart, one of which cancels the
          // meeting and one of which cancels the cancelling, is the clearest
          // way to make somebody press the wrong one.
          dismissLabel="Keep it"
          pending={cancelling}
          onConfirm={cancel}
          onDismiss={() => !cancelling && setConfirming(false)}
        />
      )}
    </div>
  );
}
