/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Ratios are computed from the live CSS custom properties at runtime, never
 * hardcoded — a token edit that breaks a ratio has to show up on /dev/tokens
 * rather than in a stale table.
 */

export type Rgb = { r: number; g: number; b: number };

/** Parses `#rgb`, `#rrggbb`, `rgb()` and `rgba()`. Alpha is ignored. */
export function parseColor(input: string): Rgb | null {
  const value = input.trim();

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  const fn = value.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i,
  );
  if (fn) {
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) };
  }

  return null;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast between two colour strings; null if either cannot be parsed. */
export function ratio(a: string, b: string): number | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  return contrastRatio(ca, cb);
}

export type Level = "AAA" | "AA" | "AA Large" | "UI" | "fail";

/** WCAG level for normal-size body text, with the non-text 3:1 floor called out. */
export function level(value: number): Level {
  if (value >= 7) return "AAA";
  if (value >= 4.5) return "AA";
  if (value >= 3) return "AA Large";
  return "fail";
}
