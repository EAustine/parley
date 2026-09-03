"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Participant, Track } from "livekit-client";

import { ICONS } from "@/lib/icons";
import { CONTROL_MOTION } from "@/lib/motion";
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
  const frame = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  /**
   * The shared screen's own aspect ratio, read from the track.
   *
   * v1.2 F2, the half of A6 that was actually wrong: `object-fit: contain`
   * letterboxes *inside* the element, so a 197px-tall picture sat in a 582px
   * box and the region's border, rounding and label all hugged the empty box
   * rather than the content. Those were A6's "large dead margins".
   *
   * Knowing the ratio lets the frame hug the picture instead. Read on
   * `loadedmetadata` and again on `resize`, because a shared window changes
   * shape when the sharer resizes it mid-call.
   */
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    const measure = () => {
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        setRatio(element.videoWidth / element.videoHeight);
      }
    };
    measure();
    element.addEventListener("loadedmetadata", measure);
    element.addEventListener("resize", measure);
    return () => {
      element.removeEventListener("loadedmetadata", measure);
      element.removeEventListener("resize", measure);
    };
  }, [track]);

  // Fullscreen can also be left with Escape or the browser's own control, so
  // the label follows the document rather than our own last click.
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void frame.current?.requestFullscreen?.().catch(() => {});
    }
  }, []);

  return (
    // The region. A size container so the frame inside it can be fitted
    // against both dimensions at once — the same problem, and the same
    // solution, as the letterboxed single tile in `RoomGrid`.
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ containerType: "size" }}
    >
      <div
        ref={frame}
        // v1.2 E2's "Share region enter": this is the thing that arrived, so it
        // is the thing that animates — see `app/globals.css`.
        className="parley-share-enter relative overflow-hidden rounded-xl bg-card"
        style={{
          outline: "1px solid var(--tile-border)",
          outlineOffset: "-1px",
          /*
           * Hug the picture. `min(100cqw, calc(100cqh * ratio))` rather than
           * `aspect-ratio` with a single max, because fitting a ratio inside a
           * box needs *whichever* dimension is tighter to win — the note in
           * `RoomGrid` records what happens otherwise.
           *
           * Before the first frame arrives there is no ratio to fit, so the
           * frame fills the region and behaves exactly as it used to.
           */
          ...(ratio
            ? {
                width: `min(100cqw, calc(100cqh * ${ratio}))`,
                height: "auto",
                aspectRatio: `${ratio}`,
              }
            : { width: "100%", height: "100%" }),
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
        />

        {/*
          v1.2 F2's fullscreen control, on the region rather than in the room
          bar. §9 rejected an eighth control in the *persistent* bar; this one
          is contextual to a surface that only sometimes exists, so that
          reasoning does not transfer.
       
          Rule 4: on an opaque chip, never on the content.
        */}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit full screen" : "View full screen"}
          className={`absolute right-2 top-2 flex size-11 items-center justify-center rounded-full ${CONTROL_MOTION}`}
          style={{ background: "var(--popover)", color: "var(--foreground)" }}
        >
          <HugeiconsIcon
            icon={ICONS[isFullscreen ? "exitFullscreen" : "fullscreen"].icon}
            size={20}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
        </button>

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
    </div>
  );
}
