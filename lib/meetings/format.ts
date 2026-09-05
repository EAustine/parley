import { formatInTimeZone } from "date-fns-tz";

/**
 * Times are stored in UTC and rendered in the *viewer's* zone, with the zone
 * label always printed. `PRD.md` §3.9 calls this the one place where a quiet
 * bug produces a missed meeting, so the label is not optional decoration —
 * it is what makes the number checkable.
 */

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/*
 * `formatMeetingTime` was here — "Tue 2 Sep, 14:30 GMT", the whole fact in one
 * string.
 *
 * v1.3 D1 took the dashboard off it (a column needs the parts apart) and D4
 * took the meeting page off it (the page prints the whole slot, not its start).
 * That left an exported function with no callers, which `check:deps` cannot see
 * — its sweep is per-module, not per-export — so this is the manual half of
 * rule 9. The pieces below are what replaced it, and each says what it is for.
 */

/**
 * Relative day — "Today", "Tomorrow", or the date.
 *
 * No longer exported. It was written for a grouping two phases before the
 * grouping existed and was imported by nothing until v1.3 D1; now its one
 * caller is `formatDayHeader`, below, in this file. `check:deps` cannot see an
 * unused *export* — its sweep is per-module — so this is the manual half of
 * rule 9.
 */
function formatMeetingDay(
  utcISO: string,
  timeZone: string = viewerTimeZone(),
  now: number = Date.now(),
): string {
  const day = (d: Date) => formatInTimeZone(d, timeZone, "yyyy-MM-dd");
  const target = day(new Date(utcISO));
  const today = new Date(now);
  if (target === day(today)) return "Today";
  if (target === day(new Date(now + 86_400_000))) return "Tomorrow";
  return formatInTimeZone(new Date(utcISO), timeZone, "EEE d MMM yyyy");
}

/* ------------------------------------------------------------------ *
 * v1.3 D1: the pieces, not the sentence.
 *
 * `formatMeetingTime` welds date, time and zone into one string, which is
 * right for a sub-line and wrong for a column. D1 makes the time "the leftmost
 * column at 15px so you scan times rather than reading titles to find one" —
 * a 15px bold line with the zone beneath it — and that needs the parts apart.
 *
 * It stays, because `/j/[code]` and the meeting detail page still want the
 * sentence.
 * ------------------------------------------------------------------ */

/** Just the clock. "10:34" */
export function formatClock(
  utcISO: string,
  timeZone: string = viewerTimeZone(),
): string {
  return formatInTimeZone(new Date(utcISO), timeZone, "HH:mm");
}

/**
 * Just the zone label. "GMT"
 *
 * PRD §3.9's trap, and D1 restates it: "The zone label is always printed."
 * Splitting the string is exactly the edit that could drop it, so it gets its
 * own function rather than becoming an optional argument to another one.
 */
export function formatZone(
  utcISO: string,
  timeZone: string = viewerTimeZone(),
): string {
  return formatInTimeZone(new Date(utcISO), timeZone, "zzz");
}

/** "Thu 3" — the day inside a month group, where the month is the header. */
export function formatShortDay(
  utcISO: string,
  timeZone: string = viewerTimeZone(),
): string {
  return formatInTimeZone(new Date(utcISO), timeZone, "EEE d");
}

/**
 * A day header for Upcoming. "Today · Friday 4 September", "Tuesday 15 September".
 *
 * `formatMeetingDay` already returned "Today" / "Tomorrow" / a date and was
 * imported by nothing — written for this grouping two phases before the
 * grouping existed. It is not quite this: D1's header carries the relative word
 * **and** the spelled-out date, because "Today" alone stops being enough the
 * moment there is a second header under it.
 *
 * No "Yesterday", and Past does not use this at all — see `formatMonthHeader`.
 */
export function formatDayHeader(
  utcISO: string,
  timeZone: string = viewerTimeZone(),
  /**
   * The render clock — v1.3 D5.
   *
   * "Today" is a comparison against a *now*, and this used to read the
   * browser's while `partitionMeetings` read the server's. Two clocks on one
   * screen: a meeting the server puts in Upcoming could be headed "Today" by a
   * browser that thinks it is already tomorrow. Rare, and the sort of rare that
   * only ever shows up in a screenshot nobody can reproduce.
   *
   * D5's whole shape is one clock read once at render and refreshed when you
   * come back, so the header takes the same reading as the partition.
   */
  now: number = Date.now(),
): string {
  const spelled = formatInTimeZone(new Date(utcISO), timeZone, "EEEE d MMMM");
  const relative = formatMeetingDay(utcISO, timeZone, now);
  return relative === "Today" || relative === "Tomorrow"
    ? `${relative} · ${spelled}`
    : spelled;
}

/**
 * A month header for Past. "September 2026".
 *
 * **Month, not day, and the difference is that Past grows without limit.**
 * Upcoming is bounded by what you have scheduled and is scanned for a specific
 * time, so a day header earns its line. Past is browsed by rough period, and a
 * year of it under day headers is close to one header per row — worse than no
 * grouping, and getting worse every week. Month headers never degrade.
 *
 * Grouping is there to remove repetition, which is also why the answer is not
 * a flat list: a day header lets an upcoming row print only a time, and a month
 * header lets a past row print a short day and a time. Going flat puts the
 * whole date back on every row — reinstating exactly what the grouping removed.
 *
 * The year is always printed. Past is the list you reach back through, and
 * "September" alone stops being an answer the moment there are two of them.
 */
export function formatMonthHeader(
  utcISO: string,
  timeZone: string = viewerTimeZone(),
): string {
  return formatInTimeZone(new Date(utcISO), timeZone, "MMMM yyyy");
}

/**
 * "Started 14 minutes ago", for the live block.
 *
 * Computed at render and not ticking. D5 is explicit — "Not a timer" — and
 * CLAUDE.md forbids ambient animation for the same reason: a number that
 * rewrites itself while nobody is looking is motion answering no action. It
 * goes stale until the next render, and D5's focus refresh is what ends that.
 */
export function formatElapsed(sinceISO: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(sinceISO).getTime()) / 60_000);
  if (minutes < 1) return "Started just now";
  if (minutes === 1) return "Started 1 minute ago";
  if (minutes < 60) return `Started ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "Started 1 hour ago";
  if (hours < 24) return `Started ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Started 1 day ago" : `Started ${days} days ago`;
}
