"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useIsSpeaking } from "@livekit/components-react";
import type { Participant, Track } from "livekit-client";

import { ICONS } from "@/lib/icons";
import { displayNameOf, initialOf } from "@/lib/room/participant";

/**
 * One participant.
 *
 * The track is attached to the `<video>` by hand rather than through LiveKit's
 * `VideoTrack`. Rule 1 says the hooks, not the components: `useIsSpeaking`
 * earns its place because smoothing speech detection is genuinely hard, while
 * `track.attach(element)` is two lines and keeps every class on this element
 * ours. `RoomAudioRenderer` remains the documented exception, one level up.
 */
export function Tile({
  participant,
  track,
  cameraOn,
}: {
  participant: Participant;
  /** The camera track, when there is one subscribed and unmuted. */
  track: Track | undefined;
  cameraOn: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSpeaking = useIsSpeaking(participant);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !track) return;
    track.attach(element);
    // Detaching on the way out is not tidiness: a track left attached to a
    // removed element keeps decoding, and on a paging mobile grid that is one
    // live decode per page you ever visited.
    return () => {
      track.detach(element);
    };
  }, [track]);

  const name = displayNameOf(participant);
  const showVideo = Boolean(track) && cameraOn;

  return (
    <div
      // Reactions rise from a participant's tile and are drawn in an overlay
      // above the grid, so the overlay has to be able to find this element.
      data-participant={participant.identity}
      className="relative overflow-hidden rounded-xl bg-card"
      style={{
        // Rule 5, and §3.4: no hue. Idle is 1px --tile-border at 3.33:1 against
        // the ground, speaking is 2px --foreground at 17.29:1 — a change in
        // both weight and value, so it survives greyscale and any video behind
        // it. --card against --background is 1.09:1, which is why the border is
        // the only thing making a camera-off tile a component at all.
        outline: isSpeaking
          ? "2px solid var(--foreground)"
          : "1px solid var(--tile-border)",
        outlineOffset: "-1px",
        transition: "outline-color 120ms linear, outline-width 120ms linear",
      }}
      // The ring is not the only carrier: a screen reader gets it here.
      aria-label={isSpeaking ? `${name}, speaking` : name}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // Muted on the element, always. Remote audio is played by
          // RoomAudioRenderer through its own elements; letting a video tile
          // play audio too is how you get an echo of one person.
          muted
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {/* §3.4: the initial on --secondary, uniform. A per-identity hue
              would be the only chroma in the room and would be decorative —
              tile position is stable and the name is directly below. */}
          <div
            className="flex size-16 items-center justify-center rounded-full bg-secondary"
            aria-hidden
          >
            <span className="type-h2 text-secondary-foreground">
              {initialOf(name)}
            </span>
          </div>
        </div>
      )}

      {/* Rule 4: nothing sits directly on video. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 py-2"
        style={{
          background: "linear-gradient(to top, var(--scrim), transparent)",
        }}
      >
        <span className="type-caption truncate text-foreground">{name}</span>
        {!participant.isMicrophoneEnabled && (
          <HugeiconsIcon
            icon={ICONS.micOff.icon}
            size={16}
            strokeWidth={1.5}
            color="currentColor"
            className="shrink-0 text-foreground"
            // The name already carries who; this carries the state, and the
            // tile's aria-label would be the wrong place for something that
            // changes several times a minute.
            aria-label={`${name} is muted`}
          />
        )}
      </div>
    </div>
  );
}

/** The last cell of a full desktop grid: everyone who did not fit. */
export function OverflowTile({ count }: { count: number }) {
  return (
    <div
      // §3.6: a reaction from someone who did not fit in the grid anchors here.
      data-overflow="true"
      className="flex items-center justify-center rounded-xl bg-card"
      style={{ outline: "1px solid var(--tile-border)", outlineOffset: "-1px" }}
    >
      <span className="type-h2 tabular-nums text-muted-foreground">
        +{count}
      </span>
      <span className="sr-only">
        {count} more {count === 1 ? "participant" : "participants"} not shown
      </span>
    </div>
  );
}
