"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocalParticipant } from "@livekit/components-react";

import { ICONS } from "@/lib/icons";
import { CONTROL_MOTION } from "@/lib/motion";
import type { Reaction } from "@/lib/room/messages";
import { ReactionPicker } from "@/components/room/ReactionPicker";
import { LeaveControl } from "@/components/room/LeaveControl";
import { OverflowMenu } from "@/components/room/OverflowMenu";
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
  waitingCount,
  onReact,
  onOpenReactions,
  onLeave,
  isHost,
  onEnd,
  onOpenDevices,
  onOpenShortcuts,
}: {
  visible: boolean;
  unread: number;
  chatOpen: boolean;
  participantsOpen: boolean;
  participantCount: number;
  /** §3.7 is capability-gated, so this is absent rather than disabled. */
  share: { supported: boolean; sharing: boolean; toggle: () => void };
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  /** v1.5 A2. Non-zero takes the badge; zero hands it back to the roster count. */
  waitingCount: number;
  onReact: (emoji: Reaction) => void;
  /** Opens the mobile reactions sheet — v1.4 B2. */
  onOpenReactions: () => void;
  onLeave: () => void;
  /** §3.8: only a host is offered "End meeting for everyone" — B1. */
  isHost: boolean;
  onEnd: () => void;
  /** v1.3 B2: the overflow menu's two entries. */
  onOpenDevices: () => void;
  onOpenShortcuts: () => void;
}) {
  /**
   * Publish the bar's rendered height as `--parley-controls-h`.
   *
   * Everything that has to clear this bar used to hard-code `pb-24` — 96px —
   * and B4 made that wrong. Grouping the controls means they wrap rather than
   * shrink below §9's 44px floor, and a wrapped bar measures **144px** on a
   * 375pt phone. The chat sheet reserved 96, so Send rendered at y=660 under a
   * bar starting at y=668: hit-testing Send's centre returned the participants
   * badge, and `useControlVisibility` never hides the bar on touch — so it was
   * not transient. You could not tap Send on a phone at all.
   *
   * A number that has to equal a rendered box should be read from the box. The
   * observer keeps it true through wrapping, through the safe-area inset, and
   * through the error row that appears above the bar when a device fails.
   */
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--parley-controls-h",
        `${Math.ceil(element.getBoundingClientRect().height)}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
      ref={bar}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[var(--layer-chrome)] flex flex-col items-center gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
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
          /**
           * An opaque chip, not the scrim — rule 4, the same narrowing
           * `ConnectionPill` and `ConnectionBar` already carry.
           *
           * This was `text-[var(--state-critical)]` on `var(--scrim)`, which
           * is **2.53:1** over bright video: the message telling you your
           * camera did not start, drawn at half the floor it needs. The
           * permitted-surface matrix was green the whole time, because a
           * matrix computes whether a pairing *would* pass and is never shown
           * one that exists. `e2e/scrim.spec.ts` is what asks the question.
           *
           * On `--popover` the same red is 5.42:1, and the background stops
           * depending on what is on camera.
           */
          className="rounded-lg border border-boundary bg-popover px-3 py-1.5 type-small text-[var(--state-critical)]"
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
        /**
         * Wraps rather than shrinks.
         *
         * Six circles and a leave pill need about 442px, and the bar is capped
         * at the viewport. It used to fit a 375pt phone by *shrinking* the
         * controls — flex items shrink by default — which took them under §9's
         * 44px floor on the one surface where that floor is not negotiable.
         * `check:targets` could not see it: it measures declared CSS, and
         * nothing declared was wrong.
         *
         * Grouping made it visible, because a group's `min-width: auto` stops
         * it shrinking below its contents. Wrapping is the fix that keeps both
         * the floor and the rhythm — the groups stay whole and the break falls
         * between them.
         */
        /*
         * **One row, Leave included** — v1.3 C0, which overrides the wrapping
         * fix this line used to carry.
         *
         * Wrapping kept the groups whole and let the break fall between them,
         * which preserved the 44px floor. It also cost about 70px of height on
         * a phone — the axis where space is scarcest, and the one the video is
         * competing for. C2's tiering is what made nowrap affordable: the
         * secondary controls collapsed into an overflow menu, so there are
         * fewer things to fit than when the bar was seven equal circles.
         *
         * The floor is not being traded away for it. `check:targets` measures
         * the Android bar's rendered boxes against 44px with share offered,
         * which is the widest this gets, and it is the thing that would fail if
         * a row that cannot wrap started shrinking its contents instead.
         */
        className="flex max-w-[calc(100vw-0.5rem)] flex-nowrap items-center justify-center gap-x-1.5 rounded-full px-1.5 py-2 sm:gap-x-4 sm:px-3"
        style={{
          background: "var(--scrim)",
          // Invisible and clickable is a trap. Keyboard focus is unaffected by
          // pointer-events, so tabbing to a hidden control still fires
          // `focusin` and still brings the bar back.
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        {/*
          v1.2 B4: grouped by spacing rhythm rather than dividers —
          [mic camera] · gap · [share reactions chat participants] · larger gap
          · [leave]. Every control sat at one spacing, so the bar read as seven
          equal things and the two reached for in a hurry were not a pair.
        */}
        {/*
          v1.3 C2's primary tier: **labelled**. "Mute, Stop video, Present. The
          ones you hit under pressure, and where a wrong guess costs something."
          They were three of eight identical icon circles.
        */}
        <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2">
          <PrimaryControl
            on={isMicrophoneEnabled}
            onIcon="micOn"
            offIcon="micOff"
            label={isMicrophoneEnabled ? "Mute" : "Unmute"}
            shortcut={chordFor("mic", platform)}
            onToggle={() =>
              localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
            }
          />
          <PrimaryControl
            on={isCameraEnabled}
            onIcon="cameraOn"
            offIcon="cameraOff"
            label={isCameraEnabled ? "Stop video" : "Start video"}
            shortcut={chordFor("camera", platform)}
            onToggle={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
          />
          {/*
            Present joins the primary tier — and leaves the bar below 900px,
            where C2 allows exactly six controls. It reappears in the overflow
            menu at that width, so it is never unreachable.
          */}
          {share.supported && (
            <div className="hidden min-[900px]:flex">
              <PrimaryControl
                on={!share.sharing}
                onIcon="screenShare"
                offIcon="stopShare"
                label={share.sharing ? "Stop presenting" : "Present"}
                onToggle={share.toggle}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1 sm:gap-2">
          {/* Reactions leave the bar below 900px with Present — C2's six.
              The overflow menu carries them at that width. */}
          <div className="hidden min-[900px]:flex">
            <ReactionPicker onReact={onReact} />
          </div>

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
                className={`relative flex size-11 items-center justify-center rounded-full border hover:bg-[var(--secondary)] ${CONTROL_MOTION}`}
                style={{
                  /*
                   * C2's secondary tier: "Ghost until hover, filled while their
                   * panel is open." Ghost is a *value* change as well as a fill
                   * one — `--muted-foreground` at rest, `--foreground` when
                   * open — which is what separates the tier from the primary
                   * one at a glance. It was `--foreground` throughout, so the
                   * two tiers differed only in size.
                   */
                  backgroundColor: chatOpen ? "var(--secondary)" : "transparent",
                  borderColor: chatOpen ? "var(--boundary)" : "transparent",
                  /*
                   * `--on-scrim-muted`, not `--muted-foreground`.
                   *
                   * Ghost means transparent, so the backdrop here is the bar's
                   * `--scrim` and rule 4 applies. `--muted-foreground` is
                   * **2.97:1** over bright video; `--on-scrim-muted` is 4.70.
                   * `check:scrim` failed the moment the ghost was introduced,
                   * which is exactly the walk it was written for — the fill and
                   * the value changed together and only one of them was safe.
                   *
                   * The open state paints an opaque `--secondary`, so the walk
                   * stops there and `--foreground` is permitted again.
                   */
                  color: chatOpen ? "var(--foreground)" : "var(--on-scrim-muted)",
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
                /*
                  The name says which number this is. A badge that silently
                  swaps what it counts is a badge a screen reader cannot
                  describe — and §9's floor is that nothing depends on a visual
                  distinction alone.
                */
                aria-label={
                  waitingCount > 0
                    ? `Participants, ${waitingCount} waiting to join`
                    : "Participants"
                }
                aria-expanded={participantsOpen}
                aria-controls="participants-panel"
                className={`relative flex size-11 items-center justify-center rounded-full border hover:bg-[var(--secondary)] ${CONTROL_MOTION}`}
                style={{
                  // C2's secondary tier, as on chat above: ghost is a value
                  // change too, not only a fill one.
                  backgroundColor: participantsOpen ? "var(--secondary)" : "transparent",
                  borderColor: participantsOpen ? "var(--boundary)" : "transparent",
                  // As on chat: ghost is on the scrim, so it takes the
                  // on-scrim token. See the note there.
                  color: participantsOpen
                    ? "var(--foreground)"
                    : "var(--on-scrim-muted)",
                }}
              >
                <HugeiconsIcon
                  icon={ICONS.participants.icon}
                  size={20}
                  strokeWidth={1.5}
                  color="currentColor"
                  aria-hidden
                />
                {/*
                  §3.4's count, as C2's 16px pill — inverted, so it reads at
                  10px against the ghost icon behind it. It was a 12px caption
                  chip on `--secondary` with no minimum size, which at a single
                  digit was narrower than it was tall.

                  `pointer-events-none` because it sits over the button it
                  belongs to: a badge that swallows a tap is a control that
                  intermittently does nothing.
                */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[10px] leading-4 font-semibold tabular-nums"
                  /**
                   * v1.5 A2: the badge is **taken** by the waiting count while a
                   * queue exists, and handed back when it clears.
                   *
                   * Never added to it — three people present and two waiting is
                   * not five, and the two numbers must not be mistaken for each
                   * other. So the distinction is fill and value, not hue: rule 5
                   * spends chroma on destructive actions and connection
                   * warnings, and a queue is neither.
                   *
                   * The roster count is the quiet one now, on `--secondary`
                   * behind a `--boundary` edge; the waiting count takes the
                   * inverted fill this badge used to carry unconditionally,
                   * which is what `--primary` resolves to in the room.
                   */
                  style={
                    waitingCount > 0
                      ? {
                          background: "var(--primary)",
                          color: "var(--primary-foreground)",
                          borderColor: "var(--primary)",
                        }
                      : {
                          background: "var(--secondary)",
                          color: "var(--foreground)",
                          borderColor: "var(--boundary)",
                        }
                  }
                >
                  {waitingCount > 0 ? waitingCount : participantCount}
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

          {/* v1.3 B2: "Its entry point is 'Audio and video settings' in the
              control bar's overflow menu, which is where the design puts it."
              Last in the secondary group, so the tier reads left to right by
              how often it is reached for. */}
          <OverflowMenu
            onOpenDevices={onOpenDevices}
            onOpenShortcuts={onOpenShortcuts}
            onOpenReactions={onOpenReactions}
            share={share}
          />
        </div>

        {/* The one non-circular control, and B4's larger gap before it —
            leaving is not one of the things you do to a meeting, it is the
            thing that ends being in one. For a host the whole button opens a
            menu; for a guest it simply leaves. B1, and `LeaveControl`. */}
        <LeaveControl isHost={isHost} onLeave={onLeave} onEnd={onEnd} />
      </div>
    </div>
  );
}


/**
 * The primary tier — v1.3 C2. A labelled pill, not an icon circle.
 *
 * **The visible label *is* the accessible name.** There is no `aria-label`:
 * the text is `sr-only` below 900px rather than removed, so the name is "Mute"
 * at every width while only the wide bar draws it. An `aria-label` of "Turn off
 * microphone" over a visible "Mute" would fail SC 2.5.3 Label in Name — the
 * accessible name has to contain the visible one, and it does not.
 *
 * Still a state toggle in the floor's sense: the name is the action and changes
 * with it, "Mute" becoming "Unmute". Still no `aria-pressed`, for the reason
 * the floor gives — an action name plus a pressed state announces the same fact
 * twice, in an order that reads as a contradiction.
 */
function PrimaryControl({
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
  shortcut?: string;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-12 min-w-12 items-center justify-center gap-2 rounded-full border px-0 type-small font-medium min-[900px]:px-4 ${CONTROL_MOTION}`}
          style={{
            // Off is a fill and an icon change, never a hue change — rule 5.
            backgroundColor: on ? "var(--secondary)" : "var(--accent)",
            borderColor: "var(--boundary)",
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
          <span className="sr-only min-[900px]:not-sr-only">{label}</span>
        </button>
      </TooltipTrigger>
      {/* The tooltip is still worth having on the wide bar: it carries the
          shortcut, which the label does not. */}
      <TooltipContent className="dark">
        {label}
        {shortcut && <span className="text-background/70"> {shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
