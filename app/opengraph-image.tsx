import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// next/font/google does not expose the font binary to ImageResponse, so the
// static weights are vendored in app/fonts/ and read from disk here.
export const runtime = "nodejs";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BACKGROUND = "#0E1013";
const FOREGROUND = "#F2F4F7";
const MUTED_FOREGROUND = "#9AA1AC";
const TILE_BORDER = "#414954";
const SCRIM = "rgba(14, 16, 19, 0.72)";

function fontPath(file: string) {
  return join(process.cwd(), "app", "fonts", file);
}

/**
 * The mark at product scale — three filled cells and one empty, drawn as real
 * tiles rather than logo geometry, so the card previews the actual interface.
 * The fourth cell is never filled.
 */
function ProductTiles() {
  const tiles = [
    { name: "Ama", filled: true },
    { name: "Kofi", filled: true },
    { name: "Yaa", filled: true },
    { name: null, filled: false },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        width: 340,
        height: 232,
        gap: 12,
      }}
    >
      {tiles.map((tile, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            position: "relative",
            width: 164,
            height: 110,
            borderRadius: 12,
            border: `1px solid ${TILE_BORDER}`,
            backgroundColor: tile.filled ? "#242830" : "transparent",
          }}
        >
          {tile.name && (
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: 8,
                bottom: 8,
                padding: "2px 8px",
                borderRadius: 6,
                backgroundColor: SCRIM,
                color: FOREGROUND,
                fontSize: 13,
                fontWeight: 400,
              }}
            >
              {tile.name}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** The logomark, 24-unit grid, at 88px. */
function Mark({ size: markSize }: { size: number }) {
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

export default async function OpenGraphImage() {
  const [regular, semibold] = await Promise.all([
    readFile(fontPath("InstrumentSans-Regular.ttf")),
    readFile(fontPath("InstrumentSans-SemiBold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 88px",
          backgroundColor: BACKGROUND,
          fontFamily: "Instrument Sans",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
          {/* Stacked lockup, mark at 88px. Gap is half the mark height. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
            <Mark size={88} />
            <div
              style={{
                display: "flex",
                fontSize: 122,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: FOREGROUND,
                lineHeight: 1,
              }}
            >
              {SITE_NAME}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 400,
              color: MUTED_FOREGROUND,
            }}
          >
            {SITE_TAGLINE}
          </div>
        </div>

        <ProductTiles />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Instrument Sans", data: regular, weight: 400, style: "normal" },
        {
          name: "Instrument Sans",
          data: semibold,
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}
