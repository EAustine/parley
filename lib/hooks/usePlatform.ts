"use client";

import { useEffect, useState } from "react";

/**
 * Mac or not, for shortcut notation.
 *
 * Read after mount rather than during render: the server has no `navigator`,
 * and a first paint saying ⌘ before correcting itself to Ctrl is worse than
 * one that starts correct for the commoner case — so `other` is the default.
 *
 * `navigator.platform` is deprecated and Chrome now returns a frozen value on
 * Mac, so the user agent is what is left.
 *
 * Shared between the shortcuts dialog and the control tooltips deliberately.
 * Three tooltips used to hardcode "⌘D", "⌘E" and "⌘⌥C", telling a Windows user
 * to press a key their keyboard does not have; publishing the same facts in a
 * dialog from a second source would have put the wrong answer in two places.
 */
export function usePlatform(): "mac" | "other" {
  const [platform, setPlatform] = useState<"mac" | "other">("other");
  useEffect(() => {
    setPlatform(/Mac|iPhone|iPad/.test(navigator.userAgent) ? "mac" : "other");
  }, []);
  return platform;
}
