"use client";

import { useEffect } from "react";

import { isTyping, type FocusTarget } from "@/lib/room/typing";

/**
 * `Cmd/Ctrl + D` mic, `Cmd/Ctrl + E` camera — §9, and §3.4's acceptance list.
 *
 * Both are browser shortcuts (bookmark, and search-bar focus in some
 * browsers), so both are prevented. That is only defensible because the
 * suppression below is real: taking over Cmd+D while someone is typing a name
 * into a field would be indefensible.
 *
 * Suppression is by *what has focus*, not by a flag some panel remembers to
 * set. `isContentEditable` and `role="textbox"` are included because a rich
 * text field is neither an input nor a textarea, and the chat composer in
 * Phase 5 will be exactly that kind of surface.
 */
export function useRoomShortcuts({
  onToggleMic,
  onToggleCamera,
}: {
  onToggleMic: () => void;
  onToggleCamera: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (isTyping(event.target as FocusTarget)) return;

      // `event.key` rather than `event.code`: on a Dvorak or AZERTY layout the
      // physical D key is not where D is, and the shortcut is named after the
      // letter people see printed on the cap.
      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        onToggleMic();
      } else if (key === "e") {
        event.preventDefault();
        onToggleCamera();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onToggleMic, onToggleCamera]);
}
