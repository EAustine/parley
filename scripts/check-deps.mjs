#!/usr/bin/env node
/**
 * Nothing in the tree is unreachable from the app — neither a package nor a
 * module.
 *
 * Rule 9: "`check:deps` walks the import graph from `app/` and **fails** on
 * anything unreachable; it does not warn. An exception list is how dead code
 * accumulates, and a warning printed on every run becomes furniture within a
 * week."
 *
 * Three dependencies were specified in these documents and never used —
 * `react-day-picker`, `react-hook-form`, `@hookform/resolvers`. An earlier
 * version of this file listed the last two as exceptions "awaiting a decision"
 * and printed them loudly on every run. Rule 9 is the decision, and it is also
 * a verdict on that design: the loud printout was furniture.
 *
 * Two halves, because packages were only half the problem:
 *
 *   1. Every declared dependency is reachable from `app/`.
 *   2. Every module under `components/` and `lib/` is reachable from `app/`.
 *
 * The second is what actually catches this class. `react-hook-form` was
 * reachable — through `components/ui/form.tsx`, which nothing rendered. A
 * package check alone calls that healthy. Rule 9: "Delete the code that makes
 * an unused package reachable too."
 *
 * Run with: npm run check:deps
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

/**
 * Matched as separate shapes rather than one alternation. The first version of
 * this used `[\s\S]*?` between `import` and `from`, matched across statement
 * boundaries, and reported string literals from unrelated code as package
 * names — while missing `import "server-only"` and CSS `@import` entirely.
 */
const PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
  /\brequire\(\s*["']([^"']+)["']/g,
  /^\s*import\s+["']([^"']+)["']/gm,
  /^\s*@import\s+["']([^"']+)["']/gm,
];

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".css"];

/**
 * Required, and never named in an import.
 *
 * One entry, and it is checked rather than trusted: `react-dom` is what Next
 * renders with, and no application module imports it directly.
 *
 * The previous version of this list also held `react`, `next`, and `shadcn` —
 * all three of which the walk finds on its own (`react` via the JSX runtime,
 * `shadcn` via `@import "shadcn/tailwind.css"` in `globals.css`). Three of four
 * entries were exempting packages that needed no exemption, which is rule 9's
 * argument against exception lists happening inside the check that enforces it.
 */
const NOT_IMPORTED = new Set(["react-dom"]);

/**
 * Everything the framework can enter through.
 *
 * `app/` is entered by routing. **`middleware.ts` and `next.config.ts` sit at
 * the root and are entry points too** — a gap the dead-module sweep below
 * exposed, by reporting `lib/supabase/middleware.ts` as unreachable when it is
 * imported by the root `middleware.ts`. Nothing failed because of it today:
 * `@supabase/ssr` is reached from `app/` as well. Had it moved behind auth
 * middleware alone, this check would have called a live dependency dead.
 */
const ENTRY_FILES = ["middleware.ts", "next.config.ts"];
const ENTRY_DIRS = ["app"];
/** Reported by `--dead`. Not `app/`, whose files are entry points by routing. */
const SWEPT_DIRS = ["components", "lib"];

const reached = new Set();
const packages = new Set();

function resolveLocal(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = resolve(spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const suffix of ["", ...EXTENSIONS, ...EXTENSIONS.map((e) => "/index" + e)]) {
    const path = base + suffix;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

function walk(file) {
  if (reached.has(file)) return;
  reached.add(file);

  let source;
  try { source = readFileSync(file, "utf8"); } catch { return; }
  // A package named in prose is not an import. `ScheduleForm.tsx` and
  // `JoinCodeForm.tsx` both explain in a comment that they do not use
  // react-hook-form, which a naive grep reads as two more importers.
  source = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  for (const pattern of PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const spec = match[1];
      if (!spec) continue;
      const local = resolveLocal(spec, file);
      if (local) { walk(local); continue; }
      if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("node:")) continue;
      const parts = spec.split("/");
      packages.add(spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
    }
  }
}

const collect = (dir, into) => {
  if (!existsSync(dir)) return into;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path, into);
    else if (EXTENSIONS.some((e) => entry.name.endsWith(e))) into.push(path);
  }
  return into;
};

const entries = [
  ...ENTRY_DIRS.flatMap((d) => collect(d, [])),
  ...ENTRY_FILES.filter((f) => existsSync(f)),
];
for (const entry of entries) walk(entry);

let failed = 0;
const check = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${label}${pass ? "" : `  — ${detail}`}`);
};

console.log(
  `Reachability from ${ENTRY_DIRS.map((d) => d + "/").concat(ENTRY_FILES).join(", ")}  ` +
    `(${entries.length} entry files, ${reached.size} modules)\n`,
);

// A scanner that resolves nothing would report every dependency as unused and
// look like a catastrophe, or — with the logic inverted — like a clean bill.
check(
  reached.size > entries.length,
  "the scanner actually follows imports",
  `${reached.size} modules from ${entries.length} entries — it is not resolving`,
);
check(
  packages.has("next") && packages.has("react"),
  "and reaches the framework, so bare specifiers are being read",
  [...packages].join(", "),
);

const declared = Object.keys(
  JSON.parse(readFileSync("package.json", "utf8")).dependencies,
);

const unreachable = declared.filter((d) => !packages.has(d) && !NOT_IMPORTED.has(d));
check(
  unreachable.length === 0,
  "every dependency is reachable from the app",
  `unreachable: ${unreachable.join(", ")}`,
);

// A stale exemption is the failure mode a one-entry list still has: the package
// goes, the entry stays, and the next unused package to land on that name is
// silently forgiven.
for (const name of NOT_IMPORTED) {
  check(
    declared.includes(name),
    `${name} is still declared, so its exemption is still about something`,
    "it has been removed — delete it from NOT_IMPORTED",
  );
}

/**
 * Dead local modules, on request only — `npm run check:deps -- --dead`.
 *
 * Not a check, and deliberately not printed on every run. Rule 9 forbids the
 * warning, and a failure here would be wrong: it reports ten shadcn components
 * that `BUILD-PLAN`'s scaffold installs on purpose and Phases 8-10 have not
 * reached yet. That is a phase not having happened, not a plan reality
 * overtook.
 *
 * It earns its place because the package check above cannot see this class
 * directly — though it does catch the case rule 9 names. `form.tsx` was never
 * reachable from `app/`, so `react-hook-form` never entered `packages` and was
 * reported unreachable. A dead module only matters to rule 9 when it is the
 * sole thing keeping a package alive, and that is already a failure above.
 */
if (process.argv.includes("--dead")) {
  const dead = SWEPT_DIRS.flatMap((d) => collect(d, []))
    .map((f) => relative(process.cwd(), resolve(f)))
    .filter((f) => !reached.has(resolve(f)));
  console.log(
    dead.length
      ? `\n${dead.length} modules under ${SWEPT_DIRS.map((d) => d + "/").join(", ")} are unreachable from the app:\n` +
          dead.map((f) => `    ${f}`).join("\n")
      : `\nNo dead modules under ${SWEPT_DIRS.map((d) => d + "/").join(", ")}.`,
  );
}

const total = 3 + NOT_IMPORTED.size;
console.log(`\n${total - failed}/${total} dependency checks passed.`);
if (failed) process.exit(1);
