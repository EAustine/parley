import { toast } from "sonner";

/**
 * Set a meeting's waiting room — §3.2, v1.5 A1.
 *
 * The write on its own, because the switch's two in-product homes hold their
 * state differently and only this part is common. Pre-join owns local state and
 * needs to revert it on failure; the room's overflow menu owns none, because the
 * host is already polling the queue every couple of seconds and that poll
 * carries the door's real value. A menu item with its own optimistic copy would
 * be a second source of truth for the same fact, disagreeing for a second or two
 * after every change — and the menu closes on activation anyway, so nobody is
 * looking at the label while it catches up.
 *
 * Returns whether it landed, so a caller holding state can put it back.
 *
 * **It says so when it fails**, and that is the point rather than a courtesy.
 * This is a security control: a host who flips it, sees it flip, and is never
 * told the write failed believes the door is shut when it is open.
 */
export async function writeDoor(code: string, next: boolean): Promise<boolean> {
  try {
    const response = await fetch(`/api/meetings/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waitingRoom: next }),
    });
    if (!response.ok) throw new Error("patch failed");
    toast.success(next ? "Waiting room on" : "Waiting room off");
    return true;
  } catch {
    toast.error(
      `That didn't save. The waiting room is still ${next ? "off" : "on"}.`,
    );
    return false;
  }
}
