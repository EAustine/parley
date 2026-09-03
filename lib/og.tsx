import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared primitives for the two Open Graph cards.
 *
 * Extracted in Phase 10, when the meeting-link card was added. The colours were
 * duplicated the moment there were two files, and this project has already paid
 * for that once: `TILE_BORDER` sat at `#414954` here — the pre-Phase-0 value,
 * retired for measuring 2.09:1 — long after the token became `#5D6777`.
 * `scripts/contrast.mjs` reads only `globals.css`, so no gate can see a colour
 * hardcoded in a card, which makes one copy the only real defence.
 *
 * Keep these in step with `app/globals.css`. They are literals because
 * `ImageResponse` resolves no CSS custom properties.
 */


export const BACKGROUND = "#0E1013";
export const FOREGROUND = "#F2F4F7";
export const MUTED_FOREGROUND = "#9AA1AC";
/**
 * `--tile-border`, and it must stay in step with `app/globals.css`.
 *
 * This read `#414954` until Phase 10 — the pre-Phase-0 value, retired for
 * measuring 2.09:1 against the ground when WCAG 1.4.11 wants 3:1. The token has
 * been `#5D6777` (3.33:1) since. It survived because `scripts/contrast.mjs`
 * reads only `globals.css`, so no gate can see a colour hardcoded here, on the
 * most-seen artefact the product has.
 */
export const TILE_BORDER = "#5D6777";
export const SCRIM = "rgba(14, 16, 19, 0.72)";

export function fontPath(file: string) {
  return join(process.cwd(), "app", "fonts", file);
}

export function Mark({ size: markSize }: { size: number }) {
  const u = markSize / 24;
  const cell = (x: number, y: number, filled: boolean) => ({
    position: "absolute" as const,
    display: "flex",
    left: x * u,
    top: y * u,
    width: 9 * u,
    height: 9 * u,
    borderRadius: 2.4 * u,
    ...(filled
      ? { backgroundColor: FOREGROUND }
      : {
          // >=32px: the empty cell carries a 1.5 stroke at 40% opacity.
          border: `${1.5 * u}px solid ${FOREGROUND}`,
          opacity: 0.4,
        }),
  });

  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: markSize,
        height: markSize,
      }}
    >
      <div style={cell(1, 1, true)} />
      <div style={cell(14, 1, true)} />
      <div style={cell(1, 14, true)} />
      <div style={cell(14, 14, false)} />
    </div>
  );
}

export async function instrumentSans() {
  const [regular, semibold] = await Promise.all([
    readFile(fontPath("InstrumentSans-Regular.ttf")),
    readFile(fontPath("InstrumentSans-SemiBold.ttf")),
  ]);
  return [
    { name: "Instrument Sans", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Instrument Sans", data: semibold, weight: 600 as const, style: "normal" as const },
  ];
}
