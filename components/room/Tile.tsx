"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useConnectionQualityIndicator,
  useIsSpeaking,
} from "@livekit/components-react";
import type { Participant, Track } from "livekit-client";

import { ICONS } from "@/lib/icons";
import { TILE_COPY, treatmentFor, type Quality } from "@/lib/room/connection";
import { displayNameOf, initialOf } from "@/lib/room/participant";
import { ConnectionPill } from "@/components/room/ConnectionPill";

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
  /**
   * The `<video>` is held in **state**, not a ref — A3.
   *
   * It is conditionally rendered (`showVideo` below), so turning a camera off
   * and on again destroys the element and mounts a *new* one. A ref does not
   * re-run anything when that happens: `useEffect(…, [track])` saw the same
   * track object both times, because LiveKit mutes and unmutes a publication
   * rather than replacing it. So the second element was never handed the
   * stream, and the tile stayed blank while every other signal said the camera
   * was on.
   *
   * That is the shape of the bug the field report described, and it is a rule 3
   * failure from the other direction: the control read "Turn off camera", the
   * participants panel showed the camera on, and nothing was on screen. Rule 3
   * is about the UI never claiming a device state the tracks do not support —
   * this claimed one the *DOM* did not.
   *
   * A ref holds an element without telling anyone it changed. State makes the
   * element an input to the effect, so mount, unmount and track-swap all run
   * the same attach/detach path.
   */
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const isSpeaking = useIsSpeaking(participant);
  // Read here rather than threaded down from the grid: the participant is
  // already in hand, and `useIsSpeaking` above sets the precedent.
  const { quality } = useConnectionQualityIndicator({ participant });
  const treatment = treatmentFor(quality as Quality);

  useEffect(() => {
    if (!video || !track) return;
    track.attach(video);
    // Detaching on the way out is not tidiness: a track left attached to a
    // removed element keeps decoding, and on a paging mobile grid that is one
    // live decode per page you ever visited.
    return () => {
      track.detach(video);
    };
  }, [track, video]);

  const name = displayNameOf(participant);
  const showVideo = Boolean(track) && cameraOn;

  return (
    <div
      // Reactions rise from a participant's tile and are drawn in an overlay
      // above the grid, so the overlay has to be able to find this element.
      data-participant={participant.identity}
      // The e2e suite scopes by attribute and measures the rendered opacity of
      // the layer below — "assert rendered geometry, never declared CSS".
      data-connection={treatment}
      className="relative h-full w-full overflow-hidden rounded-xl bg-card"
      style={{
        // A size container, so the avatar and the label scrim below can be a
        // proportion of *this tile* rather than a fixed number that is right at
        // one grid breakpoint and wrong at the rest — v1.2 B3.
        //
        // `h-full w-full` above is what makes that safe. Size containment means
        // the contents no longer contribute to the box, so a tile whose height
        // came from its own content collapses to nothing. In the grid that
        // never showed, because grid items stretch; in the filmstrip the tile
        // sits inside an `aspect-video` wrapper and was sized by the video
        // inside it — approximately right, by accident, until containment
        // removed the accident.
        containerType: "size",
        // Rule 5, and §3.4: no hue. Idle is 1px --boundary at 3.93:1 against
        // the ground, speaking is 2px --foreground at 17.29:1 — a change in
        // both weight and value, so it survives greyscale and any video behind
        // it. --card against --background is 1.09:1, which is why the border is
        // the only thing making a camera-off tile a component at all.
        outline: isSpeaking
          ? "2px solid var(--foreground)"
          : "1px solid var(--boundary)",
        outlineOffset: "-1px",
        transition: "outline-color 120ms linear, outline-width 120ms linear",
      }}
      // The ring is not the only carrier: a screen reader gets it here.
      //
      // A remote participant's connection is carried here too rather than
      // announced. §9 says connection changes are announced once per change,
      // and read broadly that would mean a sixteen-person room narrating every
      // remote flicker — the flooding §9 exists to prevent, on a channel with
      // no throttle written for it. The local user's own connection is
      // announced; everyone else's is discoverable, the way mute state already
      // is on the indicator below.
      aria-label={[
        name,
        isSpeaking ? "speaking" : null,
        treatment === "none" ? null : TILE_COPY[treatment].replace(/…$/, ""),
      ]
        .filter(Boolean)
        .join(", ")}
    >
      {/*
        §3.11: "Tile dims to 40%, last frame frozen."
        **The media dims; the tile does not.** Putting `opacity: 0.4` on the
        root takes `--boundary` from 3.93:1 to 1.59:1 and the name label
        from 12.01:1 to 3.56:1 — the dim would delete the boundary that makes
        this a component at all, and fade the label explaining the frozen
        frame, both below their WCAG floors. So the ring and the scrim row
        below stay at full strength and only this layer recedes.

        The frozen frame costs nothing to get: LiveKit keeps the publication
        when a remote participant's quality drops to lost, so nothing detaches
        and the element simply stops receiving. If the track really does go
        away the avatar takes over, which is honest — there is no last frame to
        hold in that case.
      */}
      <div
        className="h-full w-full transition-opacity duration-200"
        style={{ opacity: treatment === "lost" ? 0.4 : 1 }}
      >
        {showVideo ? (
          <video
            ref={setVideo}
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
            {/*
              v1.2 B3: roughly 28% of the tile's shorter side, with a ceiling.
              It was a fixed 64px, which is a coin marooned in the middle of a
              full-area tile at one participant and nearly the whole cell at
              sixteen. `cqmin` is the shorter side of the tile, so one rule
              covers every breakpoint.

              The cap matters at one participant, where 28% of a letterboxed
              720px-tall tile would be a 200px disc — a scale that reads as a
              placeholder graphic rather than as a person's absence.
            */}
            <div
              className="flex items-center justify-center rounded-full bg-secondary"
              style={{
                width: "min(28cqmin, 128px)",
                height: "min(28cqmin, 128px)",
              }}
              aria-hidden
            >
              <span
                className="text-secondary-foreground"
                style={{ fontSize: "min(12cqmin, 56px)", fontWeight: 600, lineHeight: 1 }}
              >
                {initialOf(name)}
              </span>
            </div>
          </div>
        )}
      </div>

      {treatment !== "none" && <ConnectionPill treatment={treatment} />}

      {/* Rule 4: nothing sits directly on video. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 py-2"
        style={{
          /*
           * v1.2 B3: a bottom-only gradient about 30% of the tile's height —
           * "enough to guarantee contrast, little enough to leave the video
           * alone". It used to be sized by its own content, so on a large tile
           * the label sat on a thin band that ran out immediately above the
           * text; on a filmstrip tile it covered most of the cell.
           *
           * A floor as well as a proportion: 30% of a 96px mobile strip tile is
           * 29px, which is less than the label's own line box, and the gradient
           * would then start inside the text.
           */
          height: "max(30cqh, 2.75rem)",
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
      style={{ outline: "1px solid var(--boundary)", outlineOffset: "-1px" }}
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
