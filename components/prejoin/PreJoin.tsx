"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { useMediaPreview } from "@/lib/hooks/useMediaPreview";
import { ICONS } from "@/lib/icons";
import { CONTROL_MOTION } from "@/lib/motion";
import { PermissionNotice } from "@/components/prejoin/PermissionState";
import { MicMeter } from "@/components/prejoin/MicMeter";
import { WaitingRoomToggle } from "@/components/meetings/WaitingRoomToggle";
import { recallName, rememberJoin } from "@/lib/prejoin-handoff";
import { WaitingRoom, type WaitingState } from "@/components/prejoin/WaitingRoom";
import { MAX_JOIN_ATTEMPTS, retryAfterSeconds } from "@/lib/join-backoff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeviceSelect } from "@/components/shared/DeviceSelect";
import { canChooseSpeaker } from "@/lib/media/output";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PublicMeeting } from "@/lib/supabase/types";

/**
 * The screen that decides whether the product feels competent.
 *
 * Shown before every room entry, including the host's — §3.3. Nothing here
 * imports LiveKit: the preview and the device list come from
 * `navigator.mediaDevices`, and the token is fetched from our own endpoint.
 */
export function PreJoin({
  meeting,
  signedInName,
  host,
}: {
  meeting: PublicMeeting;
  /**
   * The name the signed-in account carries, when it carries one.
   *
   * Null for a guest, and null for a signed-in person whose account has no
   * name — which is every magic-link account, since only Google sign-in leaves
   * a `full_name` behind. It used to be the email address in that case, and
   * that address then went on the tile, in the people panel and into every chat
   * line; see `lib/auth/display-name.ts`.
   *
   * So §3.3's "display-name field for guests" is really "for whoever has not
   * already said what they are called". A host with a name on their account is
   * still not asked; a host without one is, once, and joins as themselves
   * instead of as their inbox.
   */
  signedInName: string | null;
  /**
   * Set only when the viewer is the meeting's host — v1.5 A1.
   *
   * `null` for everybody else, and deliberately shaped so that a guest cannot
   * tell a missing host from a host who is not them: there is no `isHost:
   * false` to read, just an absent object. The page decides this with RLS
   * rather than by widening `get_meeting_by_code`, which §6 keeps narrow on
   * purpose.
   */
  host?: { waitingRoom: boolean } | null;
}) {
  const router = useRouter();
  const media = useMediaPreview();

  // §3.11: a guest who was dropped and is rejoining should not be made to
  // retype the name they just entered. Lazy initialiser rather than an effect —
  // the field is filled on first paint rather than flickering from empty.
  const [name, setName] = useState(() => recallName());
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // §7: a busy meeting holds this screen and comes back by itself. `countdown`
  // is what the person watching sees; without it the screen would just sit
  // there, which is the same as failing as far as anyone can tell.
  const [countdown, setCountdown] = useState<number | null>(null);
  /**
   * Held at the door — v1.5 A1 and A3.
   *
   * Not an error, which is why it is its own state rather than a string in
   * `error`. Being asked to wait is an ordinary outcome of joining a meeting
   * with a waiting room on, and rendering it as a red line under the Join
   * button would be the product telling somebody something went wrong when
   * nothing did.
   */
  const [held, setHeld] = useState<WaitingState | null>(null);
  const attempts = useRef(0);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearInterval(timer);
    },
    [],
  );

  const needsName = signedInName === null;

  /**
   * A callback ref, not a `useRef` plus an effect keyed on the stream.
   *
   * The `<video>` renders only when `showPreview` is true, and `showPreview`
   * needs `hasCamera` — which `useMediaPreview` sets *after* an
   * `await enumerateDevices()`, one tick later than it sets `stream`. So the
   * commit that first carries a stream has no `<video>` in it, and the commit
   * that mounts the `<video>` does not change `stream`. An effect keyed on
   * `[media.stream]` therefore ran exactly once, against a null ref, and the
   * preview was a black rectangle on every first load — §3.3's "the screen
   * that decides whether the product feels competent".
   *
   * Toggling the camera off and on failed the same way for a second reason:
   * `setCamera` flips `track.enabled` and keeps the same `MediaStream` object,
   * so the remounted element again met no change in the dependency.
   *
   * A callback ref runs whenever the element appears, whatever caused it to
   * appear, which is the property this actually needs. React re-runs it when
   * the callback's identity changes too, so a genuinely new stream is still
   * attached.
   */
  const attachPreview = useCallback(
    (element: HTMLVideoElement | null) => {
      if (element && media.stream) element.srcObject = media.stream;
    },
    [media.stream],
  );

  const trimmedName = name.trim();
  /**
   * A browser that cannot do WebRTC cannot join, whatever the name field says.
   *
   * This used to be `!joining && (!isGuest || name)`, so the only thing
   * standing between an unsupported browser and a broken room was the person
   * not pressing the button. §3.11's rule that nothing fails silently applies
   * before the connection as much as during it: the screen already knows, and
   * already has the copy.
   *
   * `insecure` is separated because it is fixable by the visitor — the copy
   * tells them to open the HTTPS address — while `unsupported` is not.
   */
  const unusableBrowser = media.state === "unsupported" || media.state === "insecure";
  const canJoin = !joining && !unusableBrowser && (!needsName || trimmedName.length > 0);

  /** Hold the screen, count down, and go again — never bounce to an error. */
  function holdAndRetry(seconds: number) {
    setCountdown(seconds);
    const timer = setInterval(() => {
      setCountdown((remaining) => {
        if (remaining === null) return null;
        if (remaining > 1) return remaining - 1;
        clearInterval(timer);
        void join();
        return null;
      });
    }, 1000);
    timers.current.push(timer);
  }

  async function join() {
    setJoining(true);
    setError(null);
    setCountdown(null);

    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: meeting.code,
          displayName: needsName ? trimmedName : undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => ({ error: "unknown" }))) as {
          error: string;
          retryAfter?: number;
        };

        // §7. Not a dead end: a full room from one network fills slowly rather
        // than turning people away, so this screen waits and tries again on
        // its own. Only a wait long enough to stop being credible becomes an
        // error.
        if (payload.error === "rate_limited") {
          attempts.current += 1;
          if (attempts.current < MAX_JOIN_ATTEMPTS) {
            holdAndRetry(retryAfterSeconds(response, payload));
            return;
          }
        }

        /*
         * The door's four answers — v1.5 A1 and B1. Each is a screen of its
         * own in `WaitingRoom`, per A3's "five endings that must not share a
         * screen"; the fifth, the meeting ending, arrives while polling.
         */
        if (
          payload.error === "waiting_for_host" ||
          payload.error === "waiting_for_admission" ||
          payload.error === "denied" ||
          payload.error === "removed"
        ) {
          // The camera is released before waiting, for the same reason it is
          // released before navigating: holding a device you are not using
          // keeps the light on and is the thing that makes a black tile on
          // Windows when the room later asks for it.
          media.stop();
          setJoining(false);
          setHeld(payload.error as WaitingState);
          return;
        }

        setJoining(false);
        setError(joinErrorMessage(payload.error));
        return;
      }

      // This token is the one the room connects with. Minting a second there
      // would spend two of the ten requests a minute the endpoint allows per
      // IP, for one join — see lib/prejoin-handoff.
      const { token, url, displayName } = (await response.json()) as {
        token: string;
        url: string;
        displayName: string;
      };
      /**
       * The publish decision, handed to the room — v1.4 A1.
       *
       * **`media.micOn` on its own is the wrong answer**, and taking it would
       * have reproduced the bug in a new place. Those two flags are the
       * toggle's position, not a permission: they initialise to `true` and stay
       * `true` through a denial, because on this screen they mean "the button
       * is pressed in" and there may be no track for them to describe.
       *
       * Consent is the conjunction. `granted` is the person having said yes to
       * the browser; the toggle is them having said yes to us; and `hasCamera`
       * is there being a device at all, without which `setCameraEnabled(true)`
       * in the room is a request that can only fail. Any of the three missing
       * means nothing is published, which is §3.3's both-off arrival and not an
       * error.
       */
      const permitted = media.state === "granted";
      rememberJoin({
        code: meeting.code,
        displayName: needsName ? trimmedName : displayName,
        token,
        serverUrl: url,
        micOn: permitted && media.micOn && media.hasMicrophone,
        cameraOn: permitted && media.cameraOn && media.hasCamera,
      });

      // The camera is released before navigating: the room re-acquires it, and
      // two claims on the same device is how you get a black tile on Windows.
      media.stop();
      router.push(`/room/${meeting.code}`);
    } catch {
      setJoining(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  const showPreview =
    media.state === "granted" && media.cameraOn && media.hasCamera;
  const devicesKnown = media.state === "granted";

  /**
   * Whether this browser can route audio to a chosen speaker — B2.
   *
   * In state rather than read during render: the answer depends on
   * `HTMLMediaElement`, which the server does not have, so reading it while
   * rendering would make the first client paint disagree with the server's.
   */
  const [speakerChoosable, setSpeakerChoosable] = useState(false);
  useEffect(() => setSpeakerChoosable(canChooseSpeaker()), []);
  // Permission was granted and the camera still isn't there — Screen Time has
  // it switched off, or it was unplugged. Different from "you turned it off",
  // and it must not be reported as though they chose it.
  const cameraMissing = media.state === "granted" && !media.hasCamera;
  const micMissing = media.state === "granted" && !media.hasMicrophone;

  /**
   * The join button's name changes when there is nothing to join *with*.
   *
   * E2: the denied state "offers 'Join without camera or mic' rather than
   * dead-ending. Someone blocked at their office should still be able to
   * listen." A button reading "Join meeting" beside an explanation of why the
   * camera is blocked reads as the thing that is blocked; naming the outcome is
   * what makes it obviously still available.
   */
  const blocked =
    media.state === "denied" ||
    media.state === "dismissed" ||
    media.state === "no-device" ||
    media.state === "in-use";
  const joinLabel =
    countdown !== null
      ? `Joining in ${countdown}s…`
      : joining
        ? "Joining…"
        : blocked
          ? "Join without camera or mic"
          : "Join meeting";

  const joinButton = (
    /* The only filled-primary button on the screen. Everything else here,
       including the permission request inside the frame, is an outline. */
    <Button size="touch" className="w-full" onClick={() => join()} disabled={!canJoin}>
      {joinLabel}
    </Button>
  );

  if (held) {
    return (
      <WaitingRoom
        code={meeting.code}
        title={meeting.title}
        /*
         * What pre-join settled on, held and applied at admission — A3's
         * "waiting is not joining". The same conjunction the handoff carries:
         * a toggle that is on means nothing without a grant behind it.
         */
        micOn={media.state === "granted" && media.micOn && media.hasMicrophone}
        cameraOn={media.state === "granted" && media.cameraOn && media.hasCamera}
        displayName={needsName ? trimmedName : (signedInName ?? "")}
        initial={held}
        /*
         * Admission hands back here rather than minting its own token: this
         * screen owns the device state, the handoff and the navigation, and a
         * second place doing it is a second place to get the publish decision
         * wrong.
         */
        onAdmitted={() => {
          setHeld(null);
          void join();
        }}
      />
    );
  }

  return (
    /**
     * v1.3 E2: "Split layout: preview left, meeting title and panel right.
     * Better use of horizontal space than a centred column."
     *
     * **This reverses v1.2 D, deliberately and with its reasoning noted.** D
     * made the preview a hero in one 560px column and moved the device toggles
     * out of the frame, on the grounds that "nothing sits on the video at all
     * any more, which is a stronger form of rule 4 than a scrim". E2 puts them
     * back on the preview because that is "where attention already is" — and
     * rule 4 is satisfied properly now rather than avoided: the toggles sit on
     * a gradient of `--scrim` and draw themselves in `--on-scrim`, the
     * theme-invariant pair added for exactly this.
     *
     * Below 900px it is one column, edge to edge, with Join pinned to the
     * bottom — see the sticky block at the end. 900 rather than a Tailwind
     * breakpoint because that is the number the design uses, and a split layout
     * needs the width it needs.
     */
    <div className="mx-auto flex min-h-dvh w-full flex-col min-[900px]:max-w-[1080px] min-[900px]:justify-center min-[900px]:px-6 min-[900px]:py-10">
      <div className="flex min-h-0 flex-1 flex-col min-[900px]:grid min-[900px]:flex-none min-[900px]:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] min-[900px]:items-start min-[900px]:gap-8">
        {/* --- left: the preview, and the meter flush beneath it ---------- */}
        <div className="flex-none">
          <div
            /*
             * A state card can be taller than 16:9 on a narrow screen, and the
             * copy is the whole point of the state — so the ratio is dropped
             * rather than the explanation clipped. The design does the same
             * with `.stage:has(.stage-state)`.
             */
            className={`relative overflow-hidden border-y border-boundary bg-card min-[900px]:rounded-xl min-[900px]:border ${
              media.state === "granted"
                ? "aspect-video"
                : "min-h-[min(56vw,240px)] min-[900px]:aspect-video"
            }`}
          >
            {showPreview ? (
              <video
                ref={attachPreview}
                autoPlay
                playsInline
                muted
                // Mirrored here only. §3.3: what you publish is not flipped —
                // a mirrored preview feels natural, a mirrored broadcast makes
                // everyone else read your text backwards.
                className="h-full w-full -scale-x-100 object-cover"
              />
            ) : media.state === "granted" ? (
              <div className="flex h-full items-center justify-center px-8 text-center">
                <p className="type-small text-balance text-muted-foreground">
                  {cameraMissing
                    ? micMissing
                      ? "No camera or microphone found. You can still join and follow along."
                      : "No camera found. Your microphone works, so you’ll join with audio only."
                    : "Your camera is off. You’ll join without video."}
                </p>
              </div>
            ) : (
              /* E2: "Every permission state renders inside the preview frame —
                 the denied state is where the video would be, not a banner
                 elsewhere, so the eye never hunts for the explanation." */
              <PermissionNotice state={media.state} onRequest={media.request} />
            )}

            {/*
              E2: the toggles, on the preview.

              Rule 4, met rather than sidestepped: a bottom gradient of
              `--scrim`, and every mark on it drawn in `--on-scrim` /
              `--on-scrim-muted`, which are theme-invariant because the scrim
              is. `--foreground` is not permitted here — in light mode it lands
              at 2.30:1 on a surface that does not flip with it.
            */}
            {media.state === "granted" && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 flex h-24 items-end justify-center gap-3 pb-4"
                style={{
                  background:
                    "linear-gradient(to top, var(--scrim) 0%, rgba(14, 16, 19, 0) 100%)",
                }}
              >
                <DeviceToggle
                  on={media.micOn}
                  onToggle={media.toggleMic}
                  onIcon="micOn"
                  offIcon="micOff"
                  // Names the action, not the state — accessibility floor. A
                  // control that can't do anything says why instead.
                  disabled={micMissing}
                  label={
                    micMissing
                      ? "No microphone found"
                      : media.micOn
                        ? "Turn off microphone"
                        : "Turn on microphone"
                  }
                />
                <DeviceToggle
                  on={media.cameraOn}
                  onToggle={media.toggleCamera}
                  onIcon="cameraOn"
                  offIcon="cameraOff"
                  disabled={cameraMissing}
                  label={
                    cameraMissing
                      ? "No camera found"
                      : media.cameraOn
                        ? "Turn off camera"
                        : "Turn on camera"
                  }
                />
              </div>
            )}
          </div>

          {/*
            E2: "The level meter is a 4px bar directly under the frame, so it
            reads as voice rather than as a widget." Flush — no gap, and square
            on mobile where the frame is square, so the two read as one object.
          */}
          {media.state === "granted" && (
            <MicMeter level={media.level} muted={!media.micOn} />
          )}
        </div>

        {/* --- right: what you are joining, and how ----------------------- */}
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-5 pb-6 min-[900px]:flex-none min-[900px]:p-0">
          <p className="type-caption text-muted-foreground">You&rsquo;re joining</p>
          <h1 className="type-h1">{meeting.title}</h1>
          {/* Mono, and the only place the code appears on this screen — a code
              is read aloud and typed, which is what the mono face is for. */}
          <p className="mt-1.5 font-mono type-small tracking-[0.06em] text-muted-foreground">
            {meeting.code}
          </p>

          <div className="mt-5 rounded-xl border border-boundary bg-popover p-5">
            {needsName && (
              <div className="space-y-2">
                <Label htmlFor="display-name" className="type-small">
                  Your name
                </Label>
                <Input
                  id="display-name"
                  size="touch"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ama"
                  maxLength={40}
                  autoComplete="name"
                  autoFocus
                />
                <p className="type-caption text-muted-foreground">
                  Shown to everyone in the meeting.
                </p>
              </div>
            )}

            {/*
              E2, on mobile: "device selects behind a disclosure (one camera and
              one mic on a phone; the join button should not sit four fields
              down)".

              A `<details>` at every width rather than only below 900px. On a
              phone it is the difference between joining and scrolling; on a
              desktop the three selects are still the least likely thing to be
              touched, and a disclosure that changes into a stack at a
              breakpoint is two components pretending to be one.
            */}
            <details className="mt-4 border-t border-border pt-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between type-small font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                Camera, microphone and speaker
                <HugeiconsIcon
                  icon={ICONS.chevronDown.icon}
                  size={16}
                  strokeWidth={1.5}
                  color="currentColor"
                  aria-hidden
                  className="shrink-0 transition-transform duration-[120ms] [details[open]>summary_&]:rotate-180"
                />
              </summary>
              <div className="space-y-3 pt-2 pb-1">
                <DeviceSelect
                  id="camera"
                  label="Camera"
                  options={media.cameras}
                  value={media.cameraId}
                  onChange={media.setCamera}
                  ready={devicesKnown}
                />
                <DeviceSelect
                  id="microphone"
                  label="Microphone"
                  options={media.microphones}
                  value={media.microphoneId}
                  onChange={media.setMicrophone}
                  ready={devicesKnown}
                />
                {/*
                  v1.3 B2: "Speaker selection needs `HTMLMediaElement.setSinkId`,
                  unsupported in Safari. Feature-detect and hide rather than
                  showing a control that does nothing."

                  It had always done nothing on those browsers. `RoomStage`
                  calls `switchActiveDevice("audiooutput", …)` and catches the
                  rejection, so the *room* degraded correctly from the start —
                  what nothing could do was stop this screen offering a choice
                  that would be silently discarded. Hidden rather than disabled,
                  like screen share under §3.7: a disabled control invites
                  someone to keep trying.
                */}
                {speakerChoosable && (
                  <DeviceSelect
                    id="speaker"
                    label="Speaker"
                    options={media.speakers}
                    value={media.speakerId}
                    onChange={media.setSpeaker}
                    ready={devicesKnown}
                  />
                )}
              </div>
            </details>

            {/*
              The host's door, on the screen before they walk through it — A1's
              third home, and the one that matters most for an *instant*
              meeting: the create route defaults those off, and this is the only
              moment between making the link and being in the room.

              Host only. A guest never sees it, and `host` is absent rather
              than false so there is nothing here to infer from.
            */}
            {host && (
              <div className="mt-4 border-t border-boundary pt-4">
                <WaitingRoomToggle
                  code={meeting.code}
                  initial={host.waitingRoom}
                  id="prejoin-waiting-room"
                />
              </div>
            )}

            {/* Desktop keeps Join in the panel, where the eye finishes. Below
                900px it is pinned to the bottom instead — see the end. */}
            <div className="mt-4 hidden min-[900px]:block">{joinButton}</div>
          </div>

          <div className="mt-4 space-y-3">
            {countdown !== null && (
              <p className="type-caption text-muted-foreground" role="status" aria-live="polite">
                This meeting is busy right now. You&rsquo;ll join automatically —
                there&rsquo;s nothing to do.
              </p>
            )}
            {/* Joining with both off is allowed, and must not read as a fault.
                "You can turn them on once you're in" is only true when there
                is something to turn on — with no hardware it is a promise the
                room cannot keep. */}
            {media.state === "granted" && !media.cameraOn && !media.micOn && (
              <p className="type-caption text-muted-foreground">
                {cameraMissing && micMissing
                  ? "You’ll join without a camera or microphone. You’ll still see and hear everyone else."
                  : "You’ll join with your camera and microphone off. You can turn them on once you’re in."}
              </p>
            )}
            {blocked && (
              <p className="type-caption text-muted-foreground">
                You can still join and listen. Others won&rsquo;t see or hear you
                until access is allowed.
              </p>
            )}
            {error && (
              <p role="alert" className="type-small text-[var(--state-critical)]">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/*
        E2, on mobile: "Join sticky at the bottom with a safe-area inset."
        `env(safe-area-inset-bottom)` because `dvh` describes the viewport, not
        the part of it that is safe to put a control in — the same reason the
        room's control bar carries it.
      */}
      <div className="sticky bottom-0 z-[var(--layer-chrome)] mt-auto border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] min-[900px]:hidden">
        {joinButton}
      </div>
    </div>
  );
}

function DeviceToggle({
  on,
  onToggle,
  onIcon,
  offIcon,
  label,
  disabled = false,
}: {
  on: boolean;
  onToggle: () => void;
  onIcon: keyof typeof ICONS;
  offIcon: keyof typeof ICONS;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          // A state toggle: the name is the action, and no `aria-pressed`.
          // See the accessibility floor — carrying both says the same thing
          // twice.
          aria-label={label}
          /*
           * E2's control hover/press, which the room bar had and this did not.
           *
           * `disabled:pointer-events-none` because this is a raw `<button>`
           * rather than the shadcn one, and a disabled button still matches
           * `:hover` — so "No microphone found" lifted 1.04 as though it were
           * pressable the moment the shared motion was applied here.
           */
          className={`pointer-events-auto flex size-12 items-center justify-center rounded-full border disabled:pointer-events-none disabled:opacity-50 ${CONTROL_MOTION}`}
          /*
           * v1.3 E2: these now sit **on** the preview, over a gradient of
           * `--scrim`, so every colour here is one of the theme-invariant pair.
           *
           * `--foreground` is not permitted on a scrim. It flips with the theme
           * and the scrim does not — in light mode it is `#16181D` on a surface
           * that composites to `#515355`, which is **2.30:1**. `--on-scrim` is
           * 7.01:1 and fixed, so this reads the same whichever way the rest of
           * the page is painted.
           *
           * Off is a fill change, not a hue change — rule 5. `--secondary` is
           * opaque, which is what makes the off state legible against bright
           * video where the scrim alone would not be.
           */
          style={{
            backgroundColor: on ? "var(--scrim)" : "var(--secondary)",
            borderColor: on ? "var(--on-scrim-muted)" : "var(--secondary)",
            color: on ? "var(--on-scrim)" : "var(--foreground)",
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
      <TooltipContent className="dark">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The token endpoint's stable error strings, in Parley's voice. */
function joinErrorMessage(reason: string): string {
  switch (reason) {
    case "meeting_ended":
      return "This meeting ended while you were getting ready.";
    case "meeting_not_found":
      return "That meeting isn't there any more.";
    case "guests_not_allowed":
      return "This meeting is open to signed-in people only.";
    case "display_name_required":
      return "Enter a name so people know who joined.";
    case "rate_limited":
      return "Too many attempts from this connection. Wait a minute, then try again.";
    default:
      return "Couldn't join the meeting. Try again.";
  }
}
