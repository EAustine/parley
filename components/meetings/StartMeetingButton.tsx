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
export function StartMeetingButton({
  className,
  size,
  label = "Start meeting",
  variant = "default",
}: {
  /**
   * v1.3 E3 renders this full-width inside the landing page's card, where it
   * is the primary action. The dashboard keeps the intrinsic width it has
   * always had, so both are opt-in rather than a default anyone inherits.
   */
  className?: string;
  size?: "default" | "touch";
  /**
   * "Start meeting" in the dashboard's action row, "Start a meeting" on the
   * landing page — both from the design files, and the difference is density
   * rather than drift. `CLAUDE.md`'s rule that an action keeps its name is
   * about a *flow* — "Copy link" producing "Link copied" — not about one label
   * fitting two very different contexts. The vocabulary is unchanged either
   * way: it is a **meeting**, and it is **started**.
   */
  label?: string;
  /**
   * The room's ended screen renders this as the *secondary* action beneath
   * "Back to meetings" — the design's order there. Everywhere else it is the
   * primary one, so `default` stays the default.
   */
  variant?: "default" | "outline";
} = {}) {
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
    <Button onClick={start} disabled={busy} className={className} size={size} variant={variant}>
      <HugeiconsIcon
        icon={ICONS.plus.icon}
        size={20}
        strokeWidth={1.5}
        color="currentColor"
        aria-hidden
      />
      {busy ? "Starting…" : label}
    </Button>
  );
}
