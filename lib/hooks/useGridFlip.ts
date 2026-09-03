"use client";

import { useLayoutEffect, useRef } from "react";

/** CLAUDE.md's grid-reflow step. */
export const REFLOW_MS = 200;
export const REFLOW_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * FLIP for the participant grid — CLAUDE.md's "Grid reflow on join/leave |
 * 200ms, FLIP".
 *
 * The grid used to declare `transition: grid-template-columns 200ms`, which
 * never once ran. `grid-template-columns` interpolates only between track lists
 * of **equal length**, and a join changes the count every time — measured three
 * ways in the suite's own Chromium: 2→3 tracks produces zero animations and
 * jumps straight to the final widths, while a same-length change interpolates
 * normally. The declared motion was decorative from the day it was written, and
 * the reflow test only ever asserted the end-state shape, so nothing noticed.
 *
 * FLIP is what actually works: measure where every tile was, let the browser
 * lay out where it now is, then transform each tile back to where it started
 * and animate to identity. The browser does the layout once; the animation is
 * pure `translate`/`scale`.
 *
 * **Per-tile is permitted here because it is transform only.** The rule it
 * appears to break — "animate the container, not each tile" — was aimed at
 * layout-triggering properties, where sixteen simultaneous transitions thrash.
 * `transform` and `opacity` never touch layout and run on the compositor.
 * CLAUDE.md now states the exemption explicitly.
 *
 * Why it earns its keep at all: a panel close is initiated by the person
 * watching it, so instant is fine. **A join is initiated by someone else**, and
 * the reflow is the only signal it happened — the motion says the grid
 * rearranged and lets you follow where people went. It carries information.
 */
export function useGridFlip(
  container: React.RefObject<HTMLElement | null>,
  /** Changes whenever the set or order of tiles could have changed. */
  signature: string,
) {
  const previous = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;

    const tiles = [
      ...root.querySelectorAll<HTMLElement>("[data-participant], [data-overflow]"),
    ];
    const keyOf = (el: HTMLElement) =>
      el.dataset.participant ?? (el.dataset.overflow ? "__overflow" : "");

    /*
     * One batched read, then one batched write. Interleaving
     * `getBoundingClientRect` with style writes forces a synchronous layout per
     * tile — sixteen of them, which is the thrash the container-only rule was
     * written to prevent, reintroduced by the loop rather than by the property.
     */
    const now = new Map<string, DOMRect>();
    for (const el of tiles) now.set(keyOf(el), el.getBoundingClientRect());

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduce) {
      for (const el of tiles) {
        const key = keyOf(el);
        const to = now.get(key);
        const from = previous.current.get(key);
        if (!to || to.width === 0 || to.height === 0) continue;

        if (!from) {
          /*
           * Arriving. There is no previous position to invert, so it fades and
           * scales in rather than flying from nowhere — CLAUDE.md is explicit
           * that a tile with no previous position does not FLIP.
           */
          el.animate(
            [
              { opacity: 0, scale: "0.96" },
              { opacity: 1, scale: "1" },
            ],
            { duration: REFLOW_MS, easing: REFLOW_EASING },
          );
          continue;
        }

        const dx = from.x - to.x;
        const dy = from.y - to.y;
        const sx = from.width / to.width;
        const sy = from.height / to.height;

        // Nothing moved — do not spend a compositor layer saying so.
        if (
          Math.abs(dx) < 1 &&
          Math.abs(dy) < 1 &&
          Math.abs(sx - 1) < 0.01 &&
          Math.abs(sy - 1) < 0.01
        ) {
          continue;
        }

        /*
         * The tile element, never the `<video>` inside it. Transforming the
         * video itself repaints its texture every frame; transforming an
         * ancestor lets the compositor move the existing layer.
         */
        el.animate(
          [
            { translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` },
            { translate: "0px 0px", scale: "1" },
          ],
          { duration: REFLOW_MS, easing: REFLOW_EASING },
        );
      }
    }

    // Departing tiles are simply gone by now; CLAUDE.md does not animate them.
    previous.current = now;
  }, [container, signature]);
}
