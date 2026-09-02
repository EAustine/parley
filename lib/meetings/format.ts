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

/** e.g. "Tue 2 Sep, 14:30 GMT" */
export function formatMeetingTime(
  utcISO: string,
  timeZone: string = viewerTimeZone(),
): string {
  return formatInTimeZone(new Date(utcISO), timeZone, "EEE d MMM, HH:mm zzz");
}

/** Relative day for grouping — "Today", "Tomorrow", or the date. */
export function formatMeetingDay(
  utcISO: string,
  timeZone: string = viewerTimeZone(),
): string {
  const day = (d: Date) => formatInTimeZone(d, timeZone, "yyyy-MM-dd");
  const target = day(new Date(utcISO));
  const now = new Date();
  if (target === day(now)) return "Today";
  if (target === day(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  return formatInTimeZone(new Date(utcISO), timeZone, "EEE d MMM yyyy");
}
