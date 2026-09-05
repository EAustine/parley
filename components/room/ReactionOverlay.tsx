"use client";

import {
  REACTION_LANES,
  REACTION_LANE_PITCH,
  reactionDrift,
  reactionSpin,
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
          /*
           * Two elements, because the rise and the sway need different easings
           * — v1.3 C6.
           *
           * `translate` is one property, so a single element can only give both
           * axes the same timing function, and a straight eased line is exactly
           * what C6 is replacing: "an arc rather than a straight rise". The
           * outer element rises on a decelerating curve; the inner sways and
           * tips on an ease-in-out, and the two compose into a path that
           * curves. It is the same trick the existing rise/pop split already
           * uses on one element, taken one step further because `translate`
           * cannot be timed against itself.
           *
           * Both are `translate`, `rotate` and `scale` — compositor properties
           * that never touch layout, which is what makes two nested animated
           * elements per reaction cheap.
           */
          <span
            key={reaction.id}
            className="parley-reaction absolute"
            style={
              {
                left: `calc(${anchor.left}% + ${offset}px)`,
                bottom: `${anchor.bottom}%`,
                // Read by the keyframes, so the travel is a property of the
                // tile the reaction came from rather than a constant.
                "--parley-rise": `${Math.round(anchor.rise)}px`,
                "--parley-drift": `${reactionDrift(reaction.id)}px`,
                // A number, not an angle: `calc()` multiplies it by 1deg in the
                // keyframes, which a `deg` value cannot be scaled by.
                "--parley-spin": reactionSpin(reaction.id),
              } as React.CSSProperties
            }
          >
            <span className="parley-reaction-sway block select-none text-2xl">
              {reaction.emoji}
            </span>
          </span>
        );
      })}
    </div>
  );
}
