"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Participant, Track } from "livekit-client";

import { displayNameOf, initialOf } from "@/lib/room/participant";

/**
 * Your own face, as a corner picture-in-picture — v1.3 C1.
 *
 * "Your own face does not need equal weight with the people you are talking to.
 * On a two-person call that is the difference between two half-screens and one
 * full one."
 *
 * ## Anchored to the video area, not the screen
 *
 * C1 is explicit about this because it is how the first attempt failed: "The
 * first build of this mockup had it `position:absolute` inside an unpositioned
 * parent, so on mobile it resolved to the frame and sat on top of the control
 * bar." The parent here is `RoomGrid`'s positioned wrapper, which contains the
 * grid and nothing else.
 *
 * ## It is a button, and that is not decoration
 *
 * C1 says "draggable" and stops there, and a `<div>` with pointer handlers is
 * the literal reading. It does not meet the floor.
 *
 * **SC 2.5.7 Dragging Movements** (2.2 AA, which is the target the touch-target
 * floor is already pinned to) requires a single-pointer alternative to any
 * dragging operation unless dragging is essential — and repositioning a corner
 * tile is not essential in the standard's sense. **SC 2.1.1** requires the same
 * thing of the keyboard. And the floor's own first line is "every control
 * keyboard reachable".
 *
 * So pressing it — by click, tap, Enter or Space — moves it to the next corner,
 * clockwise from wherever it is now. The drag stays exactly as C1 describes;
 * this is the path beside it, not instead of it.
 *
 * That also makes the accessible name real. As a `<div>` with no role, the
 * `aria-label` this used to carry was computed and then discarded — a generic
 * element is not exposed with a name, so the label was doing nothing while
 * looking like it was doing the work. axe does not flag it, which is precisely
 * why it needed to be reasoned about rather than waited for.
 *
 * The position is deliberately **not** remembered between meetings. Where you
 * put it depends on what is behind it, and what is behind it is different every
 * time.
 */

/** Below this, a pointer press is a press. Above it, it was a drag. */
const DRAG_THRESHOLD_PX = 4;

type Offset = { x: number; y: number };

