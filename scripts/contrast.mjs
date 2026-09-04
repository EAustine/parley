#!/usr/bin/env node
/**
 * Contrast gate.
 *
 * Every foreground token declares the surfaces it is permitted to sit on, and
 * the threshold it must clear there. This computes the full matrix from the
 * hex values actually declared in app/globals.css — not from a table someone
 * remembered to update — and exits non-zero on any violation.
 *
 * This file is the source of truth. The tables in CLAUDE.md are a snapshot;
 * regenerate them from `npm run check:contrast -- --snapshot`, do not hand-edit.
 *
 * Why permitted surfaces rather than "check everything": chasing every surface
 * would push --state-critical so light it stops reading as red.
 *
 * --boundary is the boundary colour for a surface with no usable fill
 * contrast against what it sits on — which in this palette is every surface,
 * since the whole ramp spans 0.2 of a contrast point. Tiles and panels both
 * qualify. It is never a text colour. The pairing checked below is the edge
 * against *what it separates the surface from*; the inner side of the line,
 * against the panel's own fill, does not need to clear 3:1 independently.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = join(ROOT, "app", "globals.css");

/** Thresholds: 4.5 for body text (WCAG 1.4.3), 3.0 for non-text (1.4.11). */
const TEXT = 4.5;
const NON_TEXT = 3;

const ALL_SURFACES = [
  "--background",
  "--card",
  "--popover",
  "--muted",
  "--secondary",
  "--accent",
  "--input",
];

/**
 * The one surface that is not a token: the scrim, composited.
 *
 * Rule 4 puts every label on `--scrim`, which makes contrast deterministic
 * regardless of what is on camera — but only if something checks it, and until
 * now nothing did. `ALL_SURFACES` is seven opaque tokens and the scrim is
 * `rgba()`, so the matrix passed 24/24 while a 2.53:1 label could ship.
 *
 * White is the worst case for light text and video can be anything, so the
 * scrim is composited over white and the result treated as an ordinary
 * surface. Derived from the declared alpha rather than hard-coded: raising the
 * scrim's opacity should move this number, not leave it stale.
 */
const SCRIM_OVER_WHITE = "scrim-over-white";

/**
 * Validation error text sits below a field on the ground, never inside the
 * filled input — so --state-critical does not need to clear --input (4.34:1).
 */
const RULES = [
  {
    token: "--foreground",
    surfaces: ALL_SURFACES,
    threshold: TEXT,
    label: "all",
  },
  {
    token: "--muted-foreground",
    surfaces: ALL_SURFACES,
    threshold: TEXT,
    label: "all",
  },
  {
    token: "--state-warning",
    surfaces: ALL_SURFACES,
    threshold: TEXT,
    label: "all",
  },
  {
    token: "--state-critical",
    surfaces: ALL_SURFACES.filter((s) => s !== "--input"),
    threshold: TEXT,
    note: "not --input — validation text sits below the field, on the ground",
    label:
      "background, card, popover, muted, secondary, accent — **not `--input`** (4.34:1)",
  },
  // Foreground-on-fill pairs, checked directly rather than against surfaces.
  {
    token: "--primary-foreground",
    surfaces: ["--primary"],
    threshold: TEXT,
  },
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
  // The focus ring is a non-text indicator under WCAG 1.4.11.
  { token: "--ring", surfaces: ALL_SURFACES, threshold: NON_TEXT },
  /**
   * Only `--foreground` is permitted on the scrim. `--state-warning` falls to
   * 3.79:1 there and `--state-critical` to 2.53:1, which is why rule 4 sends
   * hued state indicators to an opaque `--popover` chip instead.
   *
   * This computes the permitted pairing. It does not detect a *use* of a
   * forbidden one — the permitted-surfaces machinery verifies combinations, it
   * does not scan components. `npm run check:connection` carries that scan,
   * and is weaker for being a scan.
   */
  {
    token: "--foreground",
    surfaces: [SCRIM_OVER_WHITE],
    threshold: TEXT,
    label: "scrim over white",
    // Dark only, and not as a convenience. The scrim exists over video and
    // nowhere else, and rule 8b forces `.dark` on /j/[code] and /room/[code]
    // regardless of preference — so a light `--foreground` never meets a
    // scrim. Checking it anyway reports 2.30:1 for a pairing the product
    // cannot produce, which is a false failure, and the way those get resolved
    // is by lowering a threshold. Scoping the rule to where the surface
    // actually exists is the honest fix.
    themes: ["dark"],
  },
];

