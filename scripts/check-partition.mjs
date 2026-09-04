#!/usr/bin/env node
/**
 * The dashboard partition — BUILD-PLAN v1.3 A1.
 *
 * Tests the real module rather than a copy: `lib/meetings/partition.ts` is
 * compiled and imported, for the reason `check:codes` gives — a test that
 * reimplements the rule proves only that two copies agree.
 *
 * **This is the check that did not exist.** The old predicate lived inline in
 * `app/(app)/dashboard/page.tsx` and the only thing asserting anything about it
 * was `check:meetings`, which checked that the string "Upcoming" appeared in
 * the HTML. That passes against a section header above a list containing every
 * meeting ever created, which is exactly what shipped: 41 rows, an instant
 * meeting from Thursday and a live one from Wednesday among them.
 *
 * Every case below is named for the field report or the rule it comes from, so
 * a failure says which decision broke rather than which line did.
 *
 * Run with: npm run check:partition
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = mkdtempSync(join(tmpdir(), "parley-partition-"));
try {
  execFileSync(
    "npx",
    ["tsc", "lib/meetings/partition.ts", "--outDir", out, "--module", "esnext",
     "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error(
    "Could not compile lib/meetings/partition.ts:\n" + e.stdout?.toString(),
  );
  process.exit(1);
}
renameSync(join(out, "partition.js"), join(out, "partition.mjs"));
const { bucketOf, partitionMeetings, INSTANT_WINDOW_MS } = await import(
  pathToFileURL(join(out, "partition.mjs")).href
);
rmSync(out, { recursive: true, force: true });

const results = [];
const check = (pass, name, detail = "") => {
  results.push({ pass, name });
  console.log(`${pass ? "✔" : "✘"} ${name}${detail ? `  — ${detail}` : ""}`);
};

/**
 * A fixed clock, and every fixture expressed as an offset from it.
 *
 * `CLAUDE.md`: "A test owns its fixtures." A partition is a function of *now*,
 * so a test that reads the wall clock owns nothing — it would pass in the
 * morning and fail after lunch, and the 12-hour window would be untestable
 * without waiting twelve hours.
 */
const NOW = Date.parse("2026-09-04T10:34:00Z");
const at = (hours) => new Date(NOW + hours * 3_600_000).toISOString();

/** A row with every column the partition reads, overridden per case. */
const meeting = (over) => ({
  status: "scheduled",
  scheduled_start: null,
  scheduled_end: null,
  created_at: at(-1),
  started_at: null,
  ...over,
});

const cases = [
  // --- the two field issues, which are one bug -----------------------------
  {
    name: "field issue 7: an instant meeting from last night is past, not upcoming",
    row: { scheduled_start: null, created_at: at(-12.2), started_at: at(-12.1) },
    want: "past",
  },
  {
    name: "field issue 8: a stale `live` from Wednesday is past, not live",
    row: { status: "live", scheduled_start: at(-38), scheduled_end: at(-37), started_at: at(-38) },
    want: "past",
  },

  // --- the belt ------------------------------------------------------------
  {
    name: "the belt beats a stale `live` — end passed, webhook silent",
    row: { status: "live", scheduled_start: at(-3), scheduled_end: at(-2), started_at: at(-3) },
    want: "past",
  },
  {
    name: "and does not fire before the end",
    row: { status: "live", scheduled_start: at(-0.25), scheduled_end: at(0.25), started_at: at(-0.25) },
    want: "live",
  },

  // --- the case A1's table has no home for --------------------------------
  {
    name: "in its own slot but nobody has joined: upcoming, not live",
    row: { scheduled_start: at(-0.25), scheduled_end: at(0.25) },
    want: "upcoming",
  },
  {
    name: "and it leaves upcoming when its end passes, not its start",
    row: { scheduled_start: at(-2), scheduled_end: at(-1) },
    want: "past",
  },
  {
    name: "a future booking is upcoming",
    row: { scheduled_start: at(5), scheduled_end: at(6) },
    want: "upcoming",
  },

  // --- instant meetings, §3.2 ---------------------------------------------
  {
    name: "an instant meeting is live from creation",
    row: { scheduled_start: null, created_at: at(-0.1) },
    want: "live",
  },
  {
    name: "never joined, 11h old: still live",
    row: { scheduled_start: null, created_at: at(-11) },
    want: "live",
  },
  {
    name: "never joined, 13h old: expired, so past",
    row: { scheduled_start: null, created_at: at(-13) },
    want: "past",
  },
  {
    name: "joined 13h ago and abandoned: past, the belt instant meetings lacked",
    row: { status: "live", scheduled_start: null, created_at: at(-14), started_at: at(-13) },
    want: "past",
  },
  {
    name: "joined 1h ago, created 13h ago: live — the window runs from started_at",
    row: { status: "live", scheduled_start: null, created_at: at(-13), started_at: at(-1) },
    want: "live",
  },

  // --- explicit status always wins ----------------------------------------
  {
    name: "ended is past however recent",
    row: { status: "ended", scheduled_start: at(1), scheduled_end: at(2) },
    want: "past",
  },
  {
    name: "cancelled is past, and does not linger in upcoming",
    row: { status: "cancelled", scheduled_start: at(5), scheduled_end: at(6) },
    want: "past",
  },
  {
    name: "a cancelled instant meeting is past, not live",
    row: { status: "cancelled", scheduled_start: null, created_at: at(-0.1) },
    want: "past",
  },
];