export function SelfViewPiP({
  participant,
  track,
  cameraOn,
}: {
  participant: Participant;
  track: Track | undefined;
  cameraOn: boolean;
}) {
  /**
   * The element in state, not a ref — the lesson from A3, one component along.
   *
   * The `<video>` is conditionally rendered, so turning the camera off and on
   * mounts a *new* element while `track` stays the same object. An effect keyed
   * on the track alone would never re-run, and the second element would never
   * be handed the stream.
   */
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLButtonElement>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  const travelled = useRef(0);

  useEffect(() => {
    if (!video || !track) return;
    track.attach(video);
    return () => {
      track.detach(video);
    };
  }, [track, video]);

  /**
   * How far the tile may travel from its resting corner, in each axis.
   *
   * **Sizes, never positions.** `getBoundingClientRect` reports the
   * *transformed* box, and this element carries the drag's own `translate` — so
   * reading a position from it would feed the clamp its own output. Width and
   * height are safe: a translation moves a box without resizing it, so the
   * rect's dimensions are the untransformed ones.
   *
   * Which matters, because `offsetHeight` is a rounded integer and this tile is
   * 112.5px tall at 200px wide. Rounding it put the far corner a pixel inside
   * the near one — invisible in use, and the kind of thing only found by
   * asserting the number.
   */
  const range = useCallback(() => {
    const self = box.current;
    const parent = self?.offsetParent as HTMLElement | null;
    if (!self || !parent) return null;
    const rect = self.getBoundingClientRect();
    return {
      x: Math.max(0, parent.clientWidth - rect.width - 32),
      y: Math.max(0, parent.clientHeight - rect.height - 32),
    };
  }, []);

  /** Keep the whole tile inside its wrapper, with the design's 16px inset. */
  const clamp = useCallback(
    (next: Offset): Offset => {
      const max = range();
      if (!max) return next;
      return {
        x: Math.min(0, Math.max(-max.x, next.x)),
        y: Math.min(0, Math.max(-max.y, next.y)),
      };
    },
    [range],
  );

  /**
   * The single-pointer and keyboard path: step to the next corner clockwise.
   *
   * Clockwise *from where it actually is*, not from a counter — after a drag a
   * counter would send it somewhere unrelated to what you are looking at. The
   * resting corner is bottom-right, so offsets run from (0, 0) there to
   * (−x, −y) at top-left.
   */
  const nextCorner = () => {
    const max = range();
    if (!max) return;
    const corners: Offset[] = [
      { x: 0, y: 0 }, // bottom-right
      { x: -max.x, y: 0 }, // bottom-left
      { x: -max.x, y: -max.y }, // top-left
      { x: 0, y: -max.y }, // top-right
    ];
    const at = corners.reduce(
      (best, corner, index) => {
        const distance = Math.hypot(corner.x - offset.x, corner.y - offset.y);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: 0, distance: Infinity },
    );
    setOffset(corners[(at.index + 1) % corners.length]);
  };

  const name = displayNameOf(participant);
  const showVideo = Boolean(track) && cameraOn;

  return (
    <button
      type="button"
      ref={box}
      // Reactions rise from a participant's tile and `RoomStage` finds the
      // origin with `[data-participant]`. Without this the local user's own
      // reactions would fall through to the centre-of-room fallback.
      data-participant={participant.identity}
      data-self-view
      // The action, because that is what pressing it does. "You" inside the
      // tile says whose face it is; it is content, the way every other tile's
      // name is, and not this control's label.
      aria-label="Move self view to the next corner"
      onPointerDown={(event) => {
        from.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
        travelled.current = 0;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!from.current) return;
        const next = { x: event.clientX - from.current.x, y: event.clientY - from.current.y };
        travelled.current = Math.max(
          travelled.current,
          Math.hypot(next.x - offset.x, next.y - offset.y),
        );
        // Below the threshold this is still a press, and moving now would make
        // the tile twitch under a tap.
        if (travelled.current < DRAG_THRESHOLD_PX) return;
        setDragging(true);
        setOffset(clamp(next));
      }}
      onPointerUp={() => {
        from.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        from.current = null;
        travelled.current = 0;
        setDragging(false);
      }}
      onClick={() => {
        // A drag ends in a click too. Only an actual press should move corners.
        if (travelled.current >= DRAG_THRESHOLD_PX) {
          travelled.current = 0;
          return;
        }
        nextCorner();
      }}
      /*
       * A corner step is a state change and gets the state-change duration.
       * Never while dragging: a transition there would run the tile behind the
       * pointer.
       *
       * A class rather than an inline `transition`, so `motion-reduce` can
       * actually reach it — the floor removes travel under
       * `prefers-reduced-motion`, and a variant cannot apply to a style object.
       */
      className={`absolute right-4 bottom-4 z-30 flex w-28 cursor-grab touch-none flex-col overflow-hidden rounded-xl border border-boundary bg-card p-0 shadow-[0_8px_24px_rgba(0,0,0,0.45)] select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] active:cursor-grabbing min-[900px]:w-50 ${
        dragging
          ? ""
          : "transition-[translate] duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
      }`}
      style={{ aspectRatio: "16 / 9", translate: `${offset.x}px ${offset.y}px` }}
    >
      {showVideo ? (
        <video
          ref={setVideo}
          autoPlay
          playsInline
          // Muted always: remote audio is `RoomAudioRenderer`'s, and this is
          // your own microphone — playing it back is an echo of yourself.
          muted
          // Mirrored, like the pre-join preview and for the same reason: this
          // is the one video you look at as if it were a mirror.
          className="h-full w-full -scale-x-100 object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          {/*
            Two explicit sizes, not `Tile`'s `min(34cqmin, 44px)`.

            That expression was copied across and quietly resolved against the
            wrong box: `cqmin` looks up to the nearest *size container*, and this
            tile — unlike `Tile` — does not declare one. It found the whole stage
            instead, where 34cqmin is hundreds of pixels, so the `min()` always
            returned 44 and the proportion never applied. 44px inside a 63px-tall
            phone PiP is most of the tile.
          */}
          <span
            className="flex size-8 items-center justify-center rounded-full bg-secondary min-[900px]:size-11"
            aria-hidden
          >
            <span className="type-small text-secondary-foreground">{initialOf(name)}</span>
          </span>
        </span>
      )}

      {/*
        Rule 4: nothing sits directly on video. A fixed 32px band here rather
        than `Tile`'s proportional 30cqh — at 112px wide the tile is 63px tall
        and a proportion of that is smaller than the line box it has to hold.
      */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-end px-2 pb-1"
        style={{ background: "linear-gradient(to top, var(--scrim), transparent)" }}
      >
        {/* `--on-scrim`, not `--foreground` — the scrim is theme-invariant and
            `--foreground` is 2.30:1 on it in light mode. */}
        <span className="type-caption truncate text-[var(--on-scrim)]">You</span>
      </span>
    </button>
  );
}
