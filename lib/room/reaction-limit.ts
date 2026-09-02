/**
 * One reaction per participant per second — §3.6.
 *
 * "Enforced client-side on send and server-agnostic on receive" is the whole
 * design in one line: the sender declines to send, and the receiver declines to
 * render, and neither depends on the other. A sender with a patched client is
 * exactly the case the receiving half exists for, and there is no server in the
 * path at all — data channel packets go participant to participant through the
 * SFU without anything of ours seeing them.
 *
 * "Extra presses dropped, not queued." A queue would turn one impatient person
 * into a two-second stream of emoji arriving after they stopped pressing, which
 * is worse than nothing happening.
 */

export const REACTION_INTERVAL_MS = 1000;

/** §9: "one announcement per participant per two seconds". */
export const REACTION_ANNOUNCE_MS = 2000;

/**
 * A per-key gate. Keyed on participant identity, so one person flooding cannot
 * silence anyone else's reactions — which a single global gate would do, and
 * would look exactly like the product being broken.
 */
export class Throttle {
  private readonly last = new Map<string, number>();

  constructor(private readonly intervalMs: number) {}

  /** True if this one passes; false if it is dropped. */
  take(key: string, now: number): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && now - previous < this.intervalMs) return false;
    this.last.set(key, now);
    return true;
  }

  /** Someone who left cannot be rate-limited. Keeps the map from growing. */
  forget(key: string) {
    this.last.delete(key);
  }
}

/**
 * Where a reaction floats up from, horizontally, when several land at once.
 *
 * §3.6 asks for a stagger so they do not overlap. Derived from how many are
 * already in flight rather than randomly: random offsets collide about as often
 * as they separate, which is the one thing the rule is trying to prevent.
 */
export const REACTION_LANES = 5;

export function nextLane(inFlight: number): number {
  return inFlight % REACTION_LANES;
}
