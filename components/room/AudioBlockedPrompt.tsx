"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";

/**
 * §12: "Autoplay policy blocks remote audio → keep a fallback 'Enable audio'
 * prompt."
 *
 * Joining is a real gesture, so this should almost never appear. It appears
 * when it does anyway: Safari's policy can outlive the gesture, and a person
 * who arrives at a silent meeting has no way to tell a muted room from a
 * blocked one. That ambiguity is the whole reason this exists — silence is
 * indistinguishable from working, which is the failure §3.11 is written
 * against.
 *
 * A button rather than a toast: the browser is waiting for a gesture, and only
 * a real click supplies one. It sits above the control bar rather than over
 * the grid, so it does not cover a face while it stands.
 */
export function AudioBlockedPrompt({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-24 z-30 flex justify-center px-3">
      <div
        className="flex items-center gap-3 rounded-lg px-3 py-2"
        style={{
          background: "var(--popover)",
          border: "1px solid var(--tile-border)",
        }}
      >
        <HugeiconsIcon
          icon={ICONS.alert.icon}
          size={20}
          strokeWidth={1.5}
          color="currentColor"
          className="shrink-0 text-[var(--state-warning)]"
          aria-hidden
        />
        <p className="type-small text-foreground">
          Your browser is blocking the meeting&rsquo;s audio.
        </p>
        <Button size="sm" onClick={onEnable}>
          Enable audio
        </Button>
      </div>
    </div>
  );
}
