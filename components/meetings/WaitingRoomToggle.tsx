"use client";

import { DoorField } from "@/components/meetings/DoorField";
import { useDoor } from "@/lib/hooks/useDoor";

/**
 * The door on a meeting that already exists — v1.5 A1, §3.2.
 *
 * Two of the switch's three homes use this: the host's pre-join, and the room
 * itself. The third, the schedule form, drives `DoorField` directly because
 * there is no meeting to `PATCH` until it submits.
 *
 * ## Optimistic, and it reverts
 *
 * The checkbox moves immediately and goes back if the write fails. A control
 * that waits for a round trip before moving reads as broken on a slow
 * connection, and this one is often used seconds before a meeting starts.
 *
 * **The revert is the part that matters.** This is a security control: a host
 * who ticks it, sees it tick, and is never told the write failed believes the
 * door is shut when it is open. Silent failure is the worst outcome in this
 * product generally; here it is the specific outcome the feature exists to
 * prevent. So a failure puts the control back where it was *and* says so.
 */
export function WaitingRoomToggle({
  code,
  initial,
  id = "waiting-room",
}: {
  code: string;
  initial: boolean;
  id?: string;
}) {
  const door = useDoor(code, initial);

  return (
    <DoorField
      id={id}
      checked={door.on}
      onChange={door.set}
      disabled={door.saving}
      describedBy={`${id}-help`}
      // Pre-join is a touch-primary surface: 44px, not 28.
      touch
    />
  );
}
