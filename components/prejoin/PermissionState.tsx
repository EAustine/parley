"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { permissionLocation } from "@/lib/media/browser-hint";
import type { PermissionState as State } from "@/lib/hooks/useMediaPreview";
import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";

/**
 * What fills the preview area when there is no picture.
 *
 * Every one of §3.3's states has its own copy. The temptation is a single
 * "Couldn't access your camera" with a retry button, and it is wrong in the
 * two directions that matter: it tells someone who declined to try again,
 * which will do nothing, and it fails to tell someone whose camera is held by
 * another app the one thing that would fix it.
 *
 * Browser-specific instructions are named rather than generic. "Check your
 * browser settings" is the kind of advice that sounds like help.
 */

type Copy = {
  icon: keyof typeof ICONS;
  title: string;
  body: string;
  action?: { label: string; kind: "request" | "retry" };
};

function copyFor(state: State, canJoinWithoutMedia: boolean): Copy | null {
  switch (state) {
    case "idle":
      return {
        icon: "cameraOn",
        title: "Camera and microphone",
        body: "Parley needs them to put you in the meeting. Nothing is recorded, and you can turn either off before you join.",
        action: { label: "Allow camera and microphone", kind: "request" },
      };

    case "requesting":
      return {
        icon: "loading",
        title: "Waiting for your answer",
        body: "Your browser is asking whether Parley can use your camera and microphone.",
      };

    // Refused persistently. The page genuinely cannot ask again, so saying
    // "try again" would be a lie — say where the switch is instead.
    case "denied":
      return {
        icon: "cameraOff",
        title: "Camera and microphone are blocked",
        body: `This page can't ask again — the browser remembers your answer. To change it, open ${permissionLocation(typeof navigator === "undefined" ? null : navigator.userAgent)}, allow camera and microphone, then reload.`,
      };

    // Closed without answering. Asking again works, so offer it.
    case "dismissed":
      return {
        icon: "cameraOff",
        title: "No answer yet",
        body: "The permission prompt closed before you chose. Nothing is blocked — asking again will bring it back.",
        action: { label: "Try again", kind: "retry" },
      };

    case "no-device":
      return {
        icon: "cameraOff",
        title: "No camera found",
        body: canJoinWithoutMedia
          ? "Nothing is plugged in that Parley can see. You can still join and take part with audio only, or with neither."
          : "Nothing is plugged in that Parley can see. Connect a device and try again.",
        action: { label: "Try again", kind: "retry" },
      };

    case "in-use":
      return {
        icon: "alert",
        title: "Something else is using your camera",
        body: "Another app has it open — often a video call left running, or a recording tool. Close it, then try again.",
        action: { label: "Try again", kind: "retry" },
      };

    case "insecure":
      return {
        icon: "alert",
        title: "This page isn't secure",
        body: "Browsers only allow camera and microphone access over HTTPS. Open this meeting on the secure address.",
      };

    case "unsupported":
      return {
        icon: "alert",
        title: "This browser can't do video",
        body: "It doesn't support the media APIs Parley needs. Chrome, Firefox, Safari and Edge all do.",
      };

    case "granted":
      return null;
  }
}

export function PermissionNotice({
  state,
  onRequest,
  canJoinWithoutMedia = true,
}: {
  state: State;
  onRequest: () => void;
  canJoinWithoutMedia?: boolean;
}) {
  const copy = copyFor(state, canJoinWithoutMedia);
  if (!copy) return null;

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
      role={state === "requesting" ? "status" : undefined}
      aria-live={state === "requesting" ? "polite" : undefined}
    >
      <HugeiconsIcon
        icon={ICONS[copy.icon].icon}
        size={24}
        strokeWidth={1.5}
        color="currentColor"
        className={state === "requesting" ? "animate-spin" : undefined}
        aria-hidden
      />
      <div className="space-y-2">
        <p className="type-body">{copy.title}</p>
        <p className="type-small text-balance text-muted-foreground">
          {copy.body}
        </p>
      </div>
      {copy.action && (
        <Button variant="outline" size="touch" onClick={onRequest}>
          {copy.action.label}
        </Button>
      )}
    </div>
  );
}