/**
 * The second role. Same arithmetic, a different question.
 *
 * A surface rule asks "is what sits on this readable?". A boundary rule asks
 * "is this line visible against what it separates a component from?". A colour
 * can pass the first and fail the second, and until now only the first was ever
 * asked — which is how `--input` drew every field's border at 1.44:1 dark and
 * 1.25:1 light while the matrix reported 25/25.
 *
 * `--secondary` is the tightest permitted surface at 3.05, and it was left out
 * of the first version of this list on the grounds that a button's fill
 * identifies it rather than its edge — reasoning its way to a looser number.
 * Not `--input`: that is the field's own fill, the inner side of the line at
 * 2.73, and a boundary need not clear what it encloses as well as what it
 * separates that from.
 */
const BOUNDARY_SURFACES = ["--background", "--card", "--popover", "--muted", "--secondary"];

const BOUNDARY_RULES = [
  {
    token: "--boundary",
    surfaces: BOUNDARY_SURFACES,
    threshold: NON_TEXT,
    label: "tile edges, panel edges, form-field borders — on `--background`, `--card`, `--popover`, `--muted`, `--secondary`. **Not on `--input`** (2.73).",
    note: "Tile edges, panel edges, form-field borders. Never a text colour. Not --input (2.73) — the inner side of the line.",
  },
];

/**
 * A pairing rule cannot catch a forbidden *use*, so this one is a scan.
 *
 * Narrow on purpose: one token, named in `CLAUDE.md` — "`--input` is not a
 * boundary token and must not be used as one" — rather than a list that grows.
 */
const FORBIDDEN_BOUNDARY_TOKENS = [
  {
    token: "--input",
    why: "1.44:1 dark and 1.25:1 light against the ground — SC 1.4.11 needs 3:1. It is a fill; --boundary is the border.",
  },
];

// --- colour maths ---------------------------------------------------------

function parseHex(hex) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

const channel = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- read the tokens the stylesheet actually declares ----------------------

/** Pulls `--token: #hex;` pairs out of one CSS rule block. */
function parseBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`No \`${selector}\` block in globals.css`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end);
  const tokens = {};
  for (const m of body.matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

// --- run ------------------------------------------------------------------

const css = await readFile(CSS, "utf8");
/** `rgba(r, g, b, a)` over an opaque backdrop, as hex. */
function composite(rgba, over) {
  const m = rgba.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/,
  );
  if (!m) throw new Error(`Could not parse --scrim: ${rgba}`);
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  const front = [Number(m[1]), Number(m[2]), Number(m[3])];
  const back = parseHex(over).map((c) => c * 255);
  const mixed = front.map((c, i) => Math.round(alpha * c + (1 - alpha) * back[i]));
  return "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** The scrim is theme-invariant and lives outside the .dark / .light blocks. */
const scrimDeclaration = css.match(/--scrim:\s*(rgba?\([^)]*\))/);
if (!scrimDeclaration) {
  throw new Error("No --scrim declaration in globals.css — rule 4 is unchecked");
}
const scrimOverWhite = composite(scrimDeclaration[1], "#ffffff");
/** The declaration itself, for the og.tsx literal comparison below. */
const scrimSource = scrimDeclaration[1];

const themes = {
  dark: parseBlock(css, ".dark {"),
  light: parseBlock(css, ".light {"),
};
for (const tokens of Object.values(themes)) {
  tokens[SCRIM_OVER_WHITE] = scrimOverWhite;
}

