"use client";

/**
 * "Press ? for keyboard shortcuts" — visible only while focused.
 *
 * §9: "Discoverability is a focus-visible hint, not a control in the bar." An
 * eighth control was considered and rejected, and the reasoning is worth
 * keeping next to the code: a *keyboard* shortcuts dialog is no use to the
 * touch visitor a bar control would have been added for, because a phone has
 * no keys to press. The population that needs to discover `?` is exactly the
 * population that reaches this by tabbing.
 *
 * The skip-link pattern, so: first focusable thing in the room, off-screen
 * until it takes focus. A mouse user never sees it, a touch user never
 * receives it, and a screen reader reads it on the first Tab.
 *
 * A button rather than static text. Someone who has just been told a key
 * exists should not have to leave the element to use it — Enter opens the same
 * dialog `?` does.
 */
export function ShortcutsHint({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="
        sr-only
        focus-visible:not-sr-only focus-visible:absolute focus-visible:left-3
        focus-visible:top-3 focus-visible:z-50 focus-visible:flex
        focus-visible:h-11 focus-visible:items-center focus-visible:rounded-lg
        focus-visible:px-4 focus-visible:type-small
      "
      style={{
        // Opaque, not the scrim: rule 4's amendment. This lands over video and
        // an interactive control needs a determinate ground, not one that
        // depends on what is on camera.
        background: "var(--popover)",
        border: "1px solid var(--boundary)",
        color: "var(--foreground)",
      }}
    >
      Press ? for keyboard shortcuts
    </button>
  );
}
