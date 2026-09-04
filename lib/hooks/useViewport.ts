"use client";

import { useEffect, useState } from "react";

import type { Viewport } from "@/lib/room/layout";

/**
 * Desktop or mobile portrait — §3.4 gives them different behaviour, not just
 * different sizes, so this is a layout decision rather than a CSS breakpoint.
 *
 * Matched in JS because the two columns of the table differ in *kind*: desktop
 * overflows into a "+N" cell, mobile pages. No media query expresses "render a
 * different number of children".
 */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>("desktop");

  useEffect(() => {
    // Portrait as well as narrow: a phone held sideways gets the desktop grid,
    // which is the right call — the area is then wide enough for 3 across.
    const query = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    const apply = () => setViewport(query.matches ? "mobile" : "desktop");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return viewport;
}