/**
 * The rules in `lib/contrast-rules.ts` are the same rules.
 *
 * That file's own docstring says the two are "shared … so the two cannot
 * disagree", and they were not shared at all — this script kept its own copy
 * and nothing compared them. A gate and a display that quietly drift apart is
 * how /dev/tokens ends up showing a matrix the build does not enforce.
 *
 * They cannot be imported into each other (`.mjs` and `.ts`), so they are
 * compared instead, which is the same guarantee by a slower route.
 */
{
  const out = mkdtempSync(join(tmpdir(), "parley-contrast-"));
  try {
    execFileSync(
      "npx",
      ["tsc", "lib/contrast-rules.ts", "--outDir", out, "--module", "commonjs",
       "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
      { stdio: "pipe" },
    );
    writeFileSync(join(out, "package.json"), '{"type":"commonjs"}');
    const req = createRequire(join(out, "index.cjs"));
    const lib = req(join(out, "contrast-rules.js"));
    const shape = (rules) =>
      rules
        .map((r) => `${r.token}|${[...r.surfaces].sort().join(",")}|${r.threshold}`)
        .sort()
        .join("\n");
    const mine = shape([...RULES, ...BOUNDARY_RULES]);
    const theirs = shape([...lib.RULES, ...lib.BOUNDARY_RULES, ...lib.PAIR_RULES]);
    if (mine !== theirs) {
      console.error(
        "scripts/contrast.mjs and lib/contrast-rules.ts describe different rules.\n" +
          "The gate and /dev/tokens would show different matrices.\n\n" +
          `gate:\n${mine}\n\nlib:\n${theirs}`,
      );
      process.exit(1);
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const snapshot = process.argv.includes("--snapshot");
const failures = [];
const rows = [];

for (const [themeName, tokens] of Object.entries(themes)) {
  for (const rule of [...RULES, ...BOUNDARY_RULES]) {
    if (rule.themes && !rule.themes.includes(themeName)) continue;
    const fg = tokens[rule.token];
    if (!fg) {
      failures.push(
        `${themeName}: ${rule.token} is not declared in globals.css`,
      );
      continue;
    }
    let worst = null;
    for (const surface of rule.surfaces) {
      const bg = tokens[surface];
      if (!bg) {
        failures.push(
          `${themeName}: ${surface} is not declared in globals.css`,
        );
        continue;
      }
      const value = ratio(fg, bg);
      if (worst === null || value < worst.value) worst = { surface, value };
      if (value < rule.threshold) {
        failures.push(
          `${themeName}: ${rule.token} on ${surface} is ${value.toFixed(2)}:1, below ${rule.threshold}:1`,
        );
      }
    }
    if (worst) {
      rows.push({
        theme: themeName,
        token: rule.token,
        surfaces:
          rule.label ??
          (rule.surfaces.length === ALL_SURFACES.length
            ? "all"
            : rule.surfaces.map((s) => s.replace("--", "")).join(", ")),
        threshold: rule.threshold,
        worst: worst.value,
        worstSurface: worst.surface,
        note: rule.note,
      });
    }
  }
}

/**
 * The load-bearing pairs CLAUDE.md carries as a snapshot. Declared here so the
 * doc's table can be regenerated verbatim rather than hand-copied — which is
 * how four earlier rounds of ratios went stale.
 *
 * `worstOf` resolves to the worst permitted surface for that token, so the
 * label and the number can never disagree about which surface is worst.
 */
const SNAPSHOT_PAIRS = [
  { label: "`--foreground` / `--background`", theme: "dark", fg: "--foreground", bg: "--background" },
  { label: "`--muted-foreground` / worst permitted", theme: "dark", fg: "--muted-foreground", worstOf: "--muted-foreground" },
  { label: "`--state-critical` / worst permitted", theme: "dark", fg: "--state-critical", worstOf: "--state-critical" },
  { label: "`--state-warning` / worst permitted", theme: "dark", fg: "--state-warning", worstOf: "--state-warning" },
  { label: "`--boundary` / worst permitted dark", theme: "dark", fg: "--boundary", worstOf: "--boundary" },
  { label: "`--boundary` / worst permitted light", theme: "light", fg: "--boundary", worstOf: "--boundary" },
  { label: "`--foreground` (speaking, 2px) / `--background`", theme: "dark", fg: "--foreground", bg: "--background" },
  { label: "white / `--destructive` (dark)", theme: "dark", fg: "#FFFFFF", bg: "--destructive" },
  { label: "Light `--muted-foreground` / white", theme: "light", fg: "--muted-foreground", bg: "--background" },
  { label: "Light `--destructive` / white", theme: "light", fg: "--destructive", bg: "--background" },
];

if (snapshot) {
  const dark = rows.filter((r) => r.theme === "dark" && r.surfaces !== null);

  console.log("| Token | Permitted surfaces | Threshold | Worst |");
  console.log("|---|---|---|---|");
  for (const rule of [...RULES, ...BOUNDARY_RULES]) {
    if (!rule.label) continue;
    // Matched on the surface list as well as the token: `--foreground` carries
    // two rules — the opaque surfaces and the scrim — and matching on the token
    // alone found the first and printed its 12.01 against the scrim's label.
    const row = dark.find(
      (r) => r.token === rule.token && r.surfaces === rule.label,
    );
    if (!row) continue;
    console.log(
      `| \`${rule.token}\` | ${rule.label} | ${rule.threshold.toFixed(1)} | ${row.worst.toFixed(2)} |`,
    );
  }

  console.log();
  console.log("| Pair | Ratio |");
  console.log("|---|---|");
  for (const pair of SNAPSHOT_PAIRS) {
    const tokens = themes[pair.theme];
    const fg = pair.fg.startsWith("#") ? pair.fg : tokens[pair.fg];
    let bg;
    let label = pair.label;
    if (pair.worstOf) {
      const rule =
        RULES.find((r) => r.token === pair.worstOf) ??
        BOUNDARY_RULES.find((r) => r.token === pair.worstOf);
      let worst = null;
      for (const s of rule.surfaces) {
        const v = ratio(fg, tokens[s]);
        if (worst === null || v < worst.value) worst = { surface: s, value: v };
      }
      bg = tokens[worst.surface];
      label = `${pair.label} (\`${worst.surface}\`)`;
    } else {
      bg = tokens[pair.bg];
    }
    console.log(`| ${label} | ${ratio(fg, bg).toFixed(2)}:1 |`);
  }
  console.log();
  process.exit(failures.length > 0 ? 1 : 0);
}

/**
 * The forbidden-use scan.
 *
 * Everything above computes whether a *pairing* would pass. None of it can see
 * a token being used in a role it was never checked for, which is exactly what
 * happened: `--input` cleared every surface rule it had while drawing the
 * border of every field at 1.44:1.
 *
 * So this reads the source. It is a scan, and a scan is weaker than a
 * calculation — but the thing it prevents has no other detector, and it is one
 * named token rather than a list that accumulates.
 */
const BORDER_USES = [
  // Tailwind utilities: border-input, dark:border-input, ring-input, etc.
  (t) => new RegExp(`(?:^|[\\s"'\`:])(?:border|divide|outline|ring)-${t.replace("--", "")}(?![\\w-])`, "g"),
  // Inline styles: borderColor: "var(--input)", border: "1px solid var(--input)"
  (t) => new RegExp(`(?:border|outline)[A-Za-z]*\\s*:\\s*[^;\n]*var\\(${t}\\)`, "g"),
];

const sourceFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith(".tsx") || path.endsWith(".ts")) sourceFiles.push(path);
  }
})(join(ROOT, "components"));
(function walkApp(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkApp(path);
    else if (path.endsWith(".tsx") || path.endsWith(".ts")) sourceFiles.push(path);
  }
})(join(ROOT, "app"));

