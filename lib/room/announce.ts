/**
 * One polite region, four things wanting it, and a bail-out that swallowed
 * repeats.
 *
 * Phase 8 merged chat and connection announcements with last-writer-wins and
 * documented that it could drop one when two landed in the same tick. The more
 * frequent loss was undocumented and worse: **the region held a bare string,
 * so setting it to the value it already held was a React bail-out — the DOM
 * was never touched and nothing was spoken.** Two messages in a row from the
 * same sender announced once. Two identical reactions two seconds apart
 * announced once. "Your connection is unstable" arriving twice with a recovery
 * between them announced once.
 *
 * So the queue carries `{ id, text }` rather than strings, and the region
 * renders a keyed child. A new key is a `childList` mutation inside a live
 * region that itself never remounts — which is the part that matters, because
 * a live region inserted into the document with content already in it is not
 * announced by most screen readers.
 *
 * Strict FIFO, no channel priority. §9 does not rank the channels. The code
 * did rank them, by accident: the chat effect was declared after the
 * connection effect, so chat silently won a same-tick collision. Choosing FIFO
 * is choosing a rule instead of keeping a source-order artefact.
 */

export type Announcement = { id: number; text: string };

/**
 * Minimum spacing between two announcements reaching the region.
 *
 * Two strings swapped inside one frame are one mutation as far as a screen
 * reader is concerned, and the first is simply lost. A second is long enough
 * for a short phrase to be spoken and short enough that a queue of three does
 * not feel like a delay.
 */
export const ANNOUNCE_GAP_MS = 1_000;

/**
 * Anything older than this is dropped at the head rather than spoken.
 *
 * Eight people at the chat rate limit is forty announcements in ten seconds,
 * which §9 has no rule against and the gap above would take forty seconds to
 * drain. Stale news is worse than silence: "Ama sent a message" thirty seconds
 * late is not information, it is an interruption about the past.
 */
export const ANNOUNCE_MAX_AGE_MS = 10_000;

/** Beyond this the oldest are dropped, so a flood cannot grow unbounded. */
export const ANNOUNCE_CAP = 8;

export class AnnounceQueue {
  private items: { id: number; text: string; at: number }[] = [];
  private lastSpokenAt: number | null = null;
  private nextId = 1;

  /**
   * Queue something to be said.
   *
   * Identical consecutive texts are kept, not collapsed. That is the bug this
   * class exists to fix: two people sending a message each is two events, and
   * "Ama sent a message" twice is the truth. The gates upstream — the reaction
   * throttle, the chat rate limit, the connection once-per-change rule — are
   * what decide whether something is worth saying. This decides when.
   */
  push(text: string, now: number): void {
    this.items.push({ id: this.nextId++, text, at: now });
    if (this.items.length > ANNOUNCE_CAP) {
      this.items.splice(0, this.items.length - ANNOUNCE_CAP);
    }
  }

  /**
   * The next thing to say, or null.
   *
   * Returns null while the gap since the last one has not elapsed, so the
   * caller can poll on a timer without tracking that itself.
   */
  drain(now: number): Announcement | null {
    // Drop anything that waited too long, before considering the gap — a stale
    // head must not hold up something fresh behind it.
    while (this.items.length > 0 && now - this.items[0].at > ANNOUNCE_MAX_AGE_MS) {
      this.items.shift();
    }
    if (this.items.length === 0) return null;
    if (this.lastSpokenAt !== null && now - this.lastSpokenAt < ANNOUNCE_GAP_MS) {
      return null;
    }

    const next = this.items.shift()!;
    this.lastSpokenAt = now;
    return { id: next.id, text: next.text };
  }

  /** Queued but not yet spoken. For the check, and for a vacuity guard. */
  get depth(): number {
    return this.items.length;
  }
}
