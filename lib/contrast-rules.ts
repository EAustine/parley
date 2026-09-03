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

/**
 * The scrim, composited over white — the one surface that is not a token.
 *
 * Rule 4 puts every label on `--scrim`, and until Phase 8 nothing checked it:
 * `ALL_SURFACES` is seven opaque tokens and the scrim is `rgba()`, so the
 * matrix passed while a 2.53:1 label could ship. White is the worst case for
 * light text and video can be anything.
 *
 * `scripts/contrast.mjs` derives the value from the declared alpha rather than
 * hard-coding it, and asserts that this file and that one still describe the
 * same rules — a claim this comment used to make on its own.
 */
export const SCRIM_OVER_WHITE = "scrim-over-white";

export type Surface = (typeof ALL_SURFACES)[number];

export type ContrastRule = {
  token: string;
  surfaces: readonly string[];
  threshold: number;
  note?: string;
  /**
   * Shown instead of the token name. `--foreground` carries two rules — the
   * opaque surfaces and the scrim — and two rows with the same name read as a
   * duplicate rather than as a different question being asked.
   */
  label?: string;
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
    note: "boundary use only — the room ground, and the panel edge on --popover",
  },
  { token: "--ring", surfaces: ALL_SURFACES, threshold: NON_TEXT },
  {
    token: "--foreground",
    surfaces: [SCRIM_OVER_WHITE],
    threshold: TEXT,
    label: "--foreground over video",
    note: "Only --foreground is permitted on the scrim: --state-warning falls to 3.79:1 there and --state-critical to 2.53:1, which is why rule 4 sends hued state indicators to an opaque --popover chip. Dark only — the scrim exists over video, and rule 8b forces .dark on /j/[code] and /room/[code].",
  },
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
