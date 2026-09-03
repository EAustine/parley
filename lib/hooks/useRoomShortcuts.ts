"use client";

import { useEffect, useRef } from "react";

import { matchShortcut, type ShortcutAction } from "@/lib/room/shortcuts";
import type { FocusTarget } from "@/lib/room/typing";

/**
 * §9's shortcuts, dispatched from a pure matcher.
 *
 * The decision moved to `lib/room/shortcuts.ts` for two reasons. `?` could not
 * be added here at all — this hook began by returning unless a modifier was
 * held, before inspecting any key — and the hook had no testable core:
 * `check:room` tested `isTyping` in isolation while nothing tested that the
 * handler called it, so deleting the call failed nothing.
 *
 * `Cmd/Ctrl+D` and `Cmd/Ctrl+E` are browser shortcuts, so both are prevented.
 * That is only defensible because the typing suppression in the matcher is
 * real: taking over Cmd+D while someone types into a field would swallow a
 * keystroke they meant.
 *
 * `?` is prevented too, and needs to be — it is an ordinary printable
 * character, so claiming it anywhere near a text field would be worse than
 * claiming a chord. The matcher refuses it whenever focus is in one.
 */
export function useRoomShortcuts(handlers: {
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleChat: () => void;
  onShowHelp: () => void;
}) {
  // Read inside the listener so a changed handler does not tear down and
  // re-establish the subscription.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = matchShortcut(event, event.target as FocusTarget);
      if (!action) return;
      event.preventDefault();

      const run: Record<ShortcutAction, () => void> = {
        mic: ref.current.onToggleMic,
        camera: ref.current.onToggleCamera,
        chat: ref.current.onToggleChat,
        help: ref.current.onShowHelp,
      };
      run[action]();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
