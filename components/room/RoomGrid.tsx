"use client";

import { useEffect, useState } from "react";
import { useParticipants, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";

import {
  filmstripLayout,
  gridLayout,
  visibleOrder,
  type Viewport,
} from "@/lib/room/layout";
import { OverflowTile, Tile } from "@/components/room/Tile";
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

  // §3.4: while someone is sharing, the grid collapses to a rail beside the
  // content. A different shape, not a narrower grid — see `filmstripLayout`.
  const strip = filmstripLayout(participants.length, viewport);
  const layout = gridLayout(participants.length, viewport, page);

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
    participants.map((p) => ({
      identity: p.identity,
      isLocal: p.isLocal,
      lastSpokeAt: p.lastSpokeAt ?? null,
      joinedAt: p.joinedAt ?? null,
      participant: p,
    })),
    filmstrip ? strip : layout,
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

  if (filmstrip) {
    return (
      <div
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
            : "flex h-[110px] w-full shrink-0 gap-2 overflow-x-auto"
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

      {/* The stage. A size container so the grid below can be sized against
          both of its dimensions at once — see the letterbox note there. */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center"
        style={{ containerType: "size" }}
      >
        {/* v1.2 B3: an 8px gutter, the same as the filmstrip's. */}
        <div
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
            // 200ms cubic-bezier(0.2, 0, 0, 1) is the grid-reflow step in
            // CLAUDE.md. Only the template transitions — tiles themselves must
            // not animate size, which is what produces reflow thrash.
            transition: "grid-template-columns 200ms cubic-bezier(0.2, 0, 0, 1)",
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

/**
 * Desktop or mobile portrait — §3.4 gives them different behaviour, not just
 * different sizes, so this is a layout decision rather than a CSS breakpoint.
 *
 * Matched in JS because the two columns of the table differ in *kind*: desktop
 * overflows into a "+N" cell, mobile pages. No media query expresses "render a
 * different number of children".
 */
function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>("desktop");

  useEffect(() => {
    // Portrait as well as narrow: a phone held sideways gets the desktop grid,
    // which is the right call — the area is then wide enough for 3 across.
    const query = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    const apply = () => setViewport(query.matches ? "mobile" : "desktop");
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return viewport;
}
