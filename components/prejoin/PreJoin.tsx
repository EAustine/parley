"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { useMediaPreview } from "@/lib/hooks/useMediaPreview";
import { ICONS } from "@/lib/icons";
import { CONTROL_MOTION } from "@/lib/motion";
import { PermissionNotice } from "@/components/prejoin/PermissionState";
import { MicMeter } from "@/components/prejoin/MicMeter";
import { recallName, rememberJoin } from "@/lib/prejoin-handoff";
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
}: {
  meeting: PublicMeeting;
  /** Present when a session exists. Hosts are not asked to name themselves. */
  signedInName: string | null;
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
  const attempts = useRef(0);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearInterval(timer);
    },
    [],
  );

  const isGuest = signedInName === null;

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
  const canJoin = !joining && !unusableBrowser && (!isGuest || trimmedName.length > 0);

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
          displayName: isGuest ? trimmedName : undefined,
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
      rememberJoin({
        code: meeting.code,
        displayName: isGuest ? trimmedName : displayName,
        token,
        serverUrl: url,
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

  return (
    /**
     * v1.2 D: one centred column, the preview as its hero.
     *
     * This was a two-column `md:grid-cols-[1.4fr_1fr]` inside `max-w-4xl`,
     * which made the preview one of two equal concerns and pushed the device
     * controls onto a scrim *inside* it. D puts the preview first and
     * everything else underneath, in the order you deal with it: see yourself,
     * check you can be heard, fix a device if it is wrong, say who you are,
     * join.
     *
     * Moving the toggles out of the frame also means nothing sits on the video
     * at all any more, which is a stronger form of rule 4 than a scrim.
     */
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="type-caption text-muted-foreground">You&rsquo;re joining</p>
        <h1 className="type-h1">{meeting.title}</h1>
      </div>

      {/* --- the preview, and the meter flush beneath it ------------------ */}
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-xl border border-boundary bg-card">
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
            /* §3.3's remaining states, inside the frame — D keeps the eye in
               one place, and the denied copy is the longest thing on the
               screen, so anywhere else it reads as a footnote. */
            <PermissionNotice state={media.state} onRequest={media.request} />
          )}
        </div>

        {/* A 4px bar, not a number. Only once there is a signal to draw. */}
        {media.state === "granted" && (
          <MicMeter level={media.level} muted={!media.micOn} />
        )}
      </div>

      {/* --- device controls, beneath the preview rather than on it ------- */}
      {media.state === "granted" && (
        <div className="flex items-center justify-center gap-3">
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

      {/*
        --- the three selectors -----------------------------------------------
        D calls this "a settings row". Stacked rather than three across, and
        the reason is legibility rather than taste: in a 560px column three
        selects are about 176px each, and "Default - MacBook Pro Microphone
        (Built-in)" truncates to somewhere around "Default - MacB" — which is
        the one thing a device selector exists to tell you.
      */}
      <div className="space-y-3">
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
          unsupported in Safari. Feature-detect and hide rather than showing a
          control that does nothing."

          It has always done nothing on those browsers. `RoomStage` calls
          `switchActiveDevice("audiooutput", …)` and catches the rejection, so
          the *room* degraded correctly from the start — what nothing could do
          was stop this screen offering a choice that would be silently
          discarded. Hidden rather than disabled, like screen share under §3.7:
          a disabled control invites someone to keep trying.
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

      {/* --- name and join, one block ------------------------------------- */}
      <div className="space-y-3">
        {isGuest && (
          <div className="space-y-2">
            <Label htmlFor="display-name" className="type-small">
              Your name
            </Label>
            <Input
              id="display-name"
              // 44px: a field is a target, and this is a pre-join surface.
              className="h-11"
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

        {/* The only filled-primary button on the screen — D. Everything else
            here, including the permission request inside the frame, is an
            outline. */}
        <Button size="touch" className="w-full" onClick={() => join()} disabled={!canJoin}>
          {countdown !== null
            ? `Joining in ${countdown}s…`
            : joining
              ? "Joining…"
              : "Join meeting"}
        </Button>
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
        {error && (
          <p role="alert" className="type-small text-[var(--state-critical)]">
            {error}
          </p>
        )}
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
          className={`flex size-12 items-center justify-center rounded-full border disabled:pointer-events-none disabled:opacity-50 ${CONTROL_MOTION}`}
          style={{
            // Off is a fill change, not a hue change — rule 5.
            backgroundColor: on ? "transparent" : "var(--secondary)",
            borderColor: on ? "var(--boundary)" : "var(--secondary)",
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
