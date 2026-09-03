"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { useLocalParticipant } from "@livekit/components-react";

import { ICONS } from "@/lib/icons";
import type { Reaction } from "@/lib/room/messages";
import { ReactionPicker } from "@/components/room/ReactionPicker";
import { Button } from "@/components/ui/button";
/**
 * Tooltip text is `--background`, not `--muted-foreground`.
 *
 * shadcn's tooltip is `bg-foreground text-background` — a near-white fill in
 * the dark theme — so the secondary shortcut text was `--muted-foreground` on
 * `--foreground`, which axe measured at 1.72:1. `--muted-foreground` declares
 * the seven opaque *surfaces* it is permitted on and a fill is not one of them.
 * `--background` at 70% over `--foreground` is 6.89:1.
 */
import { usePlatform } from "@/lib/hooks/usePlatform";
import { chordFor } from "@/lib/room/shortcuts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * §3.4's control bar, complete: mic, camera, screen share, reactions, chat,
 * participants, leave.
 *
 * **Rule 3.** Nothing in this file keeps a boolean for mute state.
 * `useLocalParticipant` reports what the published track actually is, so a
 * failed unmute leaves the control reading muted — which is the true and safe
 * answer. A local `useState` toggled optimistically would show a live
 * microphone to someone whose microphone never came on.
 */
