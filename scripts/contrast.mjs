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
 * would push --state-critical so light it stops reading as red, and --tile-border
 * is single-purpose — it belongs to the room ground and nowhere else.
 */

import { readFile } from "node:fs/promises";
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
 * Validation error text sits below a field on the ground, never inside the
 * filled input — so --state-critical does not need to clear --input (4.34:1).
 */
const RULES = [
  { token: "--foreground", surfaces: ALL_SURFACES, threshold: TEXT },
  { token: "--muted-foreground", surfaces: ALL_SURFACES, threshold: TEXT },
  { token: "--state-warning", surfaces: ALL_SURFACES, threshold: TEXT },
  {
    token: "--state-critical",
    surfaces: ALL_SURFACES.filter((s) => s !== "--input"),
    threshold: TEXT,
    note: "not --input — validation text sits below the field, on the ground",
  },
  {
    token: "--tile-border",
    surfaces: ["--background"],
    threshold: NON_TEXT,
    note: "the room ground only; single-purpose",
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
const themes = {
  dark: parseBlock(css, ".dark {"),
  light: parseBlock(css, ".light {"),
};

const snapshot = process.argv.includes("--snapshot");
const failures = [];
const rows = [];

for (const [themeName, tokens] of Object.entries(themes)) {
  for (const rule of RULES) {
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
          rule.surfaces.length === ALL_SURFACES.length
            ? "all"
            : rule.surfaces.map((s) => s.replace("--", "")).join(", "),
        threshold: rule.threshold,
        worst: worst.value,
        worstSurface: worst.surface,
        note: rule.note,
      });
    }
  }
}

if (snapshot) {
  console.log("| Token | Theme | Permitted surfaces | Threshold | Worst |");
  console.log("|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| \`${r.token}\` | ${r.theme} | ${r.surfaces} | ${r.threshold} | ${r.worst.toFixed(2)} (\`${r.worstSurface}\`) |`,
    );
  }
  console.log();
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
    "\nFix the token values in app/globals.css. Do not lower a threshold to pass.",
  );
  process.exit(1);
}

console.log(`\n${rows.length} checks passed.`);
