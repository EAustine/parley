import { formatInTimeZone } from "date-fns-tz";

// Relative, like `calendar-links.ts` imports `./ics` — the convention for a
// sibling inside `lib/`, and what lets `check:groups` compile this module on
// its own without a path-mapped tsconfig.
import { formatDayHeader, formatMonthHeader, viewerTimeZone } from "./format";

/**
 * v1.3 D1: "41 rows in one flat list is a wall. Day headers make it scannable."
 *
 * Two resolutions, because the two lists are used differently.
 *
 * **Upcoming groups by day.** It is bounded by what you have scheduled, and it
 * is scanned for a specific time — so a header per day earns its line and lets
 * the row print nothing but a clock.
 *
 * **Past groups by month.** It grows without limit and is browsed by rough
 * period. A year of it under day headers approaches one header per row, which
 * is worse than no grouping and gets worse every week; month headers never
 * degrade. The row pays for the coarser header by printing a short day beside
 * its time — still less than the whole date a flat list would put back on every
 * row, which is the repetition the grouping exists to remove.
 *
 * **Order is the caller's.** `partitionMeetings` already sorts Upcoming
 * soonest-first and Past most-recent-first, deliberately and in opposite
 * directions. Grouping walks that order and starts a new group when the key
 * changes; it never sorts. So Past's month headers descend because its rows do,
 * and nothing here has to know that.
 *
 * A pure function of (meetings, zone) so `npm run check:groups` can exercise
 * the boundaries — the month rollover, the single-meeting group, the empty
 * list — without a browser. Same shape as `partitionMeetings`, for the same
 * reason.
 */

export type MeetingGroup<T> = {
  /** Stable across renders; the group's identity, not its label. */
  key: string;
  /** What the header prints. */
  heading: string;
  meetings: T[];
};

type Datable = { id: string };

export function groupMeetings<T extends Datable>(
  meetings: readonly T[],
  when: (meeting: T) => string,
  by: "day" | "month",
  timeZone: string = viewerTimeZone(),
  /** The render clock, so "Today" agrees with the partition — v1.3 D5. */
  now: number = Date.now(),
): MeetingGroup<T>[] {
  const keyOf = (iso: string) =>
    formatInTimeZone(new Date(iso), timeZone, by === "day" ? "yyyy-MM-dd" : "yyyy-MM");
  const headingOf =
    by === "day"
      ? (iso: string, zone: string) => formatDayHeader(iso, zone, now)
      : formatMonthHeader;

  const groups: MeetingGroup<T>[] = [];
  for (const meeting of meetings) {
    const iso = when(meeting);
    const key = keyOf(iso);
    // Walk, never sort — see the note above. A key that reappears after an
    // interruption starts a second group, which is the honest rendering of an
    // out-of-order list rather than a silent regrouping of it.
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.meetings.push(meeting);
    else groups.push({ key, heading: headingOf(iso, timeZone), meetings: [meeting] });
  }
  return groups;
}