export function RoomControls({
  visible,
  unread,
  chatOpen,
  participantsOpen,
  participantCount,
  share,
  onToggleChat,
  onToggleParticipants,
  onReact,
  onLeave,
}: {
  visible: boolean;
  unread: number;
  chatOpen: boolean;
  participantsOpen: boolean;
  participantCount: number;
  /** §3.7 is desktop only, so this is absent rather than disabled elsewhere. */
  share: { supported: boolean; sharing: boolean; toggle: () => void };
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onReact: (emoji: Reaction) => void;
  onLeave: () => void;
}) {
  const platform = usePlatform();
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    lastMicrophoneError,
    lastCameraError,
  } = useLocalParticipant();

  return (
    <div
      /**
       * `z-30`, above the panels.
       *
       * Both panels are `z-20` and, on mobile, `inset-x-0 bottom-0
       * h-[60dvh]` — a bottom sheet that covered this bar entirely. A
       * positioned element with `z-20` beats a positioned element with `auto`
       * whatever the DOM order, so opening chat on a phone hid mic, camera and
       * leave. §3.4 requires the mute control to stay reachable, and mute is a
       * privacy control.
       *
       * The bottom padding clears the iPhone home indicator, which `dvh` does
       * not account for: `dvh` describes the viewport, not the region of it
       * that is safe to put a control in.
       */
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
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
          // `status`, not `alert`. BUILD-PLAN's Phase 9 note: Next mounts its
          // own route announcer as a `role="alert"` region, which is assertive
          // and interrupts whatever a screen reader is mid-sentence on. A
          // second assertive region in the room stacks on top of it and
          // guarantees the flooding §9 exists to prevent — and this message
          // stays on screen next to the control that fixes it, so nothing is
          // lost by waiting for a gap.
          role="status"
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
        /**
         * Tighter below `sm`. Seven controls at 44–48px plus a leave pill and
         * six 12px gaps comes to roughly 420px, against a 375pt iPhone — and
         * the stage clips `overflow-hidden`, so the ends simply vanished. The
         * gap and padding come down rather than the controls, which have their
         * own floor in §9's touch targets.
         */
        className="flex max-w-[calc(100vw-1rem)] items-center gap-1.5 rounded-full px-2 py-2 sm:gap-3 sm:px-3"
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
          shortcut={chordFor("mic", platform)}
          onToggle={() =>
            localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
          }
        />
        <CircleToggle
          on={isCameraEnabled}
          onIcon="cameraOn"
          offIcon="cameraOff"
          label={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
          shortcut={chordFor("camera", platform)}
          onToggle={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        />

        {/* §3.7: desktop only. Hidden rather than disabled — a control that
            can never work on this device is not a control, and a tooltip
            explaining why is worse than the space it takes. */}
        {share.supported && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={share.toggle}
                // A state toggle: the name is the action and changes with
                // it. No `aria-pressed` — an action name plus a pressed state
                // announces the same fact twice, in a confusing order.
                aria-label={share.sharing ? "Stop sharing your screen" : "Share your screen"}
                className="flex size-11 items-center justify-center rounded-full border transition-colors duration-[120ms]"
                style={{
                  // §3.4: "Active = filled --primary". The only control that
                  // fills with primary, because it is the only one whose "on"
                  // state changes what everyone else is looking at.
                  backgroundColor: share.sharing ? "var(--primary)" : "transparent",
                  borderColor: share.sharing ? "var(--primary)" : "var(--tile-border)",
                  color: share.sharing ? "var(--primary-foreground)" : "var(--foreground)",
                }}
              >
                <HugeiconsIcon
                  icon={ICONS[share.sharing ? "stopShare" : "screenShare"].icon}
                  size={20}
                  strokeWidth={1.5}
                  color="currentColor"
                  aria-hidden
                />
              </button>
            </TooltipTrigger>
            <TooltipContent className="dark">
              {share.sharing ? "Stop sharing your screen" : "Share your screen"}
            </TooltipContent>
          </Tooltip>
        )}

        <ReactionPicker onReact={onReact} />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleChat}
              // A disclosure, not a state toggle: a noun name, with
              // `aria-expanded` carrying open or closed. Naming it for the
              // action gave it the same name as the panel's own close button,
              // heard twice in one tab cycle.
              aria-label="Chat"
              aria-expanded={chatOpen}
              aria-controls="chat-panel"
              className="relative flex size-11 items-center justify-center rounded-full border transition-colors duration-[120ms]"
              style={{
                backgroundColor: chatOpen ? "var(--secondary)" : "transparent",
                borderColor: chatOpen ? "var(--secondary)" : "var(--tile-border)",
                color: "var(--foreground)",
              }}
            >
              <HugeiconsIcon
                icon={ICONS.chat.icon}
                size={20}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
              {/* §3.5: a dot, not a count. The number of unread messages is not
                  a decision anyone makes — whether to open the panel is. And a
                  dot needs no hue to read as "something is there". */}
              {unread > 0 && !chatOpen && (
                <span
                  aria-hidden
                  className="absolute right-1 top-1 size-2 rounded-full"
                  style={{ background: "var(--foreground)" }}
                />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent className="dark">
            {chatOpen ? "Close chat" : "Open chat"}{" "}
            <span className="text-background/70">{chordFor("chat", platform)}</span>
            {unread > 0 && !chatOpen && (
              <span className="sr-only">
                , {unread} unread {unread === 1 ? "message" : "messages"}
              </span>
            )}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleParticipants}
              aria-label="Participants"
              aria-expanded={participantsOpen}
              aria-controls="participants-panel"
              className="relative flex size-11 items-center justify-center rounded-full border transition-colors duration-[120ms]"
              style={{
                backgroundColor: participantsOpen ? "var(--secondary)" : "transparent",
                borderColor: participantsOpen ? "var(--secondary)" : "var(--tile-border)",
                color: "var(--foreground)",
              }}
            >
              <HugeiconsIcon
                icon={ICONS.participants.icon}
                size={20}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
              {/* §3.4: "shows count". Tabular so it does not shift width as
                  people arrive. */}
              <span className="type-caption tabular-nums absolute -right-0.5 -top-0.5 rounded-full bg-secondary px-1">
                {participantCount}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="dark">
            {participantsOpen ? "Close participants" : "Show participants"}{" "}
            <span className="text-background/70">
              {participantCount} in the meeting
            </span>
          </TooltipContent>
        </Tooltip>

        {/* The one non-circular control. §3.4: shape distinguishes it as well
            as colour, so it is unmistakable without relying on hue. */}
        <Button
          size="touch" onClick={onLeave}
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
          // A state toggle. The name is the action and changes with it —
          // "Turn off microphone" becomes "Turn on microphone". No
          // `aria-pressed`: an action name plus a pressed state announces the
          // same fact twice, and in an order that reads as a contradiction.
          aria-label={label}
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
      <TooltipContent className="dark">
        {label} <span className="text-background/70">{shortcut}</span>
      </TooltipContent>
    </Tooltip>
  );
}
