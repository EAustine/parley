"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  RoomAudioRenderer,
  RoomContext,
  useLocalParticipant,
} from "@livekit/components-react";
import { Room, RoomEvent } from "livekit-client";

import { readDevices } from "@/lib/media/devices";
import { useControlVisibility } from "@/lib/hooks/useControlVisibility";
import { useRoomShortcuts } from "@/lib/hooks/useRoomShortcuts";
import { RoomControls } from "@/components/room/RoomControls";
import { RoomGrid } from "@/components/room/RoomGrid";
import { Button } from "@/components/ui/button";
import { Lockup } from "@/components/brand/Lockup";

/**
 * The room itself, and the only module in the product that imports
 * `livekit-client`.
 *
 * Rule 8: this file is reached through `next/dynamic` from `RoomEntry`, so the
 * library lands in its own async chunk rather than in any route's first load.
 * `npm run check:bundle` asserts that by route rather than by grep — the
 * marker strings live in this chunk legitimately, and the rule is that they
 * appear nowhere else.
 *
 * Rule 1: `RoomContext.Provider` rather than `<LiveKitRoom>`. The hooks need a
 * room in context and nothing more; the wrapper component would additionally
 * render a div carrying their class names, which is the edge of a design
 * system we have declined. `RoomAudioRenderer` is the documented exception —
 * it renders nothing visible and manages remote `<audio>` elements correctly,
 * which is genuinely hard.
 */

type Stage =
  | { kind: "connecting" }
  | { kind: "connected" }
  | { kind: "failed"; reason: string }
  | { kind: "left" };

export function RoomStage({
  code,
  token,
  serverUrl,
}: {
  code: string;
  token: string;
  serverUrl: string;
}) {
  const [room, setRoom] = useState<Room | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "connecting" });
  // Leaving is a decision, not a failure. Without this, the disconnect the
  // Leave button causes would be indistinguishable from the connection
  // dropping, and the person who just left would be told something went wrong.
  const leaving = useRef(false);

  useEffect(() => {
    leaving.current = false;
    const stored = readDevices();

    const next = new Room({
      // Both are LiveKit's own bandwidth work and cost us nothing: adaptive
      // stream drops the resolution of tiles that are small or off-screen,
      // dynacast stops publishing layers nobody is subscribed to.
      adaptiveStream: true,
      dynacast: true,
      // Whatever pre-join settled on. Asking for a device by id here rather
      // than switching after connecting avoids acquiring the default camera
      // first, which shows as the indicator light flicking on for the wrong
      // device.
      videoCaptureDefaults: stored.cameraId
        ? { deviceId: stored.cameraId }
        : undefined,
      audioCaptureDefaults: stored.microphoneId
        ? { deviceId: stored.microphoneId }
        : undefined,
    });

    let cancelled = false;

    const onDisconnected = () => {
      if (cancelled) return;
      setStage(leaving.current ? { kind: "left" } : { kind: "failed", reason: "dropped" });
    };
    next.on(RoomEvent.Disconnected, onDisconnected);

    (async () => {
      try {
        await next.connect(serverUrl, token);
        if (cancelled) {
          await next.disconnect();
          return;
        }

        if (cancelled) return;
        setRoom(next);
        setStage({ kind: "connected" });

        // Everything below is *not* awaited before showing the room, and that
        // ordering is the point. Connecting and publishing are different
        // things: you are in the meeting once the connection is up, and you can
        // see and hear everyone else whether or not your own camera ever comes
        // on. Gating entry on publishing means one stalled device leaves
        // someone watching "Connecting you…" with no explanation and no way
        // out — which §3.11 is explicit about never doing.
        //
        // A publish that fails surfaces through `lastCameraError` on the
        // control bar, where it belongs: next to the control that fixes it.

        // Publish only what pre-join left switched on. `!== false` rather than
        // a truthiness test: an absent preference means the person never
        // touched the toggle, and the default is on.
        void Promise.allSettled([
          next.localParticipant.setMicrophoneEnabled(stored.micOn !== false),
          next.localParticipant.setCameraEnabled(stored.cameraOn !== false),
        ]);

        // The speaker choice pre-join collected but could not apply — it needs
        // audio elements to apply to, and until now there were none.
        if (stored.speakerId) {
          void next.switchActiveDevice("audiooutput", stored.speakerId).catch(() => {
            // Firefox has no setSinkId. The call fails, the default output is
            // used, and that is a fine outcome to be quiet about.
          });
        }
      } catch (error) {
        if (cancelled) return;
        setStage({
          kind: "failed",
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    })();

    return () => {
      cancelled = true;
      next.off(RoomEvent.Disconnected, onDisconnected);
      // Releasing the camera matters more than tidiness: the indicator light
      // stays on otherwise, which people reasonably read as still being
      // watched.
      void next.disconnect();
    };
  }, [serverUrl, token]);

  const leave = useCallback(() => {
    leaving.current = true;
    setStage({ kind: "left" });
    void room?.disconnect();
  }, [room]);

  if (stage.kind === "connecting") return <Connecting />;
  if (stage.kind === "left") return <Left code={code} />;
  if (stage.kind === "failed") return <Failed code={code} />;
  if (!room) return <Connecting />;

  return (
    <RoomContext.Provider value={room}>
      <RoomSurface code={code} onLeave={leave} />
      {/* Renders nothing. Manages every remote participant's audio element. */}
      <RoomAudioRenderer />
    </RoomContext.Provider>
  );
}

/** Inside the provider, so the shortcuts can reach the local participant. */
function RoomSurface({ code, onLeave }: { code: string; onLeave: () => void }) {
  const visible = useControlVisibility();
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background p-3 pb-24">
      <Shortcuts />
      <RoomGrid />
      <RoomControls visible={visible} onLeave={onLeave} />
      <span className="sr-only">Meeting code {code}</span>
    </div>
  );
}

/**
 * Renders nothing; exists so that subscribing to mute state re-renders a leaf
 * rather than the whole room. The handler has to see current state — a stale
 * closure here would toggle the mic to where it already was.
 */
function Shortcuts() {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();
  useRoomShortcuts({
    onToggleMic: () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled),
    onToggleCamera: () => localParticipant.setCameraEnabled(!isCameraEnabled),
  });
  return null;
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16 text-center">
      {children}
    </div>
  );
}

function Connecting() {
  return (
    <Centred>
      <p className="type-body text-muted-foreground" role="status" aria-live="polite">
        Connecting you…
      </p>
    </Centred>
  );
}

function Left({ code }: { code: string }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6">
        <Lockup variant="stacked" markSize={40} />
        <div className="space-y-2">
          <h1 className="type-h1">You left the meeting</h1>
          <p className="type-body text-balance text-muted-foreground">
            It carries on without you. The link still works if you want to come
            back.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button asChild className="w-full">
          <Link href={`/j/${code}`}>Rejoin</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/dashboard">Back to meetings</Link>
        </Button>
      </div>
    </Centred>
  );
}

function Failed({ code }: { code: string }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6">
        <Lockup variant="stacked" markSize={40} />
        <div className="space-y-2">
          <h1 className="type-h1">The connection dropped</h1>
          <p className="type-body text-balance text-muted-foreground">
            Parley lost its link to the meeting. Check your network, then join
            again.
          </p>
        </div>
      </div>
      <Button asChild className="w-full">
        <Link href={`/j/${code}`}>Join again</Link>
      </Button>
    </Centred>
  );
}
