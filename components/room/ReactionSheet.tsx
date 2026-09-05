"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { REACTIONS, REACTION_NAMES, type Reaction } from "@/lib/room/messages";
import { REACTION_ASSETS } from "@/lib/room/reaction-assets";

/**
 * The six emoji, on a phone — BUILD-PLAN v1.4 B2.
 *
 * ## Why they left the overflow menu
 *
 * They were a row of `role="menuitem"` buttons inside it, and pressing one
 * closed the menu. That was not a bug in the menu: `role="menu"` dismisses on
 * activation, which is the pattern and what a screen reader expects. The bug was
 * that reactions were menu items at all.
 *
 * §3.6 now states the two rules that cannot hold in one surface: **the picker
 * stays open, and everything else closes on activation.** Reactions are a burst
 * medium — three claps in a row is the normal use, not an edge case — so a
 * surface that dismisses on each send makes the common case cost three
 * openings.
 *
 * ## Why a sheet rather than a popover
 *
 * C2 put them inline in the menu to avoid "a second popup inside the first",
 * and that reasoning was about **space**. It does not survive a bottom sheet:
 * full width, six targets that clear the 44px floor with room, no clipping
 * possible by construction — the failure that hid this menu off the left edge
 * in the first place — and repeat presses free.
 *
 * ## What closes it
 *
 * Its own close control, Escape, or a press outside. Never a selection. That is
 * §3.6's acceptance criterion in one sentence, and it is why this is not a menu
 * and carries no `menuitem` anywhere.
 */
export function ReactionSheet({
  open,
  onReact,
  onClose,
}: {
  open: boolean;
  onReact: (emoji: Reaction) => void;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState<Reaction | null>(null);

  // Focus in on open — the floor's non-modal panel behaviour, and the same
  // shape `RoomPanel` uses. This does not trap: the room stays live behind it
  // and the control bar has to stay reachable, because mute is a privacy
  // control.
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLButtonElement>("button")?.focus({
      preventScroll: true,
    });
  }, [open]);

  /**
   * A press outside closes it.
   *
   * `pointerdown` rather than `click`, for the reason `PopupMenu` gives: a press
   * that lands on another control should close this *and* reach that control,
   * and waiting for `click` runs the other button's handler against a sheet
   * that is still open.
   */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (sheet.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  return (
    <div
      ref={sheet}
      hidden={!open}
      /*
       * `hidden` does the hiding, and `app/globals.css` declares
       * `[hidden] { display: none !important }` in our own base layer so the
       * guarantee does not rest on Tailwind's preflight.
       *
       * Above the control bar by its *measured* height, the same variable the
       * mute prompt hangs from — the bar moves with wrapping and the safe-area
       * inset, so a constant would be wrong on exactly the devices this exists
       * for. `z-20`, below the bar's `z-30`: the bar stays reachable.
       */
      className={`${open ? "flex" : "hidden"} absolute inset-x-2 bottom-[calc(var(--parley-controls-h)+0.5rem)] z-20 flex-col gap-2 rounded-xl border border-boundary bg-popover p-2`}
      role="group"
      aria-label="Send a reaction"
    >
      <div className="flex items-center justify-between gap-2 pl-2">
        <span className="type-caption text-muted-foreground">Send a reaction</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reactions"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
        >
          <HugeiconsIcon
            icon={ICONS.close.icon}
            size={20}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
        </button>
      </div>

      <div
        className="flex items-center justify-between gap-1"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              setPressed(emoji);
              onReact(emoji);
              // Deliberately no close. This is the whole point of the surface.
            }}
            onAnimationEnd={() => setPressed((p) => (p === emoji ? null : p))}
            // The emoji is the label visually; the name is what a screen reader
            // reads, because "😮" is not a spoken word.
            aria-label={`React with ${REACTION_NAMES[emoji]}`}
            className={`flex h-12 flex-1 items-center justify-center rounded-lg transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]${
              pressed === emoji ? " parley-reaction-press" : ""
            }`}
          >
            {/* The same Fluent 3D asset the reaction floats as — v1.3 C6. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={REACTION_ASSETS[emoji]}
              alt=""
              aria-hidden
              width={28}
              height={28}
              draggable={false}
              className="size-7"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
