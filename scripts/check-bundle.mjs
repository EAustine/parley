#!/usr/bin/env node
/**
 * Bundle budgets, and rule 8.
 *
 * Runs the production build and reads the route table out of its output.
 *
 * The first version of this recomputed the sizes itself, gzipping the chunks
 * named in `app-build-manifest.json`. It did not reconcile: 142 kB against
 * Next's 160 for the shared baseline with JS alone, 191 against 181 for
 * `/j/[code]` once CSS was included. Next counts something else again —
 * polyfills, a different compression level, or entries not in that manifest.
 *
 * A second measure that disagrees with the documented one is worse than no
 * measure, because §10 states the budgets in Next's units and a route could
 * pass here while the build says otherwise. So this parses the authority
 * rather than competing with it.
 *
 * Run with: npm run check:bundle
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** `PRD.md` §10. First Load JS totals, gzipped, inclusive of the baseline. */
const BUDGETS = {
  "/": 190,
  /**
   * Set after the refactor, not before it — §10: "Do not set the number at 249.
   * … Refactor, measure, then set the budget with headroom. Setting it first is
   * how 180 kB landed on the dashboard and 200 kB on `/j/[code]`, both of which
   * were guesses that later had to move."
   *
   * Moving `signInWithOtp` and `signInWithOAuth` into server actions took the
   * route from **249 kB to 166 kB** — `supabase-js` is no longer in it. 190
   * because it is now the same shape as `/`: a public cold-load route that is a
   * form and nothing else, so it takes the same budget rather than a number
   * invented for it.
   */
  "/sign-in": 190,
  "/j/[code]": 230,
  "/room/[code]": 250,
  "/dashboard": 280,
  // Phase 6's two routes, measured plus headroom on the same reasoning §10
  // gives the dashboard: behind auth, revisited by the same people, amortised
  // across sessions. §10 now carries both rows at 290.
  "/schedule": 290,
  "/schedule/[code]": 290,
};
const SHARED_BUDGET = 180;

