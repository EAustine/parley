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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** `PRD.md` §10. First Load JS totals, gzipped, inclusive of the baseline. */
const BUDGETS = {
  "/": 190,
  "/j/[code]": 230,
  "/room/[code]": 250,
  "/dashboard": 280,
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
// Grepping the chunks for "livekit" is the obvious test and it is wrong: it
// matches `/api/livekit/token`, which is our own endpoint path, and the value
// of NEXT_PUBLIC_LIVEKIT_URL, which Next correctly inlines. Both belong there.
// These identifiers only exist inside the library.

const LIVEKIT_MARKERS = [
  "livekit-client",
  "RoomEvent",
  "createLocalTracks",
  "SignalClient",
  "RTCEngine",
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

const offenders = chunks.filter((path) => {
  const source = readFileSync(path, "utf8");
  return LIVEKIT_MARKERS.some((marker) => source.includes(marker));
});

console.log();
record(
  offenders.length === 0,
  "livekit-client absent from every client chunk (rule 8)",
  offenders.length
    ? offenders.join(", ")
    : `${chunks.length} chunks scanned for ${LIVEKIT_MARKERS.length} library markers`,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} bundle checks passed.`);
if (failed.length) process.exit(1);
