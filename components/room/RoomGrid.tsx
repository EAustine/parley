"use client";

import { useEffect, useRef, useState } from "react";
import { useParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";

import {
  filmstripLayout,
  gridLayout,
  visibleOrder,
} from "@/lib/room/layout";
import { useGridFlip } from "@/lib/hooks/useGridFlip";
import { useViewport } from "@/lib/hooks/useViewport";
import { OverflowTile, Tile } from "@/components/room/Tile";
import { SelfViewPiP } from "@/components/room/SelfViewPiP";
import { Button } from "@/components/ui/button";

/**
 * The grid from §3.4.
 *
 * The arithmetic lives in `lib/room/layout.ts` and is asserted row by row
 * against the PRD's table by `npm run check:room`. This file is only the
 * rendering: which viewport we are in, which tracks belong to whom, and the
 * paging control mobile needs and desktop does not.
 */
export function RoomGrid({ filmstrip = false }: { filmstrip?: boolean }) {
  const participants = useParticipants();
  const viewport = useViewport();
  const [page, setPage] = useState(0);

  // Camera tracks, with placeholders so a participant whose camera is off
  // still gets a tile rather than vanishing from the room.
  const trackRefs = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  /**
   * Who the **grid** is for — v1.3 C1.
   *
   * "Your own face does not need equal weight with the people you are talking
   * to. On a two-person call that is the difference between two half-screens
   * and one full one." So the grid counts remote participants and the local one
   * becomes a corner PiP.
   *
   * **Except when you are alone.** With nobody else there the grid would have
   * zero tiles and the only thing on screen would be a 200px self-view in the
   * corner of an empty room — which reads as broken rather than as waiting. So
   * a lone participant is a full-size tile and there is no PiP; the first
   * arrival takes the grid and you shrink into the corner, which is the same
   * reflow the grid already animates.
   *
   * That also keeps the solo case identical to what it was, which is why the
   * tests that measure a lone `[data-participant]` — the avatar's scale, the
   * label's scrim, the sheet's clearance, the offline overlay — are untouched
   * by this change.
   *
   * The **filmstrip is not affected**: `design/02-room.html`'s watching-a-share
   * screen has no PiP and carries "You" as a strip tile. While someone shares,
   * the strip is where everyone is.
   */
  const local = participants.find((p) => p.isLocal) ?? null;
  const remote = participants.filter((p) => !p.isLocal);
  const inGrid = filmstrip || remote.length === 0 ? participants : remote;
  const selfIsPiP = !filmstrip && remote.length > 0 && local !== null;

  // §3.4: while someone is sharing, the grid collapses to a rail beside the
  // content. A different shape, not a narrower grid — see `filmstripLayout`.
  const strip = filmstripLayout(participants.length, viewport);
  const layout = gridLayout(inGrid.length, viewport, page);

  // Paging past the end is not hypothetical: it is what happens when the
  // people on your current page leave.
  useEffect(() => {
    if (page > layout.pages - 1) setPage(Math.max(0, layout.pages - 1));
  }, [page, layout.pages]);

  // Not memoised. `layout` is a fresh object every render, so a memo keyed on
  // it would never hit, and one keyed on its fields would go stale the moment
  // a field was added. Sorting at most sixteen participants is not the cost
  // worth guarding against here.
  const shown = visibleOrder(
    inGrid.map((p) => ({
      identity: p.identity,
      isLocal: p.isLocal,
      lastSpokeAt: p.lastSpokeAt ?? null,
      joinedAt: p.joinedAt ?? null,
      participant: p,
    })),
    filmstrip ? strip : layout,
  );

  /*
   * FLIP the grid on a join or leave — CLAUDE.md's "Grid reflow on join/leave |
   * 200ms, FLIP".
   *
   * The signature is who is shown and in what arrangement, because those are
   * the two things that move a tile: the set changing, and the same set being
   * laid out differently. The overflow count is in it because "+3" becoming
   * "+4" changes nothing geometric but "+0" becoming "+1" adds a cell.
   */
  const grid = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  useGridFlip(
    grid,
    [
      shown.map((s) => s.identity).join(","),
      layout.columns,
      layout.rows,
      layout.overflow,
      layout.letterbox,
    ].join("|"),
  );

  const cameraFor = (identity: string) => {
    const ref = trackRefs.find(
      (t) =>
        t.participant.identity === identity &&
        t.source === Track.Source.Camera,
    );
    // A publication with no track is a placeholder — subscribed but not yet
    // flowing, or muted. Either way there is nothing to attach.
    return ref?.publication?.track ?? undefined;
  };

  /**
   * v1.2 F3: "The active speaker auto-scrolls into view."
   *
   * Horizontal strip only. The desktop rail is a fixed column that shows its
   * whole capacity, so there is nothing to scroll to; the mobile strip fits
   * about two and a bit tiles of the sixteen it now holds, so whoever is
   * talking can easily be off-screen.
   *
   * Reduced motion gets the same scroll without the travel — the participant
   * still needs to be visible, and `scroll-behavior: auto` is the honest way
   * to say "put them there" rather than skipping it. `app/globals.css` already
   * forces that under the preference; this passes it explicitly so the
   * behaviour does not depend on a blanket rule reaching here.
   */
  const speaking = participants.find((p) => p.isSpeaking)?.identity ?? null;
  useEffect(() => {
    if (!filmstrip || strip.orientation !== "horizontal" || !speaking) return;
    const column = stripRef.current;
    const tile = column?.querySelector<HTMLElement>(
      `[data-participant="${CSS.escape(speaking)}"]`,
    );
    if (!column || !tile) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tile.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      inline: "nearest",
      block: "nearest",
    });
  }, [filmstrip, speaking, strip.orientation]);

  if (filmstrip) {
    return (
      <div
        ref={stripRef}
        /*
         * v1.2 B2: a fixed 220px column, tiles stacked from the top at 16:9
         * with an 8px gutter, scrolling when they do not fit.
         *
         * `overflow-hidden` was the defect. The capacity cap (five on desktop)
         * decides who is shown and the "+N" cell carries the rest, but on a
         * short viewport five tiles plus their gutters are taller than the
         * column — and clipping them meant the last tile and sometimes the
         * "+N" itself simply were not there, with nothing to say so.
         */
        className={
          strip.orientation === "vertical"
            ? "flex h-full w-[220px] shrink-0 flex-col gap-2 overflow-y-auto"
            : "flex h-24 w-full shrink-0 gap-2 overflow-x-auto"
        }
      >
        <h2 className="sr-only">
          Participants, {participants.length}
        </h2>
        {shown.map(({ participant }) => (
          <div
            key={participant.identity}
            className={
              strip.orientation === "vertical"
                ? "aspect-video w-full shrink-0"
                : "aspect-video h-full shrink-0"
            }
          >
            <Tile
              participant={participant}
              track={cameraFor(participant.identity)}
              cameraOn={participant.isCameraEnabled}
            />
          </div>
        ))}
        {strip.overflow > 0 && (
          <div
            className={
              strip.orientation === "vertical"
                ? "aspect-video w-full shrink-0"
                : "aspect-video h-full shrink-0"
            }
          >
            <OverflowTile count={strip.overflow} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <h1 className="sr-only">
        Meeting, {participants.length}{" "}
        {participants.length === 1 ? "participant" : "participants"}
      </h1>

      {/*
        The stage. A size container so the grid below can be sized against both
        of its dimensions at once — see the letterbox note there.

        **And `relative`, which is C1's whole warning.** The PiP is
        `position: absolute`, so it resolves against the nearest positioned
        ancestor: "The first build of this mockup had it `position:absolute`
        inside an unpositioned parent, so on mobile it resolved to the frame and
        sat on top of the control bar." This element contains the grid and
        nothing else, which is what makes "inside the video area" true rather
        than approximately true.
      */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        style={{ containerType: "size" }}
      >
        {/* v1.2 B3: an 8px gutter, the same as the filmstrip's. */}
        <div
          ref={grid}
          className="grid h-full w-full gap-2"
          style={{
            gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
            // §3.4: a lone tile keeps 16:9 and centres rather than cropping to
            // fill the area. Every other count fills the grid, where
            // letterboxing individual tiles is explicitly forbidden.
            //
            // `min(100cqw, 100cqh * 16 / 9)` rather than `aspect-ratio` with a
            // max on one side. Fitting a ratio inside a box needs *whichever*
            // dimension is tighter to win, and a single max cannot do that:
            // `aspect-ratio` plus `max-height` overflows a narrow container
            // horizontally, and plus `max-width` it overflows a wide one
            // vertically. The first version of this was 1956px wide inside a
            // 1337px area, with the tile running under the chat panel.
            ...(layout.letterbox
              ? {
                  width: "min(100cqw, calc(100cqh * 16 / 9))",
                  height: "auto",
                  aspectRatio: "16 / 9",
                }
              : null),
            /*
             * No transition here. This declared
             * `grid-template-columns 200ms` and it never once ran:
             * `grid-template-columns` interpolates only between track lists of
             * equal length, and a join changes the count every time. The
             * reflow is done by FLIP in `useGridFlip` instead — see there.
             */
          }}
        >
          {shown.map(({ participant }) => (
            <Tile
              key={participant.identity}
              participant={participant}
              track={cameraFor(participant.identity)}
              cameraOn={participant.isCameraEnabled}
            />
          ))}
          {layout.overflow > 0 && <OverflowTile count={layout.overflow} />}
        </div>

        {/* v1.3 C1’s self view, a sibling of the grid inside the positioned
            stage — not a child of the grid, which would give it a cell. */}
        {selfIsPiP && local && (
          <SelfViewPiP
            participant={local}
            track={cameraFor(local.identity)}
            cameraOn={local.isCameraEnabled}
          />
        )}
      </div>

      {layout.pages > 1 && (
        <Pager
          page={layout.page}
          pages={layout.pages}
          onChange={setPage}
        />
      )}
    </div>
  );
}

function Pager({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-4">
      <Button
        variant="ghost"
        size="touch"
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
      >
        Previous
      </Button>
      <span className="type-data text-muted-foreground" aria-live="polite">
        Page {page + 1} of {pages}
      </span>
      <Button
        variant="ghost"
        size="touch"
        onClick={() => onChange(page + 1)}
        disabled={page >= pages - 1}
      >
        Next
      </Button>
    </div>
  );
}