console.log("Building…\n");
let output;
try {
  // `npm run build`, not a bare `next build`. The project's build script
  // passes --turbopack, and the two bundlers chunk differently — running the
  // wrong one produced a shared baseline of 103 kB against Turbopack's 160,
  // which would have been a set of budgets describing a build we do not ship.
  output = execFileSync("npm", ["run", "build"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (error) {
  console.error("Build failed:\n" + (error.stdout ?? "") + (error.stderr ?? ""));
  process.exit(1);
}

// Strip ANSI so the table parses whether or not the output is a TTY.
const plain = output.replace(/\[[0-9;]*m/g, "");

/** e.g. "├ ƒ /j/[code]   35.4 kB   181 kB" */
const ROUTE_LINE = /^[┌├└]\s+[○ƒ●]\s+(\S+)\s+[\d.]+\s*[kMB]+\s+([\d.]+)\s*kB\s*$/;
const SHARED_LINE = /First Load JS shared by all\s+([\d.]+)\s*kB/;

const measured = new Map();
for (const line of plain.split("\n")) {
  const match = line.trim().match(ROUTE_LINE);
  if (match) measured.set(match[1], Number(match[2]));
}

const sharedMatch = plain.match(SHARED_LINE);
if (!sharedMatch || measured.size === 0) {
  console.error(
    "Could not read the route table from the build output.\n" +
      "Next's format may have changed — check it before trusting this script again.",
  );
  process.exit(1);
}
const shared = Number(sharedMatch[1]);

const results = [];
const record = (pass, name, detail) => {
  results.push({ pass, name });
  console.log(`${pass ? "✔" : "✘"} ${name}${detail ? `  — ${detail}` : ""}`);
};

/**
 * `--snapshot`: emit the measured figures as markdown, and stop.
 *
 * `PRD.md` §10 now says budgets only: "Earlier drafts carried the current size
 * of each route beside its budget, and every commit that changed a bundle made
 * this table wrong — four figures went stale in a single batch of Track F work.
 * `check:bundle` knows the real numbers and enforces the budgets; a
 * `--snapshot` flag can emit them when someone wants a reading."
 *
 * Same split as `check:contrast --snapshot`: a budget is a decision and belongs
 * in a document, a measurement is a fact about the current commit and belongs
 * in the tool. This is how you take the reading.
 */
if (process.argv.includes("--snapshot")) {
  const at = new Date().toISOString().slice(0, 10);
  console.log(`Measured on ${at}. First Load JS, gzipped — Next's own figures.`);
  console.log("Not for pasting into PRD §10: budgets live there, measurements live here.\n");
  console.log("| Route | Measured | Budget |");
  console.log("|---|---|---|");
  console.log(`| Shared baseline | ${shared} kB | ≤ ${SHARED_BUDGET} kB |`);
  for (const [route, budget] of Object.entries(BUDGETS)) {
    const value = measured.get(route);
    console.log(
      `| \`${route}\` | ${value === undefined ? "not built" : `${value} kB`} | ≤ ${budget} kB |`,
    );
  }
  for (const [route, value] of [...measured].filter(
    ([r]) => !(r in BUDGETS) && !r.startsWith("/api"),
  )) {
    console.log(`| \`${route}\` | ${value} kB | — |`);
  }
  console.log();
  process.exit(0);
}

console.log("First Load JS, gzipped — Next's own figures\n");
record(shared <= SHARED_BUDGET, "shared baseline", `${shared} kB / ${SHARED_BUDGET} kB`);

for (const [route, budget] of Object.entries(BUDGETS)) {
  const value = measured.get(route);
  if (value === undefined) {
    console.log(`  ${route.padEnd(16)} not built yet`);
    continue;
  }
  record(value <= budget, route, `${value} kB / ${budget} kB`);
}

const unbudgeted = [...measured].filter(([r]) => !(r in BUDGETS) && !r.startsWith("/api"));
if (unbudgeted.length) {
  console.log();
  for (const [route, value] of unbudgeted) {
    console.log(`  ${route.padEnd(18)} ${String(value).padStart(4)} kB   (no budget set)`);
  }
}

// --- rule 8 -----------------------------------------------------------------
//
// The rule is that `livekit-client` "is dynamically imported on the room route
// only" and "must not appear in any other bundle". Until Phase 4 that could be
// checked by grepping every chunk for library markers, because the right
// answer was zero. It no longer is: the room loads the SDK, so one chunk must
// contain it and the test has to say *which*.
//
// Grepping for "livekit" was already wrong for a different reason — it matches
// `/api/livekit/token`, our own endpoint path, and the inlined value of
// NEXT_PUBLIC_LIVEKIT_URL. Both belong in the bundle. These identifiers only
// exist inside the library.
//
// So: read Next's own route→chunk manifest, and require that no chunk any
// route loads *statically* contains a marker. A dynamically imported chunk is
// not listed against any route, which is exactly the property being asserted —
// it is fetched when the import runs, not with the page.

const LIVEKIT_MARKERS = [
  "livekit-client",
  "SignalClient",
  "RTCEngine",
  "createLocalTracks",
];

const chunkDir = join(".next", "static", "chunks");
const chunks = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith(".js")) chunks.push(path);
  }
};
walk(chunkDir);

const carriesMarker = (path) => {
  const source = readFileSync(path, "utf8");
  return LIVEKIT_MARKERS.some((marker) => source.includes(marker));
};
const marked = new Set(chunks.filter(carriesMarker));

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(".next", "app-build-manifest.json"), "utf8"));
} catch {
  console.error("Could not read .next/app-build-manifest.json — rule 8 is unverifiable.");
  process.exit(1);
}

// Every chunk any route pulls in with its first load, mapped back to a route
// so a violation can be named rather than merely counted.
const staticChunks = new Map();
let unresolved = 0;
for (const [route, files] of Object.entries(manifest.pages ?? {})) {
  for (const file of files) {
    if (!file.endsWith(".js")) continue;
    const path = join(".next", file);
    if (!existsSync(path)) { unresolved++; continue; }
    if (!staticChunks.has(path)) staticChunks.set(path, []);
    staticChunks.get(path).push(route);
  }
}

console.log();

// A manifest whose paths do not resolve would make every check below vacuously
// true. That is the failure mode of a test that guards a rule nobody can see
// breaking, so it is checked before the rule itself.
record(
  staticChunks.size > 0 && unresolved === 0,
  "the route manifest resolves to real chunks",
  `${staticChunks.size} chunks mapped, ${unresolved} unresolved`,
);

const offenders = [...marked].filter((path) => staticChunks.has(path));
record(
  offenders.length === 0,
  "livekit-client is in no route's first load (rule 8)",
  offenders
    .map((path) => `${path} ← ${[...new Set(staticChunks.get(path))].join(", ")}`)
    .join("; "),
);

// The mirror image, and the one that catches a dynamic import quietly reduced
// to a static one — or deleted. Zero marked chunks would pass the check above
// while meaning the room cannot connect at all.
record(
  marked.size === 1,
  "and lives in exactly one chunk, loaded on demand",
  marked.size === 0
    ? "no chunk contains it — is the room's dynamic import still there?"
    : `${marked.size} chunks: ${[...marked].join(", ")}`,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} bundle checks passed.`);
if (failed.length) process.exit(1);
