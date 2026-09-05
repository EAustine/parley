/**
 * Which section of the dashboard a meeting belongs in.
 *
 * BUILD-PLAN v1.3 A1: field issues 7 and 8 are one bug. An **instant** meeting
 * from Thursday at 22:22 and a **live** meeting from Wednesday were both filed
 * under "Upcoming · 41", and a meeting whose time had passed never moved to
 * past. One partition, computed from the wrong thing.
 *
 * The wrong thing was `scheduled_start`, in a predicate that read:
 *
 *     if (status === "ended" || status === "cancelled") return true;
 *     if (!scheduled_start) return false;          // ← instant, forever upcoming
 *     return scheduled_start < now;                // ← wrong end of the slot
 *
 * Two defects in three lines. An instant meeting has no `scheduled_start`, so
 * the second line filed every one of them as upcoming for the rest of time. And
 * the third compared against the *start*, so a meeting moved to past the moment
 * it began — while a `live` one, which is neither upcoming nor past but
 * happening, had nowhere to go and stayed in the list it was already in.
 *
 * ## The rules
 *
 * | Section | Rule |
 * |---|---|
 * | **Live now** | happening — its own block, never inside either list |
 * | **Upcoming** | scheduled, and its end has not passed |
 * | **Past** | ended, cancelled, or its end has passed |
 *
 * **A meeting whose end time has passed reads as past whether or not anything
 * told the database so.** That is the belt to the webhook's braces, and it is
 * what was missing: `room_finished` writes `status = 'ended'`, so if the
 * webhook is not arriving (A2) every meeting that ever ran is still `live` in
 * the database. The belt has to beat a stale `live`, or Wednesday's meeting
 * pulses "Live now" indefinitely — which is field issue 8 with a nicer border.
 *
 * The cost is a meeting that genuinely overruns its slot: at 10:45 in a
 * 10:00–10:30 booking it files as past while people are still in it. That is
 * the smaller of the two errors, it is self-correcting the moment someone
 * rebooks, and the link keeps working regardless — nothing here gates joining.
 */

/** §3.2's expiry window for instant meetings, in milliseconds. */
export const INSTANT_WINDOW_MS = 12 * 60 * 60 * 1000;

export type Bucket = "live" | "upcoming" | "past";

/**
 * The columns the partition reads. Deliberately the row's own shape rather than
 * a bespoke type, so a caller cannot pass a projection that omits one of them
 * and get a silently different answer — `scheduled_end` and `started_at` were
 * both absent from the dashboard's `select` before this existed, which is part
 * of why the old predicate could not have been right.
 */
export type Partitionable = {
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  created_at: string;
  started_at: string | null;
};

const ms = (iso: string | null) => (iso === null ? null : new Date(iso).getTime());

export function bucketOf(meeting: Partitionable, now: number): Bucket {
  // §3.2: "cancelled meetings leave the upcoming list and appear under past".
  // A meeting that is not going to happen is not something to be at.
  if (meeting.status === "ended" || meeting.status === "cancelled") return "past";

  /**
   * Instant meetings, which have no slot to fall behind.
   *
   * A1: "An instant meeting has no `scheduled_start`, so it can never be
   * upcoming — it is live from creation, or ended, or expired under §3.2's
   * 12-hour rule."
   *
   * **The window runs from `started_at` when there is one.** §3.2 as written
   * expires an instant meeting 12h after creation *if never joined*, which
   * leaves the joined-then-abandoned case with no belt at all: with the webhook
   * silent it stays `live` forever, and that is the one shape the scheduled
   * belt cannot cover because there is no `scheduled_end` to compare. Extending
   * the same window to `started_at` gives instant meetings the belt scheduled
   * ones get. Derived here rather than swept by a job, for the reason
   * `get_meeting_by_code` already gives: a stored value can be late, be down,
   * or run twice.
   */
  if (meeting.scheduled_start === null) {
    const since = ms(meeting.started_at) ?? ms(meeting.created_at) ?? now;
    return now - since >= INSTANT_WINDOW_MS ? "past" : "live";
  }

  // The belt, and it beats a stale `live` on purpose — see the header.
  const end = ms(meeting.scheduled_end);
  if (end !== null && now >= end) return "past";

  if (meeting.status === "live") return "live";

  /**
   * A meeting inside its own slot that nothing has marked live — 10:15 in a
   * 10:00–10:30 booking, with nobody there yet.
   *
   * **This is the hole A1's first table had, and the answer is neither of the
   * two sections it offered.** `status = 'live'` is false and
   * `scheduled_start > now()` is false, so a two-way partition has no home for
   * it: an `else past` fallback makes the meeting vanish at the exact moment
   * someone would go looking for it, and `else upcoming` — which this returned
   * — leaves it filed under things that have not started, at 10:15.
   *
   * So the section holds both, and the two read differently: one has people in
   * it, the other is due and empty. `LiveMeetingCard` branches on `status`,
   * which already carries the distinction, and says "no one has joined yet"
   * rather than implying a room with somebody in it.
   *
   * It leaves for Past when `scheduled_end` passes — the belt above, not a
   * second rule. A meeting due at 01:15 for half an hour that nobody joins is
   * past at 01:45, not at 01:15.
   */
  const start = ms(meeting.scheduled_start);
  if (start !== null && now >= start) return "live";

  return "upcoming";
}

/**
 * The three sections, each sorted the way it is read.
 *
 * They sort in different directions, which is why this is not one `ORDER BY`.
 * Upcoming reads soonest-first — the next thing you have to be at. Past reads
 * most-recent-first — the thing you just came out of. Happening now reads
 * longest-running first, so a meeting someone has been sitting in leads.
 */
export function partitionMeetings<T extends Partitionable>(
  meetings: readonly T[],
  now: number,
): { live: T[]; upcoming: T[]; past: T[] } {
  const live: T[] = [];
  const upcoming: T[] = [];
  const past: T[] = [];

  for (const meeting of meetings) {
    const bucket = bucketOf(meeting, now);
    if (bucket === "live") live.push(meeting);
    else if (bucket === "upcoming") upcoming.push(meeting);
    else past.push(meeting);
  }

  /** When a meeting began, or would have. */
  const began = (m: Partitionable) =>
    ms(m.started_at) ?? ms(m.scheduled_start) ?? ms(m.created_at) ?? 0;
  /** When a meeting is, or was — the time a person would look for it by. */
  const at = (m: Partitionable) => ms(m.scheduled_start) ?? ms(m.created_at) ?? 0;

  live.sort((a, b) => began(a) - began(b));
  upcoming.sort((a, b) => at(a) - at(b));
  past.sort((a, b) => at(b) - at(a));

  return { live, upcoming, past };
}
