/**
 * What each participant is allowed to send, and what we are willing to render.
 *
 * Both §3.5 and §3.6 specify the same shape and §3.5 says why: "the receive
 * side drops the excess without rendering it, and **that is the only real
 * enforcement** — there is no server on this path, so a modified client ignores
 * anything the send side does." The sender declines to send and the receiver
 * declines to render, and neither depends on the other. A patched client is
 * precisely what the receiving half is for.
 *
 * The send half is not decoration either: it is what makes a flooder see their
 * own input disabled rather than typing into a void, which is the difference
 * between a rule and a mystery.
 *
 * Two shapes, because the two features need different ones. Reactions are one
 * per second — a minimum gap, since the press is reflexive. Chat is five per
 * ten seconds — a burst allowance, because typing three quick lines is normal
 * and a minimum gap between them would be an odd thing to enforce on a
 * conversation.
 */

export const REACTION_INTERVAL_MS = 1000;

/** §9: "one announcement per participant per two seconds". */
export const REACTION_ANNOUNCE_MS = 2000;

/** §3.5: five messages per ten seconds per sender. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;

/**
 * A minimum gap between events. Keyed on participant identity, so one person
 * flooding cannot silence anyone else's — which a single global gate would do,
 * and would look exactly like the product being broken.
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
 * N events per rolling window, per key.
 *
 * Rolling rather than fixed: a fixed window lets someone send five at 9.9s and
 * five more at 10.1s, which is ten in a fifth of a second — the exact burst the
 * limit exists to stop. The cost is holding up to N timestamps per participant,
 * which at five is nothing.
 */
export class WindowLimit {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** True if this one passes; false if it is dropped. Records only on pass. */
  take(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => now - at < this.windowMs,
    );
    if (recent.length >= this.limit) {
      // Rewrite the pruned list even on a refusal, or an idle participant
      // carries stale timestamps until their next accepted send.
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Milliseconds until this key could send again. 0 when it already can. */
  retryAfter(key: string, now: number): number {
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => now - at < this.windowMs,
    );
    if (recent.length < this.limit) return 0;
    // The oldest hit in the window is the one whose expiry frees a slot.
    return Math.max(0, this.windowMs - (now - recent[0]!));
  }

  forget(key: string) {
    this.hits.delete(key);
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
