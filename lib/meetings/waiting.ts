/**
 * The waiting room's numbers and vocabulary — BUILD-PLAN v1.5 A1 and B1.
 *
 * Its own module, and nothing here imports React or `next/server`, so the
 * client, the route handlers and the checks can all read the same values
 * instead of three copies agreeing until one is edited. Same reasoning as
 * `lib/meetings/freshness.ts`.
 */

/**
 * How long a denied or removed person stays out.
 *
 * B1 fixes it at ten minutes and asks for the reason to be written beside it,
 * "or it gets relitigated in three passes' time": long enough that a nuisance
 * loses interest, short enough that a mistake costs one coffee. B2's undo is
 * what makes the second half survivable — the host can clear it immediately,
 * because removing the wrong person and being unable to fix it for ten minutes
 * is the likelier of the two failures.
 */
export const BLOCK_MINUTES = 10;
export const BLOCK_MS = BLOCK_MINUTES * 60_000;

/**
 * How often the waiting client asks.
 *
 * Every poll is a lookup and §7 counts lookups, so this is a rate as much as a
 * cadence: at two seconds, ten people waiting for five minutes is 1,500
 * requests, which the overall tier accommodates and the miss tier never sees
 * because the code resolves.
 *
 * Slower would be cheaper and reads as broken — being admitted is the moment
 * the person is waiting for, and a five-second lag on it feels like the button
 * did not work.
 */
export const POLL_MS = 2_000;

/**
 * When the waiting screen stops saying "soon" and says the host is not here.
 *
 * A1: "there is no co-host, so a host who never arrives means a meeting nobody
 * enters. That is a real regression against today… It is mitigated by copy, not
 * by mechanism: after a period of waiting with no host present, the waiting
 * screen must say so rather than spinning indefinitely."
 *
 * Ninety seconds because it has to outlast the ordinary case it would otherwise
 * libel — a host who is in pre-join choosing a microphone, which A1 explicitly
 * expects and calls the queue working. A host takes twenty or thirty seconds to
 * pick a device; ninety leaves room for a slow one without leaving anybody
 * watching a spinner for minutes.
 */
export const NO_HOST_AFTER_MS = 90_000;

/** What the queue can say about one person. */
export type WaitingStatus = "waiting" | "admitted" | "denied";

/** Why somebody is blocked. Denied and removed are different experiences. */
export type BlockReason = "denied" | "removed";

/**
 * How a person is identified to the door, in one vocabulary for both tables.
 *
 * `user` is an account id and survives everything short of a second account.
 * `device` is the opaque cookie id — see `lib/room/device.ts`, and see §8 for
 * what it honestly holds against.
 */
export type SubjectType = "user" | "device";

export type Subject = { subject: string; subjectType: SubjectType };

/** When a block created now should lapse. */
export function blockExpiry(now = Date.now()): string {
  return new Date(now + BLOCK_MS).toISOString();
}

/**
 * Whether a block row still bites.
 *
 * Compared in the application rather than trusted to a cleanup job: rows are
 * left to expire on their own, so every read has to filter. A sweeper that has
 * not run yet is not a reason to keep somebody out.
 */
export function blockIsLive(expiresAt: string, now = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at > now;
}

/**
 * Seconds until a block lapses, for `Retry-After` and for the copy.
 *
 * Rounded up, and never below one: a `Retry-After: 0` invites an immediate
 * retry that will be refused again, which is the dead end §7 removed from the
 * 429 path.
 */
export function blockRetryAfter(expiresAt: string, now = Date.now()): number {
  return Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}
