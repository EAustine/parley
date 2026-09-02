"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";

/**
 * Creates an instant meeting and goes straight to its pre-join screen.
 *
 * Flow A in `PRD.md` §2: the host sees pre-join before the room like everyone
 * else, so this routes to `/j/[code]` rather than jumping into the room.
 */
export function StartMeetingButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "instant" }),
      });

      if (!response.ok) {
        setBusy(false);
        toast.error("The meeting couldn't be created. Try again.");
        return;
      }

      const meeting = (await response.json()) as { code: string };
      // Deliberately not clearing `busy` — the navigation is the end state, and
      // re-enabling the button first invites a second meeting by double-click.
      router.push(`/j/${meeting.code}`);
    } catch {
      setBusy(false);
      toast.error("Couldn't reach the server. Check your connection.");
    }
  }

  return (
    <Button onClick={start} disabled={busy}>
      <HugeiconsIcon
        icon={ICONS.plus.icon}
        size={20}
        strokeWidth={1.5}
        color="currentColor"
        aria-hidden
      />
      {busy ? "Starting…" : "Start meeting"}
    </Button>
  );
}
