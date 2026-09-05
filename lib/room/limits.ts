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

/** Pitch between lanes, in pixels. The drift below must stay well inside it. */
export const REACTION_LANE_PITCH = 22;

/**
 * A small per-reaction wobble, on top of the lane.
 *
 * v1.2 E1 asks for "slight horizontal drift, randomised within a narrow band,
 * so simultaneous reactions do not stack into a column". The second half of
 * that sentence is already handled — and deliberately not by randomness, for
 * the reason recorded above: random offsets collide about as often as they
 * separate. Lanes guarantee the separation; nothing random can.
 *
 * So this is the first half only, and it is bounded at a quarter of the lane
 * pitch. Two reactions in adjacent lanes stay at least 11px apart however the
 * drift falls, which keeps the guarantee lanes exist to provide while giving
 * the motion the organic variation E1 is after.
 *
 * Derived from the reaction's id rather than `Math.random()`: it has to be
 * stable across re-renders, or a reaction re-anchors mid-flight every time the
 * grid updates around it.
 */
export const REACTION_DRIFT_MAX = REACTION_LANE_PITCH / 4;

export function reactionDrift(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  // [-1, 1) from the low bits, then scaled into the band.
  const unit = ((hash >>> 0) % 2000) / 1000 - 1;
  return Math.round(unit * REACTION_DRIFT_MAX * 10) / 10;
}

/**
 * How far a reaction tips as it sways — v1.3 C6.
 *
 * C6 asks for "slight rotation" alongside the arc, and this is **derived from
 * the drift rather than seeded separately**. That is the whole of why it reads
 * as physical: a thing moving right tips right. Two independent random
 * sequences would give a reaction sliding one way while tilting the other,
 * which is uncannier than no rotation at all.
 *
 * Eight degrees at full drift. "Slight" is the word C6 uses, and past about ten
 * the emoji stops looking buoyant and starts looking thrown.
 */
export const REACTION_SPIN_MAX = 8;

export function reactionSpin(id: string): number {
  const unit = reactionDrift(id) / REACTION_DRIFT_MAX;
  return Math.round(unit * REACTION_SPIN_MAX * 10) / 10;
}

/**
 * The sway path, as a fraction of the drift at each keyframe — v1.3 C6.
 *
 * Exported because it is a **bound, not a decoration**. The lane guarantee
 * above says two reactions in adjacent lanes stay at least 11px apart "however
 * the drift falls", and that held trivially while the path was a straight line
 * from 0 to `drift`: the greatest excursion was the endpoint.
 *
 * A sway makes the excursion happen mid-flight instead, so the guarantee now
 * depends on no keyframe exceeding the drift it was bounded against.
 * `check:room` asserts that against this array rather than against the
 * stylesheet, and the stylesheet is written from these numbers.
 */
export const REACTION_SWAY = [0, 1, -0.7, 0.45, -0.25] as const;
