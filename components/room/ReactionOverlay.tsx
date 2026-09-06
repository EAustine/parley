"use client";

import {
  REACTION_LANES,
  REACTION_LANE_PITCH,
  reactionDrift,
  reactionSpin,
} from "@/lib/room/limits";
import { REACTION_ASSETS } from "@/lib/room/reaction-assets";
import type { Reaction } from "@/lib/room/messages";
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
      className="pointer-events-none absolute inset-0 z-[var(--layer-ephemera)] overflow-hidden"
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
            {/*
              Fluent 3D, with the glyph as the fallback — v1.3 C6.
              
              `alt=""` because the overlay is `aria-hidden` and §9 announces
              reactions through the live region instead: an image with a name
              here would be the same fact twice, and throttled differently.
              
              30px is `design/02`'s `.rx{font-size:30px}`, and the asset is 96px
              so it holds at 3×. `onError` falls back to the glyph rather than
              leaving a gap — a missing asset should cost the polish, not the
              reaction.
            */}
            <span className="parley-reaction-sway block select-none">
              <ReactionGlyph emoji={reaction.emoji} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ReactionGlyph({ emoji }: { emoji: string }) {
  const src = REACTION_ASSETS[emoji as Reaction];
  if (!src) return <span className="block text-[30px] leading-none">{emoji}</span>;
  return (
    /*
     * A plain `<img>`, and `next/image` is deliberately not used.
     *
     * It would route a 3 kB asset through `/_next/image?url=…` — a server round
     * trip, on the one element in the product that has to be on screen the
     * instant it is asked for, and it would defeat the preload by changing the
     * URL the browser was told to fetch. These are already optimised: 96px
     * WebP, generated once, versioned with the repo.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={30}
      height={30}
      draggable={false}
      className="block size-[30px]"
      onError={(event) => {
        // Swap the image for the glyph it stands in for. The reaction is the
        // point; the asset is how it looks.
        const img = event.currentTarget;
        const text = document.createElement("span");
        text.className = "block text-[30px] leading-none";
        text.textContent = emoji;
        img.replaceWith(text);
      }}
    />
  );
}
