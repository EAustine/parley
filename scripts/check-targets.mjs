#!/usr/bin/env node
/**
 * Touch targets, measured rather than declared.
 *
 * CLAUDE.md: "Touch targets: 44px on the room and pre-join surfaces, 24px
 * minimum elsewhere… `check:targets` measures computed sizes from built CSS
 * and fails below the floor for the surface. The line above used to say
 * 'checked every phase' while the work sat in Phase 10 and roughly thirty
 * controls missed it. A claim that is not a script is not a check."
 *
 * The blanket 44px was above the project's stated conformance target: WCAG 2.1
 * AA does not require it and 2.2 AA sets 24px. Enforcing 44 on a desktop
 * dashboard changes density for no gain; enforcing it in the room does, because
 * the room is touch-primary and used one-handed, mid-meeting.
 *
 * **Built CSS, not class names.** `size="sm"` means nothing until Tailwind has
 * emitted `.h-7{height:1.75rem}`, and it is that number the finger meets. This
 * reads the emitted stylesheet and resolves each control's height through it,
 * so renaming a utility or changing the scale is visible here rather than
 * silently fine.
 *
 * Needs a build: run `npm run build` first, as `check:bundle` does.
 *
 * Run with: npm run check:targets
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Next emits the stylesheet into `static/chunks`, not `static/css`, and the
 * name is content-hashed — so this walks for it rather than guessing a path
 * that would silently find nothing and pass everything.
 */
function findCss(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // `cache/` holds intermediate copies that are not what shipped.
    if (entry.isDirectory() && entry.name !== "cache") out.push(...findCss(path));
    else if (entry.name.endsWith(".css")) out.push(path);
  }
  return out;
}

const sheets = findCss(".next/static");
if (sheets.length === 0) {
  console.error(
    "No built CSS under .next/static — run `npm run build` first.\n" +
      "This check measures emitted values; class names alone would be the thing " +
      "it exists not to trust.",
  );
  process.exit(1);
}

const css = sheets.map((f) => readFileSync(f, "utf8")).join("\n");

/** `.h-11{height:2.75rem}` and `.size-11{width:2.75rem;height:2.75rem}` → px. */
function heightOf(cls) {
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`\\.${escaped}\\s*\\{([^}]*)\\}`);
  const m = css.match(rule);
  if (!m) return null;
  const h = m[1].match(/(?:^|;)\s*height\s*:\s*([\d.]+)(rem|px)/);
  if (!h) return null;
  return h[2] === "rem" ? Number(h[1]) * 16 : Number(h[1]);
}

/** The size variants declared by the shared Button. */
const buttonSource = readFileSync("components/ui/button.tsx", "utf8");
const variants = {};
for (const m of buttonSource.matchAll(
  /"?([a-z-]+)"?\s*:\s*"((?:[^"\\]|\\.)*)"/g,
)) {
  const [, name, classes] = m;
  const cls = classes.match(/\b(?:size|h)-[\d.]+\b/);
  if (cls) {
    const px = heightOf(cls[0]);
    if (px !== null) variants[name] = { cls: cls[0], px };
  }
}

let failed = 0;
const check = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${label}${pass ? "" : `  — ${detail}`}`);
};
let count = 0;
const t = (pass, label, detail) => { count++; check(pass, label, detail); };

console.log("Touch targets, from built CSS\n");

// A vacuity guard. If the stylesheet were unreadable or the utilities renamed,
// every lookup would return null and every control would pass unmeasured.
t(Object.keys(variants).length >= 4,
  "the Button size variants resolved against the emitted stylesheet",
  `resolved: ${JSON.stringify(variants)}`);
t(variants.touch?.px === 44,
  "the touch variant is 44px",
  `${variants.touch?.cls} = ${variants.touch?.px}px`);
t((variants.default?.px ?? 0) >= 24,
  "and the default clears the 24px floor for document surfaces",
  `${variants.default?.cls} = ${variants.default?.px}px`);

/**
 * 44 in the room and pre-join; 24 everywhere else.
 *
 * Keyed on directory, which is a proxy for surface and not the same thing.
 * `components/meetings/JoinCodeForm.tsx` renders on `/j/[code]` — a pre-join
 * surface — and was graded at 24 because of where the file lives. Components
 * that reach a touch-primary surface from elsewhere are listed here rather
 * than moved, because moving a file to satisfy a checker is the checker
 * deciding the layout.
 */
const TOUCH_ELSEWHERE = new Set([
  "components/meetings/JoinCodeForm.tsx", // rendered by app/j/[code]/page.tsx
]);

const floorFor = (file) =>
  /^components\/(room|prejoin)\//.test(file) || TOUCH_ELSEWHERE.has(file) ? 44 : 24;

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".tsx")) files.push(path);
  }
})("components");
(function walkApp(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkApp(path);
    else if (entry.name.endsWith(".tsx")) files.push(path);
  }
})("app");

t(files.length > 20, "component files were found to scan", String(files.length));

const undersized = [];
for (const file of files) {
  const raw = readFileSync(file, "utf8");
  // A size named in a comment is not a size on a control.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const floor = floorFor(file);

  // `<Button …>` — resolved through the variant table.
  for (const m of source.matchAll(/<Button\b([^>]*)>/g)) {
    const attrs = m[1];
    // An explicit height class on the element wins over the variant.
    const explicit = attrs.match(/\b(?:size|h|min-h)-[\d.]+\b/);
    const px = explicit
      ? heightOf(explicit[0].replace(/^min-/, ""))
      : variants[(attrs.match(/size="([a-z-]+)"/) ?? [, "default"])[1]]?.px;
    if (px !== null && px !== undefined && px < floor) {
      undersized.push(`${file}: <Button> ${px}px < ${floor}px`);
    }
  }

  // Raw `<button>` — sized by its own classes or not at all.
  for (const m of source.matchAll(/<button\b([^>]*)>/gs)) {
    const cls = m[1].match(/\b(?:size|h|min-h)-[\d.]+\b/);
    if (!cls) continue; // sized by content; the browser check is what sees it
    const px = heightOf(cls[0].replace(/^min-/, ""));
    if (px !== null && px < floor) {
      undersized.push(`${file}: <button> ${cls[0]} = ${px}px < ${floor}px`);
    }
  }
}

t(undersized.length === 0,
  "every sized control clears the floor for its surface",
  "\n    " + undersized.join("\n    "));

console.log(`\n${count - failed}/${count} touch-target checks passed.`);
if (failed) process.exit(1);
