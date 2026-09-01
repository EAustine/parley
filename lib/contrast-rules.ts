/**
 * The permitted-surface rules, shared between `scripts/contrast.mjs` (the build
 * gate) and `/dev/tokens` (the visual check), so the two cannot disagree.
 *
 * Every foreground token declares the surfaces it is allowed to sit on and the
 * threshold it must clear there. "Check everything" was too blunt: chasing every
 * surface would push `--state-critical` so light it stops reading as red, and
 * `--tile-border` is single-purpose — it belongs to the room ground and nowhere
 * else.
 */

/** WCAG 1.4.3, body text. */
export const TEXT = 4.5;
/** WCAG 1.4.11, non-text contrast — boundaries and focus indicators. */
export const NON_TEXT = 3;

export const ALL_SURFACES = [
  "--background",
  "--card",
  "--popover",
  "--muted",
  "--secondary",
  "--accent",
  "--input",
] as const;

export type Surface = (typeof ALL_SURFACES)[number];

export type ContrastRule = {
  token: string;
  surfaces: readonly string[];
  threshold: number;
  note?: string;
};

export const RULES: ContrastRule[] = [
  { token: "--foreground", surfaces: ALL_SURFACES, threshold: TEXT },
  { token: "--muted-foreground", surfaces: ALL_SURFACES, threshold: TEXT },
  { token: "--state-warning", surfaces: ALL_SURFACES, threshold: TEXT },
  {
    token: "--state-critical",
    surfaces: ALL_SURFACES.filter((s) => s !== "--input"),
    threshold: TEXT,
    note: "Not --input: validation text sits below the field, on the ground, never inside the filled input. On --input it is 4.34:1.",
  },
  {
    token: "--tile-border",
    surfaces: ["--background"],
    threshold: NON_TEXT,
    note: "The room ground only. A camera-off tile has no fill contrast to fall back on (--card on --background is 1.09:1), so this border is the only thing identifying the tile as a component — which puts it under WCAG 1.4.11.",
  },
  { token: "--ring", surfaces: ALL_SURFACES, threshold: NON_TEXT },
];

/** Foreground-on-fill pairs, checked directly rather than against surfaces. */
export const PAIR_RULES: ContrastRule[] = [
  { token: "--primary-foreground", surfaces: ["--primary"], threshold: TEXT },
  {
    token: "--destructive-foreground",
    surfaces: ["--destructive"],
    threshold: TEXT,
  },
  {
    token: "--secondary-foreground",
    surfaces: ["--secondary"],
    threshold: TEXT,
  },
  { token: "--accent-foreground", surfaces: ["--accent"], threshold: TEXT },
  { token: "--card-foreground", surfaces: ["--card"], threshold: TEXT },
  { token: "--popover-foreground", surfaces: ["--popover"], threshold: TEXT },
];
