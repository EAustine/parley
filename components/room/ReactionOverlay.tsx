"use client";

import {
  REACTION_LANES,
  REACTION_LANE_PITCH,
  reactionDrift,
} from "@/lib/room/limits";
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
  /**
   * Where a participant's tile is, as a percentage of the grid, and how far a
   * reaction should travel — 40% of that tile's height, per §3.6 and E1.
   */
  anchorFor: (identity: string) => { left: number; bottom: number; rise: number };
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
        const offset =
          (reaction.lane - (REACTION_LANES - 1) / 2) * REACTION_LANE_PITCH;
        return (
          <span
            key={reaction.id}
            className="parley-reaction absolute select-none text-2xl"
            style={
              {
                left: `calc(${anchor.left}% + ${offset}px)`,
                bottom: `${anchor.bottom}%`,
                // Read by the keyframes, so the travel is a property of the
                // tile the reaction came from rather than a constant.
                "--parley-rise": `${Math.round(anchor.rise)}px`,
                "--parley-drift": `${reactionDrift(reaction.id)}px`,
              } as React.CSSProperties
            }
          >
            {reaction.emoji}
          </span>
        );
      })}
    </div>
  );
}
