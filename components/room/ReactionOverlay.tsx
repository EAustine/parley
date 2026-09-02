"use client";

import { REACTION_LANES } from "@/lib/room/reaction-limit";
import type { ReactionEvent } from "@/lib/room/chat";

/**
 * Reactions in flight.
 *
 * §3.6 asks them to float up from the sender's tile. They are drawn in one
 * overlay rather than inside each tile for two reasons: a tile clips its own
 * overflow, so a reaction rising out of one would be cut off at the edge; and
 * §3.6 requires a reaction from someone *not* currently in the grid to surface
 * anyway, anchored to the overflow indicator — which no tile can do, because
 * that participant has no tile.
 *
 * `pointer-events-none` throughout. Nothing here is interactive, and a
 * reaction drifting over the leave button must not intercept a click on it.
 */
export function ReactionOverlay({
  reactions,
  anchorFor,
}: {
  reactions: ReactionEvent[];
  /** Where a participant's tile is, as a percentage of the grid. */
  anchorFor: (identity: string) => { left: number; bottom: number };
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      aria-hidden
    >
      {reactions.map((reaction) => {
        const anchor = anchorFor(reaction.identity);
        // Lanes spread simultaneous reactions horizontally so they do not
        // overlap — §3.6. Centred on the anchor rather than running off to one
        // side of it.
        const offset = (reaction.lane - (REACTION_LANES - 1) / 2) * 22;
        return (
          <span
            key={reaction.id}
            className="parley-reaction absolute select-none text-2xl"
            style={{
              left: `calc(${anchor.left}% + ${offset}px)`,
              bottom: `${anchor.bottom}%`,
            }}
          >
            {reaction.emoji}
          </span>
        );
      })}
    </div>
  );
}
