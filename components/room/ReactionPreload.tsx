"use client";

import { useEffect } from "react";

import { REACTION_ASSET_URLS } from "@/lib/room/reaction-assets";

/**
 * Warm the six reaction images — v1.3 C6.
 *
 * "A reaction that arrives before its image is worse than a flat one." True,
 * and it is not a reason to fetch them at room entry.
 *
 * **After the connection is healthy, not on mount.** Room entry *is* the join
 * path: a token round trip, an ICE negotiation, and the first video frames, on
 * a phone, over mobile data, on the highest-traffic route in the product.
 * Twenty-two kilobytes competing with that trades time-to-first-video for a
 * decoration nobody has used yet. Connect, get media flowing, then fetch.
 *
 * The exposure that leaves is a reaction in the first second or so of a
 * session, which arrives as the platform glyph and then as the asset — and
 * `ReactionOverlay` falls back to the glyph anyway, so the worst case is the
 * behaviour that shipped before this existed.
 *
 * `new Image()` rather than `<link rel="preload">`: the tag is declarative and
 * would fire when React commits it, which is the timing being avoided. This
 * runs when the effect says so.
 */
export function ReactionPreload({ ready }: { ready: boolean }) {
  useEffect(() => {
    if (!ready) return;
    // Held in a local so the browser cannot collect them mid-fetch. Nothing
    // reads it: the point is the HTTP cache, which is where the overlay's own
    // `<img>` will look.
    const warming = REACTION_ASSET_URLS.map((url) => {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      return image;
    });
    return () => {
      // A room left before the fetches land should not keep them alive.
      for (const image of warming) image.src = "";
    };
  }, [ready]);

  return null;
}
