/**
 * The permitted-surface rules, shared between `scripts/contrast.mjs` (the build
 * gate) and `/dev/tokens` (the visual check), so the two cannot disagree.
 *
 * Every token declares the surfaces it is allowed to sit on and the threshold it
 * must clear there. "Check everything" was too blunt: chasing every surface
 * would push `--state-critical` so light it stops reading as red.
 *
 * **Two roles, and a token used in both is checked in both.** A colour can pass
 * as a *surface* — things placed on it are readable — and fail as a *boundary*,
 * where the question is whether the line itself is visible against what it
 * separates. `--input` passed for years as a surface and was never asked the
 * second question, while it drew the border of every `Input` and every select
 * trigger at 1.44:1 dark and 1.25:1 light. Nothing failed, because nothing
 * asked.
 *
 * `CLAUDE.md`: "A value can pass as a text surface and fail as a boundary; the
 * script comparing token against token in one role only is how both this and
 * the tile edge shipped."
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
  { token: "--ring", surfaces: ALL_SURFACES, threshold: NON_TEXT },
  {
    token: "--foreground",
    surfaces: [SCRIM_OVER_WHITE],
    threshold: TEXT,
    label: "--foreground over video",
    note: "Only --foreground is permitted on the scrim: --state-warning falls to 3.79:1 there and --state-critical to 2.53:1, which is why rule 4 sends hued state indicators to an opaque --popover chip. Dark only — the scrim exists over video, and rule 8b forces .dark on /j/[code] and /room/[code].",
  },
];

/**
 * The boundary role: the token *is* the line, and the question is whether it is
 * visible against the surface it separates a component from.
 *
 * `--boundary` draws tile edges, panel edges and form-field borders — anywhere
 * fill contrast cannot carry the boundary, which in this palette is everywhere,
 * since the whole ramp spans 0.2 of a contrast point.
 *
 * The surface list is where a bordered component actually sits: the ground, a
 * card, a panel, and `--muted`. Not `--secondary` or `--accent` — those are
 * button fills, and a button's edge is not what identifies it. Not `--input`
 * either: that is the field's own fill, the *inner* side of the line, and a
 * boundary does not have to clear the thing it encloses as well as the thing it
 * separates that from. The same reasoning applied to the panel edge before this
 * token had a second use.
 */
export const BOUNDARY_SURFACES = [
  "--background",
  "--card",
  "--popover",
  "--muted",
] as const;

export const BOUNDARY_RULES: ContrastRule[] = [
  {
    token: "--boundary",
    surfaces: BOUNDARY_SURFACES,
    threshold: NON_TEXT,
    label: "boundary use only: tile edges, panel edges, form-field borders — any surface with no usable fill contrast",
    note: "Tile edges, panel edges, form-field borders. Never a text colour.",
  },
];

/**
 * Tokens that may never draw a component boundary, and why.
 *
 * A rule that only computes permitted pairings cannot catch a forbidden *use* —
 * `--input` was checked exhaustively as a surface while it drew every field's
 * border. So this one is a scan, and it is narrow on purpose: one token, named
 * in `CLAUDE.md`, rather than a list that grows.
 */
export const FORBIDDEN_BOUNDARY_TOKENS = [
  {
    token: "--input",
    why: "1.44:1 dark and 1.25:1 light against the ground — SC 1.4.11 needs 3:1. It is a fill, and --boundary is the border.",
  },
] as const;

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
