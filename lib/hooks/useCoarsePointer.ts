"use client";

import { useEffect, useState } from "react";

/**
 * Is the primary pointer a finger?
 *
 * v1.3 D3 wants "a 15-minute select on desktop, native `<input type="time">` on
 * mobile for the OS wheel" — two different elements, so this cannot be a media
 * query in CSS the way D1's hover rule is.
 *
 * **`(pointer: coarse)`, not a width.** The same question C5 settled and D1
 * restated: a narrow window on a laptop is not a phone, and a tablet at 1194px
 * is. What makes the native control worth having is the OS wheel a touch device
 * puts up for it, which is a property of the input device and not of the
 * viewport.
 *
 * Read after mount, like `usePlatform`: the server has no `matchMedia`, and
 * rendering the select first means a desktop — where the select is the right
 * answer — never swaps. A phone swaps once, on the first frame after
 * hydration, which is the cost of not guessing wrong on the server.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const read = () => setCoarse(query.matches);
    read();
    // A pointer can change under a running page — a tablet gaining a keyboard
    // case, a laptop's touchscreen taking over. Cheap to follow, and the
    // alternative is a control that is wrong until reload.
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  return coarse;
}
