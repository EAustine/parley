"use client";

import { useEffect, useRef } from "react";
import type { Participant, Track } from "livekit-client";

import { displayNameOf } from "@/lib/room/participant";

/**
 * The shared content, in the main area — §3.4's share layout.
 *
 * **Only ever rendered for someone watching, never for the sharer.** §3.7 asks
 * for the sharer's own view to be suppressed, and this used to do that by
 * rendering the region with a paragraph in it explaining the absence. That is a
 * suppression that still costs the sharer the whole main area: v1.2 B1 recorded
 * roughly 85% empty black with one line of text floating in it, and the
 * participants squeezed into a narrow column beside nothing.
 *
 * `RoomStage` now takes the branch instead, and the sharer keeps the ordinary
 * grid at full size. Not rendering the region at all is the stronger reading of
 * "suppressed", and it removes two of the three places the sharing state was
 * being announced at once — v1.2 A5.
 *
 * `object-fit: contain`, not `cover`. A tile crops because a face off-centre is
 * still a face; a shared screen cropped is a shared screen with the thing
 * someone is pointing at cut off. This is the one surface in the room where
 * letterboxing is right.
 */
export function ScreenShareStage({
  presenter,
  track,
}: {
  presenter: Participant;
  track: Track | null;
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
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-contain"
      />

      {/* Rule 4: on a scrim, never on the content. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 px-3 py-2"
        style={{ background: "linear-gradient(to top, var(--scrim), transparent)" }}
      >
        <span className="type-caption text-foreground">
          {displayNameOf(presenter)} is sharing
        </span>
      </div>
    </div>
  );
}
