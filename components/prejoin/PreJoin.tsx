"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { useMediaPreview } from "@/lib/hooks/useMediaPreview";
import { ICONS } from "@/lib/icons";
import { PermissionNotice } from "@/components/prejoin/PermissionState";
import { MicMeter } from "@/components/prejoin/MicMeter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const videoRef = useRef<HTMLVideoElement>(null);

  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGuest = signedInName === null;

  useEffect(() => {
    if (videoRef.current && media.stream) {
      videoRef.current.srcObject = media.stream;
    }
  }, [media.stream]);

  const trimmedName = name.trim();
  const canJoin = !joining && (!isGuest || trimmedName.length > 0);

  async function join() {
    setJoining(true);
    setError(null);

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
        const { error: reason } = (await response
          .json()
          .catch(() => ({ error: "unknown" }))) as { error: string };
        setJoining(false);
        setError(joinErrorMessage(reason));
        return;
      }

      // The camera is released before navigating: the room re-acquires it, and
      // two claims on the same device is how you get a black tile on Windows.
      media.stop();
      router.push(`/room/${meeting.code}`);
    } catch {
      setJoining(false);
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  const showPreview = media.state === "granted" && media.cameraOn;
  const devicesKnown = media.state === "granted";

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col justify-center gap-8 px-6 py-12">
      <div className="space-y-1">
        <p className="type-caption text-muted-foreground">You&rsquo;re joining</p>
        <h1 className="type-h1">{meeting.title}</h1>
      </div>

      <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
        {/* --- preview ---------------------------------------------------- */}
        <div className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-tile-border bg-card">
            {showPreview ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                // Mirrored here only. §3.3: what you publish is not flipped —
                // a mirrored preview feels natural, a mirrored broadcast makes
                // everyone else read your text backwards.
                className="h-full w-full -scale-x-100 object-cover"
              />
            ) : media.state === "granted" ? (
              <div className="flex h-full items-center justify-center">
                <p className="type-small text-muted-foreground">
                  Your camera is off. You&rsquo;ll join without video.
                </p>
              </div>
            ) : (
              <PermissionNotice state={media.state} onRequest={media.request} />
            )}

            {/* Controls sit on a scrim, never on raw video — rule 4. */}
            {media.state === "granted" && (
              <div
                className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-4"
                style={{
                  background:
                    "linear-gradient(to top, var(--scrim), transparent)",
                }}
              >
                <DeviceToggle
                  on={media.micOn}
                  onToggle={media.toggleMic}
                  onIcon="micOn"
                  offIcon="micOff"
                  // Names the action, not the state — accessibility floor.
                  label={media.micOn ? "Turn off microphone" : "Turn on microphone"}
                />
                <DeviceToggle
                  on={media.cameraOn}
                  onToggle={media.toggleCamera}
                  onIcon="cameraOn"
                  offIcon="cameraOff"
                  label={media.cameraOn ? "Turn off camera" : "Turn on camera"}
                />
                <div className="ml-1">
                  <MicMeter level={media.level} muted={!media.micOn} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* --- settings and join ------------------------------------------ */}
        <div className="space-y-6">
          {isGuest && (
            <div className="space-y-2">
              <Label htmlFor="display-name" className="type-small">
                Your name
              </Label>
              <Input
                id="display-name"
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
          <DeviceSelect
            id="speaker"
            label="Speaker"
            options={media.speakers}
            value={media.speakerId}
            onChange={media.setSpeaker}
            ready={devicesKnown}
          />

          <div className="space-y-2">
            <Button className="w-full" onClick={join} disabled={!canJoin}>
              {joining ? "Joining…" : "Join meeting"}
            </Button>
            {/* Joining with both off is allowed, and must not read as a fault. */}
            {media.state === "granted" && !media.cameraOn && !media.micOn && (
              <p className="type-caption text-muted-foreground">
                You&rsquo;ll join with your camera and microphone off. You can
                turn them on once you&rsquo;re in.
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
    </div>
  );
}

function DeviceToggle({
  on,
  onToggle,
  onIcon,
  offIcon,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  onIcon: keyof typeof ICONS;
  offIcon: keyof typeof ICONS;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          aria-pressed={!on}
          className="flex size-12 items-center justify-center rounded-full border transition-colors duration-[120ms]"
          style={{
            // Off is a fill change, not a hue change — rule 5.
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
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function DeviceSelect({
  id,
  label,
  options,
  value,
  onChange,
  ready,
}: {
  id: string;
  label: string;
  options: { deviceId: string; label: string }[];
  value: string | null;
  onChange: (deviceId: string) => void;
  ready: boolean;
}) {
  // §3.3: labels are empty until permission is granted, so an empty dropdown
  // would be a control that looks broken. Say why it is empty instead.
  if (!ready || options.length === 0) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id} className="type-small">
          {label}
        </Label>
        <p id={id} className="type-small text-muted-foreground">
          {ready ? `No ${label.toLowerCase()} found.` : "Allow access to choose a device."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="type-small">
        {label}
      </Label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={`Choose a ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.deviceId} value={option.deviceId}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
