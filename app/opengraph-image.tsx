import { ImageResponse } from "next/og";

import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";
import {
  BACKGROUND, BOUNDARY, FOREGROUND, MUTED_FOREGROUND, SCRIM,
  Mark, instrumentSans,
} from "@/lib/og";

// next/font/google does not expose the font binary to ImageResponse, so the
// static weights are vendored in app/fonts/ and read from disk here.
export const runtime = "nodejs";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";


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
            border: `1px solid ${BOUNDARY}`,
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

export default async function OpenGraphImage() {
  const fonts = await instrumentSans();

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
      fonts,
    },
  );
}
