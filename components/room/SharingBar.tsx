"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";

/**
 * §3.7: "a persistent 'You're sharing your screen' bar with a stop button,
 * visible even if the tab is backgrounded when they return."
 *
 * Persistent is the word that matters. This does not auto-hide with the
 * control bar, because the thing it is telling you is that other people can
 * see your screen — which is exactly the fact that must not quietly disappear
 * while you go and do something else in another window.
 */
export function SharingBar({ onStop }: { onStop: () => void }) {
  return (
    <div
      className="absolute inset-x-0 top-0 z-30 flex items-center justify-center gap-3 px-4 py-2"
      style={{ background: "var(--scrim)" }}
      // Announced once when it appears, politely — it is important but it is
      // not an interruption, and the person just pressed the button that
      // caused it.
      role="status"
      aria-live="polite"
    >
      <HugeiconsIcon
        icon={ICONS.screenShare.icon}
        size={16}
        strokeWidth={1.5}
        color="currentColor"
        className="text-foreground"
        aria-hidden
      />
      <span className="type-small text-foreground">
        You&rsquo;re sharing your screen
      </span>
      <Button size="sm" variant="secondary" onClick={onStop}>
        Stop sharing
      </Button>
    </div>
  );
}
