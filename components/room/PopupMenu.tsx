"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A menu button, with the keyboard behaviour `role="menu"` promises.
 *
 * Written once for B1's Leave menu and reused by B2's overflow menu, rather
 * than twice — the arrow-key handling is exactly the sort of thing that gets
 * fixed in one copy.
 *
 * `CLAUDE.md` makes the standard non-negotiable in the other direction already:
 * "the ARIA attribute is what promises a trap, so using it without one is the
 * lie." A `role="menu"` with no arrow keys is the same lie somewhere quieter,
 * so: arrows move, Home and End jump, Escape closes and returns focus to the
 * trigger, Tab out closes, and focus enters the menu on open.
 *
 * It does **not** trap focus, and should not. The floor traps modal surfaces
 * and leaves everything else reachable; a menu is not a task, and the room has
 * to stay usable behind it — §3.4 requires the control bar to remain reachable,
 * and mute is a privacy control.
 */
export function PopupMenu({
  id,
  menuLabel,
  trigger,
  triggerClassName,
  triggerLabel,
  children,
}: {
  id: string;
  /** Names the menu itself, for a screen reader listing its items. */
  menuLabel: string;
  trigger: React.ReactNode;
  triggerClassName: string;
  /** Only for an icon-only trigger — rule 7. */
  triggerLabel?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    // Returning focus is what makes Escape a way *back* rather than a way out.
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
  }, [open]);

  /**
   * `pointerdown` rather than `click`: a press that lands on another control
   * should close this *and* reach that control, and waiting for `click` puts
   * the close after the other button's handler has already run against a menu
   * that was still open.
   */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      // No focus return: the pointer has already moved attention elsewhere,
      // and pulling focus back to the trigger would be the surprise.
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
      // Tabbing out closes. Without this the menu stays open behind the control
      // bar, and the next Enter hits an item nobody can see.
      close(false);
    }
  };

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={triggerLabel}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          // Opening straight onto an item, which is what a menu button does.
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
        data-open={open ? "" : undefined}
      >
        {trigger}
      </button>

      <div
        ref={menuRef}
        id={id}
        role="menu"
        aria-label={menuLabel}
        // `hidden`, and our own base layer declares `[hidden] { display: none
        // !important }` rather than relying on Tailwind's preflight — the
        // testing rule about a correctness property resting on a third-party
        // reset.
        hidden={!open}
        onKeyDown={onMenuKeyDown}
        className="absolute bottom-[calc(100%+8px)] right-0 z-40 min-w-[260px] rounded-xl border border-boundary bg-popover p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
      >
        {children(() => close(false))}
      </div>
    </div>
  );
}

/**
 * One item. A title, and — where the consequence is not obvious from the title
 * — a second line saying what happens.
 *
 * B1 asks for that second line on the Leave menu because "Leave" and "End" are
 * one word apart and worlds apart in consequence. It is optional here because
 * "Keyboard shortcuts" needs no explanation, and prose under an obvious label
 * is noise.
 */
export function MenuItem({
  icon,
  title,
  detail,
  critical = false,
  trailing,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  critical?: boolean;
  /** A shortcut chord, or anything else that belongs at the end of the row. */
  trailing?: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      /*
       * `min-h-11` — 44px, and it is not decorative.
       *
       * Padding plus one line of `type-body` is 10 + 22 + 10 = **42px**, and
       * `check:targets` said so on its first run against the overflow menu.
       * The Leave menu cleared the floor only because both of its items carry a
       * second line; an item without one was two pixels short, on the room
       * surface where the floor is not negotiable.
       *
       * A floor rather than a fixed height, so the two-line items keep growing.
       */
      className="flex min-h-11 w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
      // Rule 5: hue is spent on destructive actions. `--state-critical` on
      // `--popover` is 5.42:1 — an opaque surface, not the scrim, which is
      // rule 4's amendment and why this menu is not drawn over video.
      style={{ color: critical ? "var(--state-critical)" : "var(--foreground)" }}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block type-body font-medium">{title}</span>
        {detail && (
          // `--muted-foreground` even on a destructive item: the hue belongs to
          // the action's name, and tinting its explanation spends chroma on
          // prose.
          <span className="mt-0.5 block type-caption font-normal text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
      {trailing && (
        <span className="type-caption shrink-0 text-muted-foreground">{trailing}</span>
      )}
    </button>
  );
}