for (const c of cases) {
  const got = bucketOf(meeting(c.row), NOW);
  check(got === c.want, c.name, got === c.want ? "" : `got ${got}, wanted ${c.want}`);
}

// --- the boundary itself ---------------------------------------------------
//
// Both sides of 12h, to the millisecond. A window tested only at 11h and 13h
// would pass against `>` and `>=` alike, and against 11.5h or 24h.
{
  const justInside = meeting({
    scheduled_start: null,
    created_at: new Date(NOW - INSTANT_WINDOW_MS + 1).toISOString(),
  });
  const justOutside = meeting({
    scheduled_start: null,
    created_at: new Date(NOW - INSTANT_WINDOW_MS).toISOString(),
  });
  check(
    bucketOf(justInside, NOW) === "live" && bucketOf(justOutside, NOW) === "past",
    "the 12h window is exact at both edges",
    `${INSTANT_WINDOW_MS}ms`,
  );
}

// --- sorting, which is a different claim from bucketing --------------------
{
  const rows = [
    { id: "soon", scheduled_start: at(2), scheduled_end: at(3) },
    { id: "sooner", scheduled_start: at(1), scheduled_end: at(2) },
    { id: "latest-past", status: "ended", scheduled_start: at(-1), scheduled_end: at(-0.5) },
    { id: "older-past", status: "ended", scheduled_start: at(-9), scheduled_end: at(-8) },
  ].map(meeting);

  const { upcoming, past } = partitionMeetings(rows, NOW);
  check(
    upcoming.map((m) => m.id).join(",") === "sooner,soon",
    "upcoming reads soonest first",
    upcoming.map((m) => m.id).join(","),
  );
  check(
    past.map((m) => m.id).join(",") === "latest-past,older-past",
    "past reads most recent first",
    past.map((m) => m.id).join(","),
  );
}

/**
 * The vacuity guard.
 *
 * Every case above asserts a bucket, and all of them would still pass if the
 * three lists were the same array read three times. This asserts the split is
 * a partition: every meeting lands in exactly one section, and none is lost.
 */
{
  const rows = cases.map((c, i) => meeting({ ...c.row, id: String(i) }));
  const { live, upcoming, past } = partitionMeetings(rows, NOW);
  const total = live.length + upcoming.length + past.length;
  const ids = new Set([...live, ...upcoming, ...past].map((m) => m.id));
  check(
    total === rows.length && ids.size === rows.length,
    "every meeting lands in exactly one section",
    `${rows.length} in, ${total} out, ${ids.size} distinct`,
  );
  check(
    live.length > 0 && upcoming.length > 0 && past.length > 0,
    "and all three sections are exercised",
    `live ${live.length}, upcoming ${upcoming.length}, past ${past.length}`,
  );
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} partition checks passed.`);
if (failed.length) process.exit(1);
