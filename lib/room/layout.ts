/**
 * The grid, as arithmetic.
 *
 * §3.4 opens with "write these before writing layout code", and states the
 * breakpoints as a table. A table is a specification, so it is transcribed once
 * here as a pure function and asserted against row by row in
 * `npm run check:room` — rather than living as a chain of conditions inside a
 * component where nothing can reach it and a wrong cell count only shows up
 * with seven real people in a room.
 *
 * Desktop and mobile portrait diverge in kind, not just in size: desktop
 * overflows into a "+N" cell and never pages, mobile pages and never overflows.
 * Two behaviours, one table.
 */

export type Viewport = "desktop" | "mobile";

export type GridLayout = {
  columns: number;
  rows: number;
  /** Participants shown at once, the overflow cell included where there is one. */
  capacity: number;
  /** Tiles actually rendered on this page. */
  tiles: number;
  pages: number;
  page: number;
  /**
   * Participants not shown, surfaced as a "+N" cell in the last position.
   * Zero on mobile, which pages instead.
   */
  overflow: number;
  /**
   * A lone tile keeps 16:9 and centres in the area rather than stretching.
   * §3.4: individual tiles inside a grid are never letterboxed, but a single
   * tile filling a wide desktop area would have to crop severely to avoid it.
   */
  letterbox: boolean;
};

/** Desktop: [maxParticipants, columns, rows]. The last row is open-ended. */
const DESKTOP: [number, number, number][] = [
  [1, 1, 1],
  [2, 2, 1],
  [4, 2, 2],
  [6, 3, 2],
  [9, 3, 3],
  [16, 4, 4],
];

export function gridLayout(
  count: number,
  viewport: Viewport,
  page = 0,
): GridLayout {
  const people = Math.max(0, Math.floor(count));

  if (viewport === "mobile") {
    // Stacked equal, then 2×2 for everything above four — §3.4's whole mobile
    // column is one shape with a page indicator bolted on past four.
    const [columns, rows] =
      people <= 1 ? [1, 1] : people === 2 ? [1, 2] : [2, 2];
    const capacity = columns * rows;
    const pages = Math.max(1, Math.ceil(people / capacity));
    const current = clamp(page, 0, pages - 1);
    return {
      columns,
      rows,
      capacity,
      tiles: Math.min(capacity, people - current * capacity),
      pages,
      page: current,
      overflow: 0,
      // "Full area" on mobile portrait, where the area is already close to a
      // tile's shape and letterboxing would waste most of the screen.
      letterbox: false,
    };
  }

  const row = DESKTOP.find(([max]) => people <= max);
  if (row) {
    const [, columns, rows] = row;
    return {
      columns,
      rows,
      capacity: columns * rows,
      tiles: people,
      pages: 1,
      page: 0,
      overflow: 0,
      letterbox: people <= 1,
    };
  }

  // 17+. The last cell of the 4×4 stops being a person and becomes the count
  // of everyone who isn't shown, so fifteen faces fit rather than sixteen.
  const capacity = 16;
  return {
    columns: 4,
    rows: 4,
    capacity,
    tiles: capacity - 1,
    pages: 1,
    page: 0,
    overflow: people - (capacity - 1),
    letterbox: false,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Who is on screen, and in what order.
 *
 * §3.4: "Overflow ordering: most recent speaker first, then join order. The
 * person talking is never the person hidden."
 *
 * Read literally, that sorts every tile by speaking recency — which would
 * reshuffle the whole grid every time someone says a word, and §3.4's own
 * acceptance criteria forbid exactly that ("reflows without layout thrash").
 * The two are only in tension if the rule is about *arrangement*. It isn't: it
 * is headed "overflow ordering", and it exists to decide who makes the cut.
 *
 * So the rule picks the visible set, and join order arranges it. Nobody moves
 * while everyone fits, and a hidden person who speaks takes a place from
 * whoever has been quiet longest.
 *
 * The local participant is never a candidate for hiding. Rule 3 makes your own
 * mute state a privacy matter, and your tile is where camera state is legible
 * — being pushed off your own screen by a crowd is the wrong failure.
 */
export type Rankable = {
  identity: string;
  isLocal: boolean;
  lastSpokeAt?: Date | number | null;
  joinedAt?: Date | number | null;
};

export function visibleOrder<T extends Rankable>(
  participants: T[],
  layout: GridLayout,
): T[] {
  const start = layout.page * layout.capacity;
  const byJoin = [...participants].sort(joinOrder);

  // Mobile pages: every participant is reachable by paging, so there is no cut
  // to make and no reason to disturb the order.
  if (layout.pages > 1) return byJoin.slice(start, start + layout.tiles);
  if (participants.length <= layout.tiles) return byJoin;

  const chosen = new Set(
    [...participants]
      .sort(speakingPriority)
      .slice(0, layout.tiles)
      .map((p) => p.identity),
  );
  return byJoin.filter((p) => chosen.has(p.identity));
}

function time(value: Date | number | null | undefined): number {
  if (value == null) return 0;
  return value instanceof Date ? value.getTime() : value;
}

function joinOrder(a: Rankable, b: Rankable): number {
  if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
  const delta = time(a.joinedAt) - time(b.joinedAt);
  // Identity last so the order is total: two participants admitted in the same
  // millisecond must not swap places between renders.
  return delta !== 0 ? delta : a.identity.localeCompare(b.identity);
}

function speakingPriority(a: Rankable, b: Rankable): number {
  if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
  const delta = time(b.lastSpokeAt) - time(a.lastSpokeAt);
  return delta !== 0 ? delta : joinOrder(a, b);
}
