import { isTyping, type FocusTarget } from "@/lib/room/typing";

/**
 * Which key does what, as a pure function over the event.
 *
 * Extracted from `useRoomShortcuts` for two reasons. The first is `?`, which
 * could not be added to the old hook at all: it began `if (!(event.metaKey ||
 * event.ctrlKey)) return;` before inspecting any key, so an unmodified `?`
 * never reached the body.
 *
 * The second is that the hook had no testable core. `check:room` tests
 * `isTyping` in isolation and nothing tested that the handler called it —
 * delete the call and every check stayed green, which is exactly what
 * CLAUDE.md's first testing rule is about. `matchShortcut` is where the
 * decision lives now, and `check:a11y` pins it.
 */

export type ShortcutAction = "mic" | "camera" | "chat" | "help";

export type Shortcut = {
  action: ShortcutAction;
  /** Rendered in the dialog and in the control's tooltip. */
  label: string;
  /** Modifier-and-key notation, formatted per platform by `formatChord`. */
  chord: { mod?: boolean; alt?: boolean; shift?: boolean; key: string };
};

/**
 * §9's list, and the single source for the dialog, the tooltips and the
 * matcher.
 *
 * `RoomControls` used to hardcode "⌘D", "⌘E" and "⌘⌥C" in three tooltips,
 * which told a Windows user to press ⌘ for a Ctrl binding. Publishing the same
 * facts in a dialog would have put the wrong answer in two places.
 */
export const SHORTCUTS: readonly Shortcut[] = [
  { action: "mic", label: "Turn the microphone on or off", chord: { mod: true, key: "D" } },
  { action: "camera", label: "Turn the camera on or off", chord: { mod: true, key: "E" } },
  { action: "chat", label: "Open or close chat", chord: { mod: true, alt: true, key: "C" } },
  { action: "help", label: "Show keyboard shortcuts", chord: { shift: true, key: "?" } },
] as const;

/**
 * What this event should do, or null.
 *
 * Typing suppression first and unconditionally. Taking over `?` — an ordinary
 * printable character — while someone types a message would be far worse than
 * taking over Cmd+D, and the old hook's modifier check happened to shield it
 * from that question.
 */
export function matchShortcut(
  event: {
    key: string;
    code?: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    repeat?: boolean;
    /**
     * Widened to `unknown` because a real `KeyboardEvent.target` is
     * `EventTarget | null`, which shares no properties with `FocusTarget`.
     * `isTyping` already duck-types what it is handed and returns false for
     * anything that is not an object with the fields it wants, so narrowing
     * here would only mean the caller casting.
     */
    target?: unknown;
  },
  target?: FocusTarget,
): ShortcutAction | null {
  if (isTyping((target ?? event.target ?? null) as FocusTarget)) return null;
  // Holding a key down should toggle the mic once, not forty times.
  if (event.repeat) return null;

  const mod = event.metaKey || event.ctrlKey;

  /**
   * `?` needs no modifier and must not be claimed when one is held —
   * Ctrl+? and Cmd+? belong to the browser.
   *
   * Matched on the produced character rather than on Shift plus a key,
   * because which physical key yields `?` differs by layout: shifted `/` on
   * US, shifted `,` on French, an unshifted key on some others. Requiring
   * Shift would silently exclude every layout where it is not shifted.
   */
  if (!mod && !event.altKey && event.key === "?") return "help";

  if (!mod) return null;

  if (event.altKey) {
    // §9: Cmd/Ctrl+Alt+C. Alt is what separates it from the two below.
    return event.key.toLowerCase() === "c" || event.code === "KeyC" ? "chat" : null;
  }

  /**
   * Shift excluded deliberately. Ctrl+Shift+D is "duplicate" or "bookmark all
   * tabs" in several browsers, and the old matcher claimed it — a shortcut
   * that fires on a chord nobody meant is worse than one that misses.
   *
   * `event.key` rather than `event.code`: on Dvorak or AZERTY the physical D
   * is not where D is, and the shortcut is named after the printed letter.
   */
  if (event.shiftKey) return null;

  const key = event.key.toLowerCase();
  if (key === "d") return "mic";
  if (key === "e") return "camera";
  return null;
}

/**
 * "⌘D" on a Mac, "Ctrl+D" everywhere else.
 *
 * The platform is a parameter rather than a `navigator` read so the dialog can
 * be checked without a browser, and so the caller decides once.
 */
export function formatChord(
  chord: Shortcut["chord"],
  platform: "mac" | "other",
): string {
  const mac = platform === "mac";
  const parts: string[] = [];
  if (chord.mod) parts.push(mac ? "⌘" : "Ctrl");
  if (chord.alt) parts.push(mac ? "⌥" : "Alt");
  // `?` already implies Shift on most layouts, and "Shift+?" reads as a
  // different key. The others have no shifted form in this table.
  if (chord.shift && chord.key !== "?") parts.push(mac ? "⇧" : "Shift");
  parts.push(chord.key);
  return mac ? parts.join("") : parts.join("+");
}

/** The chord for one action, formatted — for a tooltip. */
export function chordFor(action: ShortcutAction, platform: "mac" | "other"): string {
  const shortcut = SHORTCUTS.find((s) => s.action === action);
  return shortcut ? formatChord(shortcut.chord, platform) : "";
}
