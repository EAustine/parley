"use client";

import { useEffect, useRef, useState } from "react";

/**
 * §3.4: the control bar auto-hides after 4s of pointer inactivity on desktop,
 * is always visible on touch, and reappears on any pointer movement, keypress,
 * or focus.
 *
 * "Always visible on touch" is not a shortcut — a touch device has no pointer
 * to move, so the gesture that brings controls back does not exist there. The
 * check is `(hover: none)`, which asks whether the input can hover at all,
 * rather than sniffing for a phone. A laptop with a touchscreen still hovers
 * and still hides.
 */
const IDLE_MS = 4000;

export function useControlVisibility(): boolean {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canHover = window.matchMedia("(hover: hover)");

    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };

    const arm = () => {
      clear();
      setVisible(true);
      if (!canHover.matches) return;
      timer.current = setTimeout(() => setVisible(false), IDLE_MS);
    };

    arm();

    // `focusin` rather than `focus`: focus does not bubble, and the whole
    // point is to catch a tab into a control that is currently invisible.
    const events = ["pointermove", "pointerdown", "keydown", "focusin"] as const;
    for (const event of events) window.addEventListener(event, arm);
    // Switching input modes mid-call re-decides it — plugging a mouse into a
    // tablet should start hiding, unplugging it should stop.
    canHover.addEventListener("change", arm);

    return () => {
      clear();
      for (const event of events) window.removeEventListener(event, arm);
      canHover.removeEventListener("change", arm);
    };
  }, []);

  return visible;
}
