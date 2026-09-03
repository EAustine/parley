"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";

import {
  browserTimeZone,
  resolveWallClock,
  timeZoneOptions,
  type WallClock,
} from "@/lib/meetings/when";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * §3.9's form.
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
}: {
  existing?: {
    code: string;
    title: string;
    description: string | null;
    wall: WallClock;
    durationMinutes: number;
  };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [date, setDate] = useState(existing?.wall.date ?? defaultDate());
  const [time, setTime] = useState(existing?.wall.time ?? "10:00");
  const [timezone, setTimezone] = useState(
    existing?.wall.timezone ?? browserTimeZone(),
  );
  const [durationMinutes, setDuration] = useState(
    existing?.durationMinutes ?? 30,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zones = useMemo(() => timeZoneOptions(timezone), [timezone]);

  // Resolved on every keystroke, because the answer is what gets stored and
  // the person should be able to see it before they commit to it.
  const resolved = useMemo(() => {
    try {
      return resolveWallClock({ date, time, timezone });
    } catch {
      return null;
    }
  }, [date, time, timezone]);

  const viewer = browserTimeZone();
  const showsDifferently =
    resolved !== null && viewer !== timezone;

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
      router.push(`/schedule/${meeting.code}`);
      router.refresh();
    } catch {
      setSubmitting(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title" className="type-small">
          Title
        </Label>
        <Input
          id="title"
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
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          placeholder="What this is about, and anything people should bring."
          className="w-full resize-none rounded-lg bg-input px-3 py-2 type-body text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date" className="type-small">
            Date
          </Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="time" className="type-small">
            Start time
          </Label>
          <Input
            id="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="duration" className="type-small">
            Duration
          </Label>
          <Select
            id="duration"
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
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* §3.9 calls this the one place a quiet bug produces a missed meeting,
          so what will be stored is shown before it is stored. */}
      {resolved && (
        <div className="space-y-2 rounded-lg border p-4" style={{ borderColor: "var(--boundary)" }}>
          {!resolved.exact && (
            <p className="type-small text-[var(--state-warning)]">
              {time} doesn&rsquo;t exist on {date} in {timezone.replace(/_/g, " ")}
              {" "}— the clocks change that day. This will be scheduled for{" "}
              <strong>{resolved.actual.time}</strong> instead.
            </p>
          )}
          <p className="type-small text-muted-foreground">
            Starts{" "}
            <strong className="text-foreground">
              {formatInTimeZone(resolved.instant, timezone, "EEE d MMM, HH:mm zzz")}
            </strong>
            {showsDifferently && (
              <>
                {" · "}
                {formatInTimeZone(resolved.instant, viewer, "HH:mm zzz")} where you
                are
              </>
            )}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="type-small text-[var(--state-critical)]">
          {error}
        </p>
      )}

      <Button type="submit" disabled={submitting || title.trim().length === 0}>
        {submitting
          ? existing
            ? "Saving…"
            : "Scheduling…"
          : existing
            ? "Save changes"
            : "Schedule meeting"}
      </Button>
    </form>
  );
}

/** Tomorrow, in the browser's own zone. */
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
