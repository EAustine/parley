"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { CONTROL_MOTION } from "@/lib/motion";
import { MenuItem, PopupMenu } from "@/components/shared/PopupMenu";

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
 * The menu behaviour itself lives in `PopupMenu`, shared with B2's overflow
 * menu rather than written twice.
 */

/* The one non-circular control. §3.4: shape distinguishes it as well as colour,
   so it is unmistakable without relying on hue. */
const PILL =
  "ml-1 flex h-12 items-center gap-2 rounded-full bg-destructive px-6 " +
  "type-body font-medium text-destructive-foreground hover:bg-destructive/90 " +
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:ml-2 ${CONTROL_MOTION}`;

function LeaveIcon() {
  return (
    <HugeiconsIcon
      icon={ICONS.leave.icon}
      size={20}
      strokeWidth={1.5}
      color="currentColor"
      aria-hidden
    />
  );
}

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
  if (!isHost) {
    return (
      <button type="button" onClick={onLeave} className={PILL}>
        <LeaveIcon />
        Leave
      </button>
    );
  }

  return (
    <PopupMenu
      id="leave-menu"
      menuLabel="Leave options"
      triggerClassName={PILL}
      trigger={
        <>
          <LeaveIcon />
          Leave
          {/* The chevron is the promise of a choice, which is exactly why a
              guest does not get one. */}
          <HugeiconsIcon
            icon={ICONS.chevronUp.icon}
            size={16}
            strokeWidth={2}
            color="currentColor"
            aria-hidden
            // Rotates from the trigger's own `data-open`, since `open` lives in
            // `PopupMenu`. `[[data-open]_&]` is "an ancestor is open".
            className="opacity-85 transition-transform duration-[120ms] [[data-open]_&]:rotate-180"
          />
        </>
      }
    >
      {(close) => (
        <>
          <MenuItem
            icon={<LeaveIcon />}
            title="Leave the meeting"
            detail="It carries on without you. Your link still works."
            onSelect={() => {
              close();
              onLeave();
            }}
          />
          <hr className="mx-1 my-1.5 border-t border-border" />
          <MenuItem
            icon={
              <HugeiconsIcon
                icon={ICONS.close.icon}
                size={18}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
            }
            title="End meeting for everyone"
            detail="Everyone is disconnected and the link stops working."
            critical
            onSelect={() => {
              close();
              onEnd();
            }}
          />
        </>
      )}
    </PopupMenu>
  );
}
