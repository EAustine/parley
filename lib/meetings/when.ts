import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
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
 * The zones offered, grouped by region.
 *
 * **Not the full IANA list.** `Intl.supportedValuesOf("timeZone")` returns over
 * four hundred entries, most of which are aliases or places with a dozen
 * residents; that is a scroll rather than a choice.
 *
 * **And no longer seventeen.** The first list covered the places this was built
 * from and nowhere else — no Paris, no Madrid, no Toronto, no Shanghai, no
 * Auckland. A zone missing from a scheduling form is not a small gap: it is a
 * meeting scheduled in the wrong one, which §3.9 calls the one place a quiet
 * bug produces a missed meeting.
 *
 * **Grouped, because a flat list of sixty is the scroll the short list was
 * avoiding.** A native `<select>` renders `<optgroup>` with the operating
 * system's own headings, and `color-scheme` is declared so it paints them for
 * the right theme. Type-ahead still jumps: "Ber" reaches Berlin from anywhere
 * in the list.
 */
export const TIMEZONE_GROUPS: { region: string; zones: string[] }[] = [
  {
    region: "Africa",
    zones: [
      "Africa/Abidjan", "Africa/Accra", "Africa/Addis_Ababa", "Africa/Algiers",
      "Africa/Cairo", "Africa/Casablanca", "Africa/Johannesburg",
      "Africa/Kinshasa", "Africa/Lagos", "Africa/Nairobi", "Africa/Tunis",
    ],
  },
  {
    region: "Europe",
    zones: [
      "Europe/Amsterdam", "Europe/Athens", "Europe/Berlin", "Europe/Brussels",
      "Europe/Bucharest", "Europe/Budapest", "Europe/Copenhagen",
      "Europe/Dublin", "Europe/Helsinki", "Europe/Istanbul", "Europe/Kyiv",
      "Europe/Lisbon", "Europe/London", "Europe/Madrid", "Europe/Moscow",
      "Europe/Oslo", "Europe/Paris", "Europe/Prague", "Europe/Rome",
      "Europe/Stockholm", "Europe/Vienna", "Europe/Warsaw", "Europe/Zurich",
    ],
  },
  {
    region: "Americas",
    zones: [
      "America/Anchorage", "America/Bogota", "America/Buenos_Aires",
      "America/Chicago", "America/Denver", "America/Halifax",
      "America/Los_Angeles", "America/Mexico_City", "America/New_York",
      "America/Phoenix", "America/Santiago", "America/Sao_Paulo",
      "America/Toronto", "America/Vancouver", "Pacific/Honolulu",
    ],
  },
  {
    region: "Asia",
    zones: [
      "Asia/Bangkok", "Asia/Dhaka", "Asia/Dubai", "Asia/Hong_Kong",
      "Asia/Jakarta", "Asia/Jerusalem", "Asia/Karachi", "Asia/Kathmandu",
      "Asia/Kolkata", "Asia/Kuala_Lumpur", "Asia/Manila", "Asia/Riyadh",
      "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Taipei",
      "Asia/Tehran", "Asia/Tokyo",
    ],
  },
  {
    region: "Oceania",
    zones: [
      "Australia/Adelaide", "Australia/Brisbane", "Australia/Melbourne",
      "Australia/Perth", "Australia/Sydney", "Pacific/Auckland",
      "Pacific/Fiji",
    ],
  },
  { region: "Other", zones: ["UTC"] },
];

/**
 * The groups, with the viewer's own zone guaranteed to appear.
 *
 * It is added under "Your timezone" at the top rather than inserted into
 * whichever region it belongs to — a zone that is not on the list is by
 * definition somewhere the list did not think of, and burying it alphabetically
 * among places it is not is how a person concludes their own zone is missing.
 */
export function timeZoneGroups(
  current: string,
): { region: string; zones: string[] }[] {
  const known = new Set(TIMEZONE_GROUPS.flatMap((g) => g.zones));
  return known.has(current)
    ? TIMEZONE_GROUPS
    : [{ region: "Your timezone", zones: [current] }, ...TIMEZONE_GROUPS];
}

/**
 * "Europe/London — BST", for a `<option>` label.
 *
 * The abbreviation is computed **for the instant being scheduled**, not for
 * now. The mockup hardcodes `BST|1` for London, which `BUILD-PLAN-v1.3.md`
 * already flags: "a fixed `+1` for London is right in September and wrong in
 * January." Deriving it from the date in the form means the list says GMT while
 * you are picking a date in January and BST while you are picking one in July —
 * which is the fact the label exists to carry.
 */
export function timeZoneLabel(zone: string, at: Date): string {
  const place = zone.replace(/_/g, " ");
  try {
    return `${place} — ${formatInTimeZone(at, zone, "zzz")}`;
  } catch {
    // A zone the platform does not know cannot be formatted, and a label is not
    // worth throwing over. `isKnownTimeZone` is what actually rejects it.
    return place;
  }
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
