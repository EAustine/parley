import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

/**
 * Turning what someone typed into the instant it means.
 *
 * §3.9: "This is the one place where a quiet bug produces a missed meeting."
 * The form collects a wall-clock date and time and a zone — "15 September,
 * 14:30, Africa/Accra" — none of which is a moment until the three are read
 * together. `fromZonedTime` does that reading; constructing a `Date` from the
 * parts and adjusting it by an offset does not, because the offset depends on
 * the date you are trying to compute.
 *
 * Two cases make this worth having its own file and its own tests:
 *
 * **A zone whose offset changes.** Europe/Berlin is +01:00 in January and
 * +02:00 in July. A meeting scheduled in June using December's offset is an
 * hour wrong, and it is wrong in the direction nobody checks.
 *
 * **A wall-clock time that does not exist.** When Berlin springs forward,
 * 02:30 on that Sunday never happens. Something has to be returned; the
 * platform resolves it forward, and it is better to know that is what happens
 * than to discover it from a support message.
 */

export type WallClock = {
  /** `yyyy-MM-dd`, as an `<input type="date">` gives it. */
  date: string;
  /** `HH:mm`, as an `<input type="time">` gives it. */
  time: string;
  /** IANA zone name. */
  timezone: string;
};

/** The UTC instant that a wall clock in that zone refers to. */
export function toInstant({ date, time, timezone }: WallClock): Date {
  return fromZonedTime(`${date}T${time}:00`, timezone);
}

/**
 * The same, plus whether the time asked for actually exists.
 *
 * Measured, not assumed: on the morning Berlin springs forward, `02:30`
 * resolves to `00:30Z`, which is **01:30 local** — an hour *earlier* than what
 * was typed, not later. Nothing throws and nothing is marked; the meeting is
 * simply at the wrong time, in the direction nobody checks.
 *
 * That is precisely the failure §3.9 is about, so it gets a state rather than
 * silence. Round-tripping the instant back through the same zone is the whole
 * detection: if it does not come back as what was typed, the time does not
 * exist on that date, and the form says so and says what it will schedule
 * instead. It is not blocked — an hour that does not exist is a fact about the
 * calendar, not a mistake to be scolded for.
 *
 * The autumn case needs no warning. When the clocks go back, `02:30` happens
 * twice; both are real, the platform picks one, and the round trip is exact.
 */
export function resolveWallClock(wall: WallClock): {
  instant: Date;
  /** False when the requested time does not exist on that date in that zone. */
  exact: boolean;
  /** What will actually be scheduled. Equal to `wall` when `exact`. */
  actual: WallClock;
} {
  const instant = toInstant(wall);
  const actual = toWallClock(instant, wall.timezone);
  return {
    instant,
    exact: actual.date === wall.date && actual.time === wall.time,
    actual,
  };
}

/** The inverse, for filling the form when editing an existing meeting. */
export function toWallClock(instant: Date, timezone: string): WallClock {
  const local = toZonedTime(instant, timezone);
  return {
    date: format(local, "yyyy-MM-dd"),
    time: format(local, "HH:mm"),
    timezone,
  };
}

/**
 * The zone the browser is in. Editable — §3.9 makes this a default, not a
 * decision: people schedule meetings for where the other person is.
 */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * A short list that covers most of what this product will actually be used
 * for, with the viewer's own zone guaranteed to be in it even when it is not.
 *
 * Not the full IANA list. `Intl.supportedValuesOf("timeZone")` returns over
 * four hundred entries, which is a scroll rather than a choice; the field
 * accepts any of them if typed, and this is the shortlist.
 */
export const COMMON_TIMEZONES = [
  "Africa/Accra",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Lisbon",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
] as const;

export function timeZoneOptions(current: string): string[] {
  const seen = new Set<string>([current, ...COMMON_TIMEZONES]);
  return [...seen];
}

/** Is this a zone the platform actually knows? */
export function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
