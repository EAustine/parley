"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { CONTROL_MOTION } from "@/lib/motion";

/**
 * Leave, and — for a host — "End meeting for everyone". v1.3 B1.
 *
 * `CLAUDE.md`'s vocabulary has always said these are different actions that are
 * never conflated. Only Leave existed, so a host who was finished could not
 * finish it: the room stayed open and the link kept working.
 *
 * **The whole button opens the menu. It is not a split button.** B1: "A split
 * puts two actions inside one control at different coordinates, and on a 40px
 * mobile bar the target separating 'leave' from 'end this for everyone' is
 * about 30px wide. That is a mis-click costing other people their meeting."
 *
 * **A guest gets no menu and no chevron.** They have one option, so the button
 * simply does it. A menu with one item, or a chevron opening something
 * disabled, is worse than the button they already had — and the chevron is the
 * only thing that would promise a choice they do not have.
 *
 * ## Why this is hand-built
 *
 * `ReactionPicker` uses Radix `Popover`, and this could have. A popover
 * announces itself as a dialog, and its content is a group of buttons reached
 * by Tab — which is fine for six emoji and wrong here, where the two items are
 * a routine action and an irreversible one and the pattern people expect is a
 * menu.
 *
 * So it is a menu, with the keyboard behaviour `role="menu"` actually promises:
 * arrows move between items, Home and End jump, Escape closes and returns focus
 * to the trigger. `CLAUDE.md` makes that non-negotiable in the other direction
 * already — "the ARIA attribute is what promises a trap, so using it without
 * one is the lie" — and a menu role with no arrow keys is the same lie in a
 * quieter place.
 *
 * It does **not** trap focus, and should not. The floor traps modal surfaces
 * and leaves everything else reachable; the dialog behind the destructive item
 * is the modal one, and it is native.
 */
export function LeaveControl({
  isHost,
  onLeave,
  onEnd,
}: {
  isHost: boolean;
  onLeave: () => void;
  /** Only ever called for a host — the menu is the only path to it. */
  onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const items = () =>
    Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    // Returning focus is what makes Escape a way *back* rather than a way out.
    if (returnFocus) trigger.current?.focus();
  };

  // Focus the first item on open, which is what makes the menu keyboard-usable
  // at all — and what lets Escape have somewhere to return from.
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
  }, [open]);

  /**
   * Dismissal from outside the menu.
   *
   * `pointerdown` rather than `click`: a click that lands on another control
   * should close this and reach that control, and waiting for `click` puts the
   * close after the other button's own handler has already run against a menu
   * that was still open.
   */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
      // No focus return: the pointer has already moved attention elsewhere,
      // and yanking focus back to Leave would be the surprise.
      close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(at + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(at - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === "Tab") {
      // Tabbing out of a menu closes it. Without this the menu stays open
      // behind the control bar, and the next Enter hits an item nobody can see.
      close(false);
    }
  };

  /* The one non-circular control. §3.4: shape distinguishes it as well as
     colour, so it is unmistakable without relying on hue. */
  const pill =
    "ml-1 flex h-12 items-center gap-2 rounded-full bg-destructive px-6 " +
    "type-body font-medium text-destructive-foreground hover:bg-destructive/90 " +
    `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:ml-2 ${CONTROL_MOTION}`;

  if (!isHost) {
    return (
      <button type="button" onClick={onLeave} className={pill}>
        <HugeiconsIcon
          icon={ICONS.leave.icon}
          size={20}
          strokeWidth={1.5}
          color="currentColor"
          aria-hidden
        />
        Leave
      </button>
    );
  }

  return (
    <div className="relative inline-flex">
      <button
        ref={trigger}
        type="button"
        // A disclosure, not a state toggle — the floor's second pattern: a noun
        // name with `aria-expanded` and `aria-controls`. "Leave" stays the
        // name, because that is still what the control is for.
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="leave-menu"
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          // Opening straight onto an item, which is what a menu button does.
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={pill}
      >
        <HugeiconsIcon
          icon={ICONS.leave.icon}
          size={20}
          strokeWidth={1.5}
          color="currentColor"
          aria-hidden
        />
        Leave
        <HugeiconsIcon
          icon={ICONS[open ? "chevronDown" : "chevronUp"].icon}
          size={16}
          strokeWidth={2}
          color="currentColor"
          aria-hidden
          className="opacity-85"
        />
      </button>

      <div
        ref={menu}
        id="leave-menu"
        role="menu"
        aria-label="Leave options"
        // `hidden`, and our own base layer declares `[hidden] { display: none
        // !important }` rather than relying on Tailwind's preflight — the
        // testing rule about a correctness property resting on a third-party
        // reset.
        hidden={!open}
        onKeyDown={onMenuKeyDown}
        className="absolute bottom-[calc(100%+8px)] right-0 z-40 min-w-[260px] rounded-xl border border-boundary bg-popover p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
      >
        <MenuItem
          icon="leave"
          title="Leave the meeting"
          detail="It carries on without you. Your link still works."
          onSelect={() => {
            close(false);
            onLeave();
          }}
        />
        <hr className="my-1.5 mx-1 border-t border-border" />
        <MenuItem
          icon="close"
          title="End meeting for everyone"
          detail="Everyone is disconnected and the link stops working."
          // Rule 5: hue is spent on destructive actions. `--state-critical` on
          // `--popover` is 5.42:1 — an opaque surface, not the scrim, which is
          // rule 4's amendment and why this menu is not drawn over video.
          critical
          onSelect={() => {
            close(false);
            onEnd();
          }}
        />
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  title,
  detail,
  critical = false,
  onSelect,
}: {
  icon: keyof typeof ICONS;
  title: string;
  detail: string;
  critical?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
      style={{ color: critical ? "var(--state-critical)" : "var(--foreground)" }}
    >
      <HugeiconsIcon
        icon={ICONS[icon].icon}
        size={18}
        strokeWidth={1.5}
        color="currentColor"
        aria-hidden
        className="mt-0.5 shrink-0"
      />
      <span className="min-w-0">
        <span className="block type-body font-medium">{title}</span>
        {/*
          The second line is the whole point of the menu: B1 asks for it because
          "Leave" and "End" are one word apart and worlds apart in consequence.
          `--muted-foreground` even on the destructive item — the hue belongs to
          the action's name, and tinting its explanation too would spend chroma
          on prose.
        */}
        <span className="mt-0.5 block type-caption font-normal text-muted-foreground">
          {detail}
        </span>
      </span>
    </button>
  );
}