if (sourceFiles.length < 20) {
  failures.push(
    `only ${sourceFiles.length} source files found to scan — the walk is not reaching components/`,
  );
}

for (const { token, why } of FORBIDDEN_BOUNDARY_TOKENS) {
  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const pattern of BORDER_USES) {
      for (const hit of source.matchAll(pattern(token))) {
        failures.push(
          `${file.replace(ROOT + "/", "")}: ${token} is drawing a boundary — ${hit[0].trim()}\n    ${why}`,
        );
      }
    }
  }
}

/**
 * The duplicated literals in `lib/og.tsx`.
 *
 * `ImageResponse` resolves no CSS custom properties, so the social cards carry
 * hex literals. That file's own header says this has cost the project once:
 * `TILE_BORDER` sat at the retired `#414954` long after the token moved. It
 * then cost it a second time — `#5D6777` survived the raise to `#687284`,
 * because a rename of `--tile-border` cannot see a constant named
 * `TILE_BORDER`, and because this gate read only `globals.css`.
 *
 * Twice is a pattern, and a comment asking to be kept in step is not a check.
 * The literals are compared against the tokens they name, in the theme the
 * cards are drawn in — dark, always, because a social card has no viewer
 * preference to follow.
 */
const OG_LITERALS = [
  { constant: "BACKGROUND", token: "--background" },
  { constant: "FOREGROUND", token: "--foreground" },
  { constant: "MUTED_FOREGROUND", token: "--muted-foreground" },
  { constant: "BOUNDARY", token: "--boundary" },
  { constant: "SCRIM", token: "--scrim" },
];

{
  const og = readFileSync(join(ROOT, "lib", "og.tsx"), "utf8");
  const norm = (v) => v.toLowerCase().replace(/\s+/g, "");
  let matched = 0;
  for (const { constant, token } of OG_LITERALS) {
    const declared = og.match(
      new RegExp(`export const ${constant}\\s*=\\s*"([^"]+)"`),
    );
    if (!declared) {
      failures.push(`lib/og.tsx does not export ${constant} — the card colours moved`);
      continue;
    }
    // The cards are drawn dark, and `--scrim` is theme-invariant.
    const expected = themes.dark[token] ?? scrimSource;
    if (norm(declared[1]) !== norm(expected)) {
      failures.push(
        `lib/og.tsx: ${constant} is ${declared[1]} but ${token} is ${expected}`,
      );
    }
    matched += 1;
  }
  if (matched < OG_LITERALS.length) {
    failures.push("not every og.tsx literal was found — the comparison is vacuous");
  }
}

const width = Math.max(...rows.map((r) => r.token.length));
for (const r of rows) {
  const ok = r.worst >= r.threshold;
  console.log(
    `${ok ? "✔" : "✘"} ${r.theme.padEnd(5)} ${r.token.padEnd(width)}  ` +
      `worst ${r.worst.toFixed(2).padStart(6)} on ${r.worstSurface.padEnd(12)} ` +
      `(needs ${r.threshold})${r.note ? `  — ${r.note}` : ""}`,
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrast violation(s):`);
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\nA pairing below its threshold is fixed in app/globals.css; a token drawing\n" +
      "a boundary it is not permitted to draw is fixed at the call site. Do not\n" +
      "lower a threshold, and do not widen the permitted list, to pass.",
  );
  process.exit(1);
}

console.log(`\n${rows.length} checks passed.`);
