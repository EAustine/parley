"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { CONTROL_MOTION } from "@/lib/motion";
import { useEffect, useState } from "react";

import { chordFor } from "@/lib/room/shortcuts";
import { usePlatform } from "@/lib/hooks/usePlatform";
import { MenuItem, PopupMenu } from "@/components/room/PopupMenu";
import { REACTIONS, REACTION_NAMES, type Reaction } from "@/lib/room/messages";

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
  onReact,
  share,
}: {
  onOpenDevices: () => void;
  onOpenShortcuts: () => void;
  /** v1.3 C2: reactions live here below 900px, where the bar has no room. */
  onReact: (emoji: Reaction) => void;
  share: { supported: boolean; sharing: boolean; toggle: () => void };
}) {
  const platform = usePlatform();

  /**
   * 900px — the design's own breakpoint, and the one the bar uses to decide
   * which controls it keeps. Below it the bar is C2's six and this menu carries
   * Present and reactions; above it they are in the bar and this menu carries
   * shortcuts instead.
   *
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
    const query = window.matchMedia("(min-width: 900px)");
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
      /*
       * Ghost in `--on-scrim-muted`, filled in `--foreground` — the same tier
       * as chat and participants. The ghost state is transparent, so its
       * backdrop is the bar's scrim and rule 4 applies: `--muted-foreground`
       * is 2.97:1 there, `--on-scrim-muted` is 4.70.
       */
      triggerClassName={`flex size-11 items-center justify-center rounded-full border border-transparent text-[var(--on-scrim-muted)] hover:bg-[var(--secondary)] data-[open]:border-boundary data-[open]:bg-[var(--secondary)] data-[open]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] ${CONTROL_MOTION}`}
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
          {/*
            What the bar hands over below 900px — C2: "Present and reactions
            move into the overflow menu". Rendered only at that width, because
            the same action in two places at once is how a person learns to
            trust neither.
          */}
          {!wide && (
            <>
              <ReactionRow
                onReact={(emoji) => {
                  close();
                  onReact(emoji);
                }}
              />
              {share.supported && (
                <MenuItem
                  icon={
                    <HugeiconsIcon
                      icon={ICONS[share.sharing ? "stopShare" : "screenShare"].icon}
                      size={18}
                      strokeWidth={1.5}
                      color="currentColor"
                      aria-hidden
                    />
                  }
                  title={share.sharing ? "Stop presenting" : "Share your screen"}
                  onSelect={() => {
                    close();
                    share.toggle();
                  }}
                />
              )}
              <hr className="mx-1 my-1.5 border-t border-border" />
            </>
          )}

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

/**
 * The six reactions, as a row inside the menu.
 *
 * A menu item that opened a *second* popup would be a popup inside a popup on
 * the surface with least room for either, so the emoji are the menu items. They
 * are laid out in a row rather than a column because six emoji stacked is most
 * of a phone screen, and because they are one choice rather than six unrelated
 * actions.
 *
 * Each is 44px — the room's floor — and each carries its name, since an emoji
 * has no accessible name of its own.
 */
function ReactionRow({ onReact }: { onReact: (emoji: Reaction) => void }) {
  return (
    <div className="flex items-center justify-between gap-0.5 px-1 py-1">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          onClick={() => onReact(emoji)}
          aria-label={`React with ${REACTION_NAMES[emoji]}`}
          className="flex size-11 items-center justify-center rounded-full text-[22px] hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
        >
          <span aria-hidden>{emoji}</span>
        </button>
      ))}
    </div>
  );
}
