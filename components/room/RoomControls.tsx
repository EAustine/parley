"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useLocalParticipant } from "@livekit/components-react";

import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Mic, camera, leave. §3.4's table lists four more — screen share, reactions,
 * chat, participants — and they arrive in Phases 5 and 7. A button that does
 * nothing is worse than a button that isn't there yet, so they are not here
 * yet.
 *
 * **Rule 3.** Nothing in this file keeps a boolean for mute state.
 * `useLocalParticipant` reports what the published track actually is, so a
 * failed unmute leaves the control reading muted — which is the true and safe
 * answer. A local `useState` toggled optimistically would show a live
 * microphone to someone whose microphone never came on.
 */
export function RoomControls({
  visible,
  onLeave,
}: {
  visible: boolean;
  onLeave: () => void;
}) {
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    lastMicrophoneError,
    lastCameraError,
  } = useLocalParticipant();

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-6"
      // Hidden controls stay in the DOM and keep their tab stops: §3.4 says
      // they reappear on any keypress or focus, which cannot happen if
      // focusing them is what would have brought them back.
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 120ms cubic-bezier(0.2, 0, 0, 1)",
      }}
    >
      {(lastMicrophoneError || lastCameraError) && (
        <p
          role="alert"
          className="rounded-lg px-3 py-1.5 type-small text-[var(--state-critical)]"
          style={{ background: "var(--scrim)" }}
        >
          {lastMicrophoneError
            ? "Your microphone didn't turn on."
            : "Your camera didn't turn on."}{" "}
          Check it isn&rsquo;t in use by another app.
        </p>
      )}

      <div
        className="flex items-center gap-3 rounded-full px-3 py-2"
        style={{
          background: "var(--scrim)",
          // Invisible and clickable is a trap. Keyboard focus is unaffected by
          // pointer-events, so tabbing to a hidden control still fires
          // `focusin` and still brings the bar back.
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <CircleToggle
          on={isMicrophoneEnabled}
          onIcon="micOn"
          offIcon="micOff"
          label={isMicrophoneEnabled ? "Turn off microphone" : "Turn on microphone"}
          shortcut="⌘D"
          onToggle={() =>
            localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
          }
        />
        <CircleToggle
          on={isCameraEnabled}
          onIcon="cameraOn"
          offIcon="cameraOff"
          label={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
          shortcut="⌘E"
          onToggle={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        />

        {/* The one non-circular control. §3.4: shape distinguishes it as well
            as colour, so it is unmistakable without relying on hue. */}
        <Button
          onClick={onLeave}
          className="h-12 rounded-full px-6 bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          <HugeiconsIcon
            icon={ICONS.leave.icon}
            size={20}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
          Leave
        </Button>
      </div>
    </div>
  );
}

function CircleToggle({
  on,
  onIcon,
  offIcon,
  label,
  shortcut,
  onToggle,
}: {
  on: boolean;
  onIcon: keyof typeof ICONS;
  offIcon: keyof typeof ICONS;
  label: string;
  shortcut: string;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          // The accessible name states the action, not the state — the
          // accessibility floor is explicit about this. `aria-pressed`
          // carries the state.
          aria-label={label}
          aria-pressed={!on}
          className="flex size-12 items-center justify-center rounded-full border transition-colors duration-[120ms]"
          style={{
            // Off is a fill and an icon change, never a hue change — rule 5.
            backgroundColor: on ? "transparent" : "var(--secondary)",
            borderColor: on ? "var(--tile-border)" : "var(--secondary)",
            color: "var(--foreground)",
          }}
        >
          <HugeiconsIcon
            icon={ICONS[on ? onIcon : offIcon].icon}
            size={24}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <span className="text-muted-foreground">{shortcut}</span>
      </TooltipContent>
    </Tooltip>
  );
}
