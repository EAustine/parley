"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";

import { PAST_GRACE_MS } from "@/lib/meetings/schema";
import {
  browserTimeZone,
  resolveWallClock,
  timeZoneGroups,
  timeZoneLabel,
  type WallClock,
} from "@/lib/meetings/when";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormSection } from "@/components/schedule/FormSection";

/**
 * §3.9's form, restructured by v1.3 D3 into **three questions rather than a
 * flat stack of six fields**: what it is, when it is, check it.
 *
 * Native state and one parse on submit, not `react-hook-form` — §10 makes that
 * call for `/j/[code]` and the reasoning carries here: six fields, one submit,
 * and the server validates again regardless.
 *
 * The zone is a default, not a decision. People schedule meetings for where the
 * other person is, so it is editable and it is prominent.
 */

const DURATIONS = [15, 30, 45, 60, 90] as const;


export function ScheduleForm({
  /** Present when editing; absent when creating. */
  existing,
  /** Called instead of navigating, when the form is embedded in a page that
   *  already shows the meeting — see `MeetingSchedule`. */
  onSaved,
  /** Leaving without saving, when the caller can stay on the page. */
  onCancel,
  /**
   * Leaving without saving, when it means going somewhere else.
   *
   * Two props rather than one because the two callers genuinely differ: the
   * detail page returns to a view it is already rendering, and the create page
   * has nothing to return to but the list. A single `onCancel` would have made
   * the create page a client component to hold one `router.push`.
   */
  cancelHref,
}: {
  existing?: {
    code: string;
    title: string;
    description: string | null;
    wall: WallClock;
    durationMinutes: number;
  };
  onSaved?: () => void;
  onCancel?: () => void;
  cancelHref?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [date, setDate] = useState(existing?.wall.date ?? "");
  const [time, setTime] = useState(existing?.wall.time ?? "10:00");
  const [timezone, setTimezone] = useState(existing?.wall.timezone ?? "");
  const [durationMinutes, setDuration] = useState(
    existing?.durationMinutes ?? 30,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The browser's zone and tomorrow's date, read **after mount**.
   *
   * Both were computed during render — one in a `useState` initialiser, one in
   * the body — and both depend on `Intl` resolving to the machine's zone. On
   * the server that is the server's, so the markup React sent and the markup
   * React expected disagreed whenever the two differed, which is every user not
   * sitting in the deployment region. `usePlatform` and `ThemeToggle` already
   * carry this pattern for the same reason.
   */
  useEffect(() => {
    if (existing) return;
    setTimezone((was) => was || browserTimeZone());
    setDate((was) => was || defaultDate());
  }, [existing]);

  const groups = useMemo(() => timeZoneGroups(timezone || "UTC"), [timezone]);

  /**
   * Today, in the browser's own zone — the floor on the date field.
   *
   * `min` is a hint rather than a guarantee: it greys out earlier days in the
   * picker and is trivially bypassed by typing. That is the right weight for
   * it. The instant is checked below, and again on the server, because a tab
   * left open overnight can submit a time that was future when the page loaded.
   */
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(formatInTimeZone(new Date(), browserTimeZone(), "yyyy-MM-dd"));
  }, []);

  // Resolved on every keystroke, because the answer is what gets stored and
  // the person should be able to see it before they commit to it.
  const resolved = useMemo(() => {
    if (!date || !timezone) return null;
    try {
      return resolveWallClock({ date, time, timezone });
    } catch {
      return null;
    }
  }, [date, time, timezone]);

  /**
   * Has the chosen moment already gone?
   *
   * Read from the resolved instant rather than from the date, because the date
   * alone cannot answer it: 09:00 today is past by lunchtime, and 23:00 today
   * in Auckland is yesterday evening in Los Angeles. The same `PAST_GRACE_MS`
   * the server uses, imported rather than repeated — a form that disables at a
   * different boundary from the one that rejects is a form that refuses
   * something the server would have taken, or offers something it will not.
   */
  const inThePast =
    resolved !== null && resolved.instant.getTime() <= Date.now() - PAST_GRACE_MS;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!resolved) return;
    setSubmitting(true);
    setError(null);

    const payload = existing
      ? {
          title: title.trim(),
          description: description.trim() || null,
          scheduledStart: resolved.instant.toISOString(),
          durationMinutes,
          timezone,
        }
      : {
          kind: "scheduled" as const,
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledStart: resolved.instant.toISOString(),
          durationMinutes,
          timezone,
        };

    try {
      const response = await fetch(
        existing ? `/api/meetings/${existing.code}` : "/api/meetings",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const { error: reason } = (await response
          .json()
          .catch(() => ({ error: "unknown" }))) as { error: string };
        setSubmitting(false);
        setError(message(reason));
        return;
      }

      const meeting = (await response.json()) as { code: string };
      /*
       * `onSaved` when the caller is already showing this meeting.
       *
       * Editing from the detail page used to `router.push` to the URL it was
       * already on — a no-op navigation — so the page stayed in edit mode with
       * its button reading "Saving…" and disabled, permanently, with no way
       * back but a reload. Nothing threw and nothing was logged; the save had
       * in fact worked.
       */
      if (onSaved) {
        setSubmitting(false);
        router.refresh();
        onSaved();
        return;
      }
      router.push(`/schedule/${meeting.code}`);
      router.refresh();
    } catch {
      setSubmitting(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      <FormSection title="What it is">
        <div className="space-y-2">
          <Label htmlFor="title" className="type-small">
            Title
          </Label>
          <Input
            id="title"
            size="touch"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Design review"
            maxLength={120}
            required
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="type-small">
            Description <span className="text-muted-foreground">(optional)</span>
          </Label>
          {/* A boundary, like every other field on this form. It was a bare
              textarea on a filled `--input` surface — the only control here
              with no edge, and `--input` is not a boundary token: at 1.44:1
              dark it fails SC 1.4.11, which is exactly why `--boundary`
              exists. */}
          <textarea
            id="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder="What this is about, and anything people should bring."
            className="w-full resize-y rounded-lg border bg-transparent px-3 py-2.5 type-body text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--ring)]"
            style={{ borderColor: "var(--boundary)", minHeight: "88px" }}
          />
        </div>
      </FormSection>

      <FormSection title="When it is">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="date" className="type-small">
              Date
            </Label>
            <Input
              id="date"
              size="touch"
              type="date"
              min={today || undefined}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="time" className="type-small">
              Start time
            </Label>
            {/*
              **Native everywhere, at 15-minute steps** — v1.3 D3, reversing its
              own earlier call and mine.
              
              A 15-minute select over 24 hours is 96 options, and a browser
              renders that as a popup taller than the viewport — a worse problem
              than a spinner that looks slightly different across browsers.
              Native also types ("1430"), gives a phone the OS wheel, and has no
              popup to be too long.
              
              `step={900}` is what makes the arrows move in quarter hours; it
              does not stop somebody typing 10:07, and nothing should. The
              select could only offer the grid, which is a narrower promise than
              the field needs to keep.
            */}
            <Input
              id="time"
              size="touch"
              type="time"
              step={900}
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
            <p className="type-caption text-muted-foreground">
              Type it, or use the arrows. 15-minute steps.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="duration" className="type-small">
              Duration
            </Label>
            <Select
              id="duration"
              size="touch"
              value={String(durationMinutes)}
              onChange={(event) => setDuration(Number(event.target.value))}
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={String(minutes)}>
                  {minutes} minutes
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timezone" className="type-small">
              Timezone
            </Label>
            <Select
              id="timezone"
              size="touch"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {groups.map((group) => (
                <optgroup key={group.region} label={group.region}>
                  {group.zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {resolved
                        ? timeZoneLabel(zone, resolved.instant)
                        : zone.replace(/_/g, " ")}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        </div>
      </FormSection>

      <FormSection title="Check it">
        <SchedulePreview
          title={title}
          durationMinutes={durationMinutes}
          timezone={timezone}
          resolved={resolved}
          inThePast={inThePast}
        />
      </FormSection>

      {error && (
        <p role="alert" className="type-small text-[var(--state-critical)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="touch"
          disabled={submitting || title.trim().length === 0 || !resolved || inThePast}
        >
          {submitting
            ? existing
              ? "Saving…"
              : "Scheduling…"
            : existing
              ? "Save changes"
              : "Schedule meeting"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="touch" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {cancelHref && (
          <Button asChild variant="ghost" size="touch">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * D3: "The preview is computed from the form, not static copy."
 *
 * ## Two zones at most, and neither of them is UTC
 *
 * D3 asks for "the UTC equivalent when the selected zone is not UTC", and that
 * is not what this renders. The card's job is letting the host confirm they
 * have not made a mistake, and the mistake available is a time that is wrong
 * for them or wrong for the other party — so the only two zones that can be
 * relevant are the meeting's and the viewer's.
 *
 * UTC serves neither, and it is loudest in the commonest case: a Berlin host
 * scheduling a Berlin meeting gets no "where you are" line, because there is no
 * mismatch, and a UTC line nobody in the meeting will ever use. The spec's own
 * example hides this — it was written from Accra, which *is* GMT+0, so there
 * "UTC" and "where you are" are the same line.
 *
 * The neutral-anchor job is real and already done better elsewhere: the `.ics`
 * and the calendar prefills carry the absolute instant, and `/j/[code]` renders
 * in each viewer's own zone.
 *
 * ## It degrades rather than disappearing
 *
 * A half-typed date used to remove the whole card, so the section with the
 * heading "Check it" had nothing in it at the moment there was something to
 * check. The frame stays and says what is missing.
 */
function SchedulePreview({
  title,
  durationMinutes,
  timezone,
  resolved,
  inThePast,
}: {
  title: string;
  durationMinutes: number;
  timezone: string;
  resolved: ReturnType<typeof resolveWallClock> | null;
  inThePast: boolean;
}) {
  const viewer = browserTimeZone();
  const end = resolved
    ? new Date(resolved.instant.getTime() + durationMinutes * 60_000)
    : null;
  /**
   * Does the viewer's zone actually say something different?
   *
   * Compared as the **rendered fact**, not as zone names. `UTC` and
   * `Africa/Accra` are different strings and the same clock, so a name
   * comparison prints "10:00 GMT where you are" under "10:00 GMT" — a line
   * whose only content is that two identifiers differ. Europe/London against
   * UTC has the same problem for half the year and not the other half, which
   * is worse: it looks deliberate.
   */
  const shown = (zone: string) =>
    resolved && end
      ? `${formatInTimeZone(resolved.instant, zone, "HH:mm")}–${formatInTimeZone(end, zone, "HH:mm")} ${formatInTimeZone(resolved.instant, zone, "zzz")}`
      : "";
  const elsewhere = resolved !== null && shown(viewer) !== shown(timezone);
  /**
   * The viewer's calendar day, when it is not the meeting's.
   *
   * 10:00 in New York is 16:00 the same day in Berlin, but 22:00 in New York is
   * 04:00 the *next* day — and a preview whose second line says "04:00 where
   * you are" under "Friday" is a meeting scheduled for the wrong Friday. §3.9's
   * trap, in the card built to catch it.
   */
  const crossesMidnight =
    resolved !== null &&
    formatInTimeZone(resolved.instant, viewer, "yyyy-MM-dd") !==
      formatInTimeZone(resolved.instant, timezone, "yyyy-MM-dd");

  return (
    <div
      className="rounded-xl border bg-card p-4"
      style={{ borderColor: "var(--boundary)" }}
      /*
       * Announced, politely, and this is the one place on the form where that
       * is not decoration: §3.9 calls the timezone the single spot where a
       * quiet bug produces a missed meeting, and D3 makes this card the
       * safeguard against it. A safeguard only a sighted person can read is
       * half a safeguard.
       *
       * `polite` and not `assertive`: it changes on every keystroke in the
       * title field, and an assertive region would interrupt the typing that
       * caused it.
       */
      role="status"
      aria-live="polite"
    >
      <p className="type-body font-semibold">
        {/* "so the card does not jump while typing" — D3. */}
        {title.trim() || "Untitled meeting"}
      </p>
      {resolved && end ? (
        <div className="type-small mt-1 space-y-0.5 text-muted-foreground">
          <p>
            {/* The day spelled out and the zone in bold: the two things being
                checked, and the rest is scaffolding between them. */}
            <strong className="font-medium text-foreground">
              {formatInTimeZone(resolved.instant, timezone, "EEEE d MMMM")}
            </strong>
            , {formatInTimeZone(resolved.instant, timezone, "HH:mm")} –{" "}
            {formatInTimeZone(end, timezone, "HH:mm")}{" "}
            <strong className="font-medium text-foreground">
              {formatInTimeZone(resolved.instant, timezone, "zzz")}
            </strong>
          </p>
          <p>
            {durationMinutes} minutes
          </p>
          {/*
            Its own line, and it names the zone — v1.3 D3: "That's 16:00 – 16:30
            where you are (Europe/Berlin)."
            
            The zone in parentheses is the part that makes it checkable. "Where
            you are" is a claim about the reader's machine, and a reader whose
            laptop is set to the wrong zone would otherwise read a wrong number
            with nothing to catch it on.
          */}
          {elsewhere && (
            <p>
              That&rsquo;s{" "}
              <strong className="font-medium text-foreground">
                {crossesMidnight &&
                  `${formatInTimeZone(resolved.instant, viewer, "EEE d MMM")}, `}
                {formatInTimeZone(resolved.instant, viewer, "HH:mm")} –{" "}
                {formatInTimeZone(end, viewer, "HH:mm")}
              </strong>{" "}
              where you are ({viewer.replace(/_/g, " ")}).
            </p>
          )}
          {!resolved.exact && (
            /*
             * The DST hole, which the design's preview has no slot for and
             * which is the sole reason `resolveWallClock` returns `exact` and
             * `actual` at all. It sits inside the card because the card is what
             * says what will be stored, and this is the case where that differs
             * from what was typed.
             */
            <p className="text-[var(--state-warning)]">
              {resolved.actual.time !== "" && (
                <>
                  That time doesn&rsquo;t exist on this date — the clocks change.
                  This will be scheduled for{" "}
                  <strong>{resolved.actual.time}</strong> instead.
                </>
              )}
            </p>
          )}
          {/* Said here, in the card whose job is "check it", rather than under
              the field — the mistake is in the *instant*, which no single field
              owns: a date that was fine this morning is not fine now, and a
              time that is fine in Accra is not in Auckland. */}
          {inThePast && (
            <p className="text-[var(--state-critical)]">
              That time has already passed. Pick a later one.
            </p>
          )}
          <p className="pt-1.5">
            A link is generated when you schedule. Anyone with it can join
            without an account.
          </p>
        </div>
      ) : (
        <p className="type-small mt-1 text-muted-foreground">
          Pick a date and a timezone to see when this lands.
        </p>
      )}
    </div>
  );
}

/** Tomorrow, in the browser's own zone. Only ever called after mount. */
function defaultDate(): string {
  const tomorrow = new Date(Date.now() + 86_400_000);
  return formatInTimeZone(tomorrow, browserTimeZone(), "yyyy-MM-dd");
}

function message(reason: string): string {
  switch (reason) {
    case "unauthenticated":
      return "Your session expired. Sign in and try again.";
    case "invalid_request":
      return "Something in the form isn't right. Check the title and the time.";
    case "not_found":
      return "That meeting isn't there any more.";
    case "already_ended":
      return "This meeting has ended and can't be changed.";
    default:
      return "Couldn't save the meeting. Try again.";
  }
}
