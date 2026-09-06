"use client";

import { useState } from "react";

import { writeDoor } from "@/lib/meetings/write-door";

/**
 * Setting the waiting room on a meeting that exists — §3.2, v1.5 A1.
 *
 * Shared because the switch has two homes on existing meetings and they are
 * different *controls*: pre-join draws a checkbox, and the room's overflow menu
 * draws a menu item that names the action. Only the writing is common, so only
 * the writing lives here.
 *
 * ## Optimistic, and it reverts
 *
 * The control moves immediately and goes back if the write fails. Waiting for a
 * round trip reads as broken on a slow connection, and this is often used
 * seconds before a meeting starts.
 *
 * **The revert is the part that matters.** This is a security control: a host
 * who flips it, sees it flip, and is never told the write failed believes the
 * door is shut when it is open. Silent failure is the worst outcome in this
 * product generally — here it is the specific outcome the feature exists to
 * prevent. So a failure puts the state back *and* says so.
 */
export function useDoor(code: string, initial: boolean) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function set(next: boolean) {
    const previous = on;
    setOn(next);
    setSaving(true);
    const ok = await writeDoor(code, next);
    if (!ok) setOn(previous);
    setSaving(false);
  }

  return { on, saving, set };
}
