"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { CONTROL_MOTION } from "@/lib/motion";
import { useEffect, useState } from "react";

import { chordFor } from "@/lib/room/shortcuts";
import { usePlatform } from "@/lib/hooks/usePlatform";
import { MenuItem, PopupMenu } from "@/components/room/PopupMenu";

/**
 * The control bar's overflow — v1.3 B2, and the beginning of C2.
 *
 * B2 puts device settings here: "Its entry point is 'Audio and video settings'
 * in the control bar's overflow menu, which is where the design puts it." That
 * menu did not exist, and a feature reachable from nowhere is not shipped — so
 * it is built here rather than deferred to Track C, which is what the rule
 * about not leaving the product broken between phases asks for.
 *
 * **Scoped to what exists.** C2 moves Present and reactions in here on mobile
 * and gives the bar its three tiers; none of that is built yet, and adding
 * items for controls that are still in the bar would put the same action in two
 * places. What goes in now is device settings, and keyboard shortcuts — which
 * already exist behind `?` with no visible affordance at all, so this is the
 * first way to find them with a pointer.
 *
 * Shortcuts stay desktop-only: `?` needs a keyboard, and offering a list of
 * chords to someone on a phone is a menu item that leads to a dialog full of
 * keys they do not have.
 */
export function OverflowMenu({
  onOpenDevices,
  onOpenShortcuts,
}: {
  onOpenDevices: () => void;
  onOpenShortcuts: () => void;
}) {
  const platform = usePlatform();

  /**
   * Shortcuts are offered on a wide viewport only.
   *
   * `?` needs a keyboard, and a menu item leading to a dialog full of chords is
   * a dead end on a phone. The design gates it the same way — `.desk-only`
   * behind a width query — and a width query is the honest signal here: a small
   * window on a laptop has the keyboard but not the room, and the bar it
   * belongs to is what is short of space.
   *
   * Not CSS, deliberately. A `display: none` item still matches the menu's
   * `querySelectorAll` and cannot take focus, so arrow-key navigation would
   * stall on a row nobody can see. It has to be absent from the tree.
   */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return (
    <PopupMenu
      id="overflow-menu"
      menuLabel="More options"
      // The secondary tier: ghost at rest, filled while open. Same treatment as
      // chat and participants, because it is the same kind of control.
      triggerLabel="More options"
      triggerClassName={`flex size-11 items-center justify-center rounded-full border border-transparent text-foreground hover:bg-[var(--secondary)] data-[open]:border-boundary data-[open]:bg-[var(--secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${CONTROL_MOTION}`}
      trigger={
        <HugeiconsIcon
          icon={ICONS.more.icon}
          size={20}
          strokeWidth={1.5}
          color="currentColor"
          aria-hidden
        />
      }
    >
      {(close) => (
        <>
          <MenuItem
            icon={
              <HugeiconsIcon
                icon={ICONS.settings.icon}
                size={18}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
            }
            title="Audio and video settings"
            onSelect={() => {
              close();
              onOpenDevices();
            }}
          />
          {wide && (
            <MenuItem
              icon={
                <HugeiconsIcon
                  icon={ICONS.keyboard.icon}
                  size={18}
                  strokeWidth={1.5}
                  color="currentColor"
                  aria-hidden
                />
              }
              title="Keyboard shortcuts"
              trailing={chordFor("help", platform)}
              onSelect={() => {
                close();
                onOpenShortcuts();
              }}
            />
          )}
        </>
      )}
    </PopupMenu>
  );
}
