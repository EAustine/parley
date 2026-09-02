"use client";

import { useEffect, useRef } from "react";
import type { Participant, Track } from "livekit-client";

import { displayNameOf } from "@/lib/room/participant";

/**
 * The shared content, in the main area — §3.4's share layout.
 *
 * `object-fit: contain`, not `cover`. A tile crops because a face off-centre is
 * still a face; a shared screen cropped is a shared screen with the thing
 * someone is pointing at cut off. This is the one surface in the room where
 * letterboxing is right.
 */
export function ScreenShareStage({
  presenter,
  track,
  isLocal,
}: {
  presenter: Participant;
  /** Null when we are the presenter — §3.7 suppresses the infinite mirror. */
  track: Track | null;
  isLocal: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-card"
      style={{ outline: "1px solid var(--tile-border)", outlineOffset: "-1px" }}
    >
      {isLocal ? (
        // §3.7: "The sharer's own view of the shared content is suppressed to
        // avoid the infinite mirror." Showing them their own screen inside
        // their own screen is both useless and hypnotic.
        <p className="type-body px-8 text-center text-muted-foreground">
          You&rsquo;re sharing your screen. Everyone else can see it — your own
          view is hidden so it doesn&rsquo;t mirror itself.
        </p>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
        />
      )}

      {/* Rule 4: on a scrim, never on the content. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 px-3 py-2"
        style={{ background: "linear-gradient(to top, var(--scrim), transparent)" }}
      >
        <span className="type-caption text-foreground">
          {isLocal ? "You are" : `${displayNameOf(presenter)} is`} sharing
        </span>
      </div>
    </div>
  );
}
