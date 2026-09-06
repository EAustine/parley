#!/usr/bin/env node
/**
 * No bare stacking order — BUILD-PLAN v1.5 D1.
 *
 * > "A named scale in `CLAUDE.md`, and no bare numbers anywhere… The scale is
 * > worth nothing if the next component can still write `z-50`."
 *
 * The reported symptom was a reaction drawing behind the self-view. The one-line
 * fix is a bigger number on the reaction layer, and it would leave the cause in
 * place: there was no z-index rule of any kind, so every layer's order had been
 * decided locally by whoever wrote the component, and C1's PiP arrived after the
 * reaction layer and won by default. Twenty values across seventeen files, none
 * of them wrong on its own.
 *
 * **Comments are stripped before scanning, and that is not a nicety.** Seven of
 * the twenty-nine matches in the first survey were prose *about* z-index —
 * `RoomControls` explaining why the bar is above the panels, `PopupMenu`
 * explaining the stacking context that occludes it. A check that fails on those
 * teaches people to delete the explanations, which are the most valuable lines
 * in those files.
 *
 * Run with: npm run check:layers
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const EXTS = [".ts", ".tsx", ".css"];

/** The scale, read from the stylesheet so this cannot drift from the source. */
const css = readFileSync("app/globals.css", "utf8");
const LAYERS = [...css.matchAll(/--layer-([a-z-]+):\s*(\d+)/g)].map((m) => m[1]);
if (LAYERS.length === 0) {
  console.error("No --layer-* tokens in app/globals.css — the scale is missing.");
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (EXTS.some((e) => path.endsWith(e))) out.push(path);
  }
  return out;
}

/**
 * Blank out comments, preserving length and newlines so reported line numbers
 * stay true. Cheap and sufficient: this is looking for a `z-…` token, and the
 * only way to get a false negative is to write one inside a string that looks
 * like a comment, which is not a thing anybody does by accident.
 */
function stripComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank);
}

/**
 * A bare order is any of these, and the allowed form is
 * `z-[var(--layer-…)]` — or `z-auto`, which expresses "no opinion" and is the
 * right answer more often than a number.
 */
const PATTERNS = [
  { what: "Tailwind z-<n>", re: /\bz-(\d+)\b/g },
  { what: "Tailwind z-[<n>]", re: /\bz-\[\s*(\d+)\s*\]/g },
  { what: "CSS z-index", re: /(?<!--layer-[a-z-]{0,20})\bz-index\s*:\s*(-?\d+)/g },
  { what: "inline zIndex", re: /\bzIndex\s*:\s*(-?\d+)/g },
];

const offences = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const source = readFileSync(file, "utf8");
    // The scale's own declarations are the one legitimate place for a number.
    if (file === "app/globals.css") continue;
    const code = stripComments(source);
    for (const { what, re } of PATTERNS) {
      for (const m of code.matchAll(re)) {
        const line = code.slice(0, m.index).split("\n").length;
        offences.push({ file, line, what, text: m[0] });
      }
    }
  }
}

if (offences.length) {
  for (const o of offences) {
    console.log(`✘ ${o.file}:${o.line}  ${o.text}  (${o.what})`);
  }
  console.log(
    `\n${offences.length} bare stacking order${offences.length === 1 ? "" : "s"}.\n` +
      `Use the scale: ${LAYERS.map((l) => `z-[var(--layer-${l})]`).join(", ")}.\n` +
      "A number here is an order nobody else can see, which is how a reaction\n" +
      "ended up behind the self-view.",
  );
  process.exit(1);
}

console.log(`✔ no bare stacking order in ${ROOTS.join(", ")}`);
console.log(`  scale: ${LAYERS.join(" < ")}`);
