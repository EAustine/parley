#!/usr/bin/env node
/**
 * Day and month grouping — BUILD-PLAN v1.3 D1.
 *
 * Tests the real module rather than a copy, the same way `check:partition` and
 * `check:codes` do: a test that reimplements the rule proves only that two
 * copies agree.
 *
 * The interesting cases are all boundaries, and every one of them is a boundary
 * *in a timezone* — which is the whole reason the grouping takes a zone rather
 * than reading the machine's. A meeting at 23:30 in Accra is the next day in
 * Berlin, and if the browser and the header disagree about which day that is,
 * the header is wrong in the direction PRD §3.9 calls a missed meeting.
 *
 * Run with: npm run check:groups
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/*
 * Inside the repo, not in `/tmp` — unlike `check:partition`, whose module has
 * no imports at all. This one pulls `date-fns-tz` through `format.ts`, and
 * Node resolves a bare specifier by walking *up* from the importing file. From
 * a system temp directory that walk never reaches this project's
 * `node_modules`, and the failure reads as a missing package rather than as a
 * misplaced build.
 */
const out = mkdtempSync(join(process.cwd(), "node_modules", ".parley-groups-"));
try {
  execFileSync(
    "npx",
    ["tsc", "lib/meetings/group.ts", "lib/meetings/format.ts",
     "--outDir", out, "--module", "esnext", "--target", "es2022",
     "--moduleResolution", "bundler", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile lib/meetings/group.ts:\n" + e.stdout?.toString());
  process.exit(1);
}
// tsc emits `from "./format"` with no extension, which Node's ESM loader will
// not resolve. Point it at the file that is actually there.
for (const name of ["group", "format"]) {
  writeFileSync(
    join(out, `${name}.mjs`),
    readFileSync(join(out, `${name}.js`), "utf8").replace(
      /["']\.\/format["']/g,
      '"./format.mjs"',
    ),
  );
}
const { groupMeetings } = await import(pathToFileURL(join(out, "group.mjs")).href);
rmSync(out, { recursive: true, force: true });

const results = [];
const check = (pass, name, detail = "") => {
  results.push({ pass, name });
  console.log(`${pass ? "✔" : "✘"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const when = (m) => m.at;
const m = (id, at) => ({ id, at });
const keys = (groups) => groups.map((g) => g.key).join(" | ");
const sizes = (groups) => groups.map((g) => g.meetings.length).join(",");

// --- day grouping ---------------------------------------------------------

{
  const groups = groupMeetings(
    [
      m("a", "2026-09-04T10:34:00Z"),
      m("b", "2026-09-04T16:00:00Z"),
      m("c", "2026-09-15T14:30:00Z"),
    ],
    when,
    "day",
    "Africa/Accra",
  );
  check(groups.length === 2, "two days make two groups", keys(groups));
  check(sizes(groups) === "2,1", "and the first holds both of its meetings", sizes(groups));
}

check(groupMeetings([], when, "day", "UTC").length === 0, "an empty list makes no groups");

{
  const groups = groupMeetings([m("a", "2026-09-04T10:34:00Z")], when, "day", "UTC");
  check(
    groups.length === 1 && groups[0].meetings.length === 1,
    "a single meeting still gets its header",
    keys(groups),
  );
}

// --- the zone is the boundary, not the machine ---------------------------

{
  const late = [m("a", "2026-09-04T23:30:00Z")];
  const accra = groupMeetings(late, when, "day", "Africa/Accra");
  const berlin = groupMeetings(late, when, "day", "Europe/Berlin");
  check(
    accra[0].key === "2026-09-04" && berlin[0].key === "2026-09-05",
    "the same instant lands on different days in different zones",
    `Accra ${accra[0].key}, Berlin ${berlin[0].key}`,
  );
}

{
  // 23:30 on the 30th in Accra is 01:30 on the 1st in Berlin — a *month*
  // boundary crossed by a zone, which is the case a naive UTC month would get
  // wrong once a year and nobody would notice until the header said September
  // over an October meeting.
  const rows = [m("a", "2026-09-30T23:30:00Z")];
  const accra = groupMeetings(rows, when, "month", "Africa/Accra");
  const berlin = groupMeetings(rows, when, "month", "Europe/Berlin");
  check(
    accra[0].key === "2026-09" && berlin[0].key === "2026-10",
    "and on different months when the day was the last of one",
    `Accra ${accra[0].key}, Berlin ${berlin[0].key}`,
  );
}

// --- month grouping, and the order it inherits ---------------------------

{
  const groups = groupMeetings(
    [
      m("a", "2026-09-02T10:00:00Z"),
      m("b", "2026-08-30T10:00:00Z"),
      m("c", "2026-08-26T10:00:00Z"),
      m("d", "2026-07-26T10:00:00Z"),
    ],
    when,
    "month",
    "UTC",
  );
  check(
    keys(groups) === "2026-09 | 2026-08 | 2026-07",
    "month groups descend when the rows do — the order is the caller's",
    keys(groups),
  );
  check(sizes(groups) === "1,2,1", "and August holds both of its rows", sizes(groups));
}

{
  // The same rows the day grouping would have split into four headers over
  // four rows — which is the argument for grouping Past by month at all.
  const spread = [
    m("a", "2026-09-02T10:00:00Z"),
    m("b", "2026-09-01T10:00:00Z"),
    m("c", "2026-08-30T10:00:00Z"),
    m("d", "2026-08-26T10:00:00Z"),
  ];
  const byDay = groupMeetings(spread, when, "day", "UTC");
  const byMonth = groupMeetings(spread, when, "month", "UTC");
  check(
    byDay.length === 4 && byMonth.length === 2,
    "four rows on four days: four day headers, two month headers",
    `${byDay.length} vs ${byMonth.length}`,
  );
}

// --- the walk, not a sort ------------------------------------------------

{
  // An out-of-order list is rendered as it is, not silently regrouped. A
  // grouping that reordered its input would hide a partition bug rather than
  // show it.
  const groups = groupMeetings(
    [
      m("a", "2026-09-04T10:00:00Z"),
      m("b", "2026-09-05T10:00:00Z"),
      m("c", "2026-09-04T18:00:00Z"),
    ],
    when,
    "day",
    "UTC",
  );
  check(
    groups.length === 3,
    "a key that reappears out of order starts a second group",
    keys(groups),
  );
}

{
  const rows = [
    m("a", "2026-09-04T10:00:00Z"),
    m("b", "2026-09-04T18:00:00Z"),
    m("c", "2026-09-15T10:00:00Z"),
  ];
  const flat = groupMeetings(rows, when, "day", "UTC").flatMap((g) => g.meetings);
  check(
    flat.map((x) => x.id).join("") === "abc",
    "every meeting comes out exactly once, in the order it went in",
    flat.map((x) => x.id).join(""),
  );
}

// --- the headers people actually read ------------------------------------

{
  const heading = (iso, by, zone = "UTC") =>
    groupMeetings([m("a", iso)], when, by, zone)[0].heading;
  check(
    /^\d{4}$|20\d\d$/.test(heading("2026-07-26T10:00:00Z", "month")),
    "a month header carries its year",
    heading("2026-07-26T10:00:00Z", "month"),
  );
  check(
    heading("2026-09-15T10:00:00Z", "day").includes("September"),
    "a day header spells the month out",
    heading("2026-09-15T10:00:00Z", "day"),
  );
  check(
    !heading("2026-09-15T10:00:00Z", "day").includes("Yesterday"),
    "and never says Yesterday — Past does not use day headers",
    heading("2026-09-15T10:00:00Z", "day"),
  );
}

// --- one clock, passed in -------------------------------------------------

{
  /*
   * v1.3 D5. "Today" is a comparison against a *now*, and the header used to
   * read the browser's clock while `partitionMeetings` read the server's. Two
   * clocks on one screen is how a row lands in Upcoming under a header saying
   * it already happened.
   *
   * Pinned by moving the clock rather than the meeting: the same instant is
   * "Today" from one `now` and "Tomorrow" from a `now` a day earlier. A header
   * still reading `Date.now()` would answer the same both times, whichever
   * answer that happened to be.
   */
  const meeting = "2026-09-15T12:00:00Z";
  const heading = (now) =>
    groupMeetings([m("a", meeting)], when, "day", "UTC", Date.parse(now))[0].heading;

  check(
    heading("2026-09-15T09:00:00Z").startsWith("Today"),
    "a day header says Today against a clock on that day",
    heading("2026-09-15T09:00:00Z"),
  );
  check(
    heading("2026-09-14T09:00:00Z").startsWith("Tomorrow"),
    "and Tomorrow against a clock the day before — the caller's now, not the machine's",
    heading("2026-09-14T09:00:00Z"),
  );
  check(
    !/Today|Tomorrow/.test(heading("2026-09-01T09:00:00Z")),
    "and neither from two weeks out",
    heading("2026-09-01T09:00:00Z"),
  );
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} grouping checks passed.`);
if (failed.length) process.exit(1);
