#!/usr/bin/env node
/**
 * The grid, against §3.4's table.
 *
 * §3.4 says "write these before writing layout code" and then gives the
 * breakpoints as a table. This is that table, transcribed a second time and
 * independently — row by row, in the PRD's own words — so that agreeing with
 * `lib/room/layout.ts` means something. A layout bug is otherwise only visible
 * with seven real people in a room, which is the most expensive place to find
 * one.
 *
 * BUILD-PLAN Phase 4: "Every grid breakpoint is correct — test by opening real
 * tabs, not by faking participant counts." That instruction is about the *room*,
 * and it stands. This checks the arithmetic underneath it, which is the part
 * that does not need sixteen browsers.
 *
 * Run with: npm run check:room
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "parley-room-"));
try {
  execFileSync(
    "npx",
    ["tsc", "lib/room/layout.ts", "lib/room/typing.ts", "--outDir", out, "--module", "commonjs",
     "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile lib/room/layout.ts:\n" + e.stdout?.toString());
  process.exit(1);
}
writeFileSync(join(out, "package.json"), '{"type":"commonjs"}');
const require = createRequire(join(out, "index.cjs"));
const { gridLayout, visibleOrder } = require(join(out, "layout.js"));
const { isTyping } = require(join(out, "typing.js"));
rmSync(out, { recursive: true, force: true });

let failed = 0;
const check = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${label}${pass ? "" : `  — ${detail}`}`);
};

// ---------------------------------------------------------------------------
// §3.4, the layout table, row by row
// ---------------------------------------------------------------------------
console.log("Desktop\n");

// [participants, columns, rows, note from the PRD]
const desktop = [
  [1,  1, 1, "Single tile, full area, 16:9 letterboxed"],
  [2,  2, 1, "Side by side"],
  [3,  2, 2, "2 × 2"],
  [4,  2, 2, "2 × 2"],
  [5,  3, 2, "3 × 2"],
  [6,  3, 2, "3 × 2"],
  [7,  3, 3, "3 × 3"],
  [8,  3, 3, "3 × 3"],
  [9,  3, 3, "3 × 3"],
  [10, 4, 4, "4 × 4"],
  [16, 4, 4, "4 × 4"],
  [17, 4, 4, "4 × 4, overflow as +N"],
  [40, 4, 4, "4 × 4, overflow as +N"],
];

for (const [people, columns, rows, note] of desktop) {
  const l = gridLayout(people, "desktop");
  check(l.columns === columns && l.rows === rows,
        `${String(people).padStart(2)} → ${l.columns}×${l.rows}   ${note}`,
        `expected ${columns}×${rows}`);
}

check(gridLayout(1, "desktop").letterbox, "one participant letterboxes to 16:9");
check(!gridLayout(2, "desktop").letterbox,
      "two do not — §3.4 forbids letterboxing tiles inside a grid");
check(gridLayout(9, "desktop").pages === 1, "desktop never pages");
check(gridLayout(40, "desktop").pages === 1, "desktop never pages, even at 40");

// The +N cell takes a place, so fifteen faces fit in a sixteen-cell grid.
for (const [people, expected] of [[16, 0], [17, 2], [20, 5], [100, 85]]) {
  const l = gridLayout(people, "desktop");
  check(l.overflow === expected,
        `${String(people).padStart(3)} participants → overflow +${l.overflow}`,
        `expected +${expected}`);
}
{
  const l = gridLayout(20, "desktop");
  check(l.tiles + 1 === l.capacity, "the +N cell occupies one of the sixteen",
        `${l.tiles} tiles in ${l.capacity} cells`);
  check(l.tiles + l.overflow === 20, "every participant is either shown or counted",
        `${l.tiles} + ${l.overflow}`);
}

console.log("\nMobile portrait\n");

const mobile = [
  [1,  1, 1, 1, "Full area"],
  [2,  1, 2, 1, "Stacked, equal"],
  [3,  2, 2, 1, "2 × 2"],
  [4,  2, 2, 1, "2 × 2"],
  [5,  2, 2, 2, "2 × 2 + page indicator"],
  [6,  2, 2, 2, "2 × 2 + page indicator"],
  [7,  2, 2, 2, "2 × 2 + pages"],
  [9,  2, 2, 3, "2 × 2 + pages"],
  [16, 2, 2, 4, "2 × 2 + pages"],
  [17, 2, 2, 5, "2 × 2 + pages"],
];

for (const [people, columns, rows, pages, note] of mobile) {
  const l = gridLayout(people, "mobile");
  check(l.columns === columns && l.rows === rows && l.pages === pages,
        `${String(people).padStart(2)} → ${l.columns}×${l.rows}, ${l.pages} page(s)   ${note}`,
        `expected ${columns}×${rows} over ${pages}`);
}

check(gridLayout(40, "mobile").overflow === 0,
      "mobile never shows +N — it pages instead",
      `overflow ${gridLayout(40, "mobile").overflow}`);
check(!gridLayout(1, "mobile").letterbox, "a lone mobile tile fills the area");

// A page that does not divide evenly must not render empty cells as people.
{
  const l = gridLayout(7, "mobile", 1);
  check(l.tiles === 3, "the last mobile page renders only the people on it",
        `${l.tiles} tiles`);
}
{
  const l = gridLayout(7, "mobile", 9);
  check(l.page === 1 && l.tiles === 3, "a page past the end clamps to the last one",
        `page ${l.page}, ${l.tiles} tiles`);
}

// ---------------------------------------------------------------------------
// Ordering — "the person talking is never the person hidden"
// ---------------------------------------------------------------------------
console.log("\nOrdering\n");

const person = (identity, joinedAt, lastSpokeAt = null, isLocal = false) =>
  ({ identity, joinedAt, lastSpokeAt, isLocal });

{
  // Nobody is hidden, so nobody moves — the guard against reshuffling the grid
  // every time someone speaks.
  const people = [
    person("me", 0, 900, true),
    person("b", 1, 500),
    person("c", 2, 999),
    person("d", 3, null),
  ];
  const l = gridLayout(4, "desktop");
  const order = visibleOrder(people, l).map((p) => p.identity);
  check(order.join(",") === "me,b,c,d",
        "while everyone fits, join order holds regardless of who is speaking",
        order.join(","));
}

{
  // Seventeen people, fifteen places. The quiet ones lose theirs.
  //
  // The local participant is deliberately the worst candidate on both counts —
  // joined last, never spoke. An earlier version of this fixture had them
  // joining first, which meant the check passed even with the local-priority
  // rule deleted: join order alone kept them in. A test that cannot fail is
  // not a test, so the fixture now isolates the rule it is about.
  const people = [];
  for (let i = 1; i < 17; i++) people.push(person(`p${i}`, i, 5000 + i));
  people.push(person("me", 99, null, true));

  const l = gridLayout(17, "desktop");
  const shown = visibleOrder(people, l).map((p) => p.identity);
  check(shown.length === 15, "fifteen of seventeen are shown", `${shown.length}`);
  check(shown.includes("me"),
        "the local participant is never the one hidden, even joining last and silent",
        shown.join(","));
  check(shown.includes("p16"), "the most recent speaker is shown", shown.join(","));
  check(!shown.includes("p1") && !shown.includes("p2"),
        "the two who spoke longest ago are the ones dropped", shown.join(","));
  // Arrangement is join order, so a promoted speaker does not jump to the
  // front and shove everyone along — local first, then by join time.
  check(shown[0] === "me",
        "the local participant is arranged first despite joining last", shown[0]);
  const remotes = shown.slice(1);
  const ascending = [...remotes].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  check(remotes.join(",") === ascending.join(","),
        "and the rest keep join order rather than speaking order", remotes.join(","));
}

{
  // Mobile pages reach everyone, so there is no cut to make.
  const people = [person("me", 0, 0, true)];
  for (let i = 1; i < 7; i++) people.push(person(`p${i}`, i, i === 6 ? 5000 : 0));
  const first = visibleOrder(people, gridLayout(7, "mobile", 0)).map((p) => p.identity);
  const second = visibleOrder(people, gridLayout(7, "mobile", 1)).map((p) => p.identity);
  check(first.join(",") === "me,p1,p2,p3", "page one is the first four in join order", first.join(","));
  check(second.join(",") === "p4,p5,p6", "page two is the rest", second.join(","));
  check(new Set([...first, ...second]).size === 7, "and every participant appears exactly once");
}

{
  // Two people admitted in the same millisecond must not swap between renders.
  const a = [person("zoe", 5), person("ama", 5)];
  const l = gridLayout(2, "desktop");
  const once = visibleOrder(a, l).map((p) => p.identity);
  const again = visibleOrder([...a].reverse(), l).map((p) => p.identity);
  check(once.join(",") === again.join(","),
        "a tie in join time still gives one stable order",
        `${once.join(",")} vs ${again.join(",")}`);
}

// ---------------------------------------------------------------------------
// Keyboard suppression — §9 and §3.4's acceptance list
// ---------------------------------------------------------------------------
console.log("\nShortcut suppression\n");

// Cmd+D and Cmd+E both take over a browser shortcut, so both call
// preventDefault. Getting this list wrong does not just fire a toggle at a bad
// moment — it swallows a character someone was typing.
const el = (tagName, attrs = {}, contentEditable = false) => ({
  tagName,
  isContentEditable: contentEditable,
  getAttribute: (name) => attrs[name] ?? null,
});

const typing = [
  ["a text input",            el("INPUT", { type: "text" }),   true],
  ["an input with no type",   el("INPUT"),                     true],
  ["a search field",          el("INPUT", { type: "search" }), true],
  ["an email field",          el("INPUT", { type: "email" }),  true],
  ["a textarea",              el("TEXTAREA"),                  true],
  ["a select",                el("SELECT"),                    true],
  // Neither an input nor a textarea. The Phase 5 chat composer is this shape.
  ["a contenteditable div",   el("DIV", {}, true),             true],
  ['role="textbox"',          el("DIV", { role: "textbox" }),  true],
  ["lowercase tagName",       { ...el("INPUT", { type: "text" }), tagName: "input" }, true],

  ["a checkbox",              el("INPUT", { type: "checkbox" }), false],
  ["a radio",                 el("INPUT", { type: "radio" }),    false],
  ["a range slider",          el("INPUT", { type: "range" }),    false],
  ["a file picker",           el("INPUT", { type: "file" }),     false],
  ["a submit button",         el("INPUT", { type: "submit" }),   false],
  ["a plain button",          el("BUTTON"),                      false],
  ["a video tile",            el("VIDEO"),                       false],
  ["nothing focused",         null,                              false],
];

for (const [label, target, expected] of typing) {
  const actual = isTyping(target);
  check(actual === expected,
        `${expected ? "suppressed in" : "fires on   "} ${label}`,
        `isTyping returned ${actual}`);
}

// ---------------------------------------------------------------------------
// Live regions — BUILD-PLAN's Phase 9 note, pinned early
// ---------------------------------------------------------------------------
console.log("\nLive regions in the room\n");

// "Audit what the framework injects before testing our own announcements."
// Next mounts its route announcer as a `role="alert"` region: assertive, and it
// interrupts whatever a screen reader is mid-sentence on. A second assertive
// region inside the room stacks on top of it and guarantees the flooding §9 is
// trying to prevent — the room is where announcements arrive in volume.
//
// A source scan rather than a rendered check, deliberately: the point is to
// catch the next `role="alert"` as it is typed, in the file where someone would
// reach for it, rather than after a room is full enough to notice.
const roomFiles = readdirSync("components/room").filter((f) => f.endsWith(".tsx"));

// Comments are stripped before scanning. The first version of this matched the
// comment *explaining* why `role="alert"` is wrong, and reported the file that
// had just been fixed — a check that reads prose as code will keep finding the
// documentation of its own rule.
const readRoom = (file) =>
  readFileSync(join("components/room", file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

check(
  roomFiles.length > 0,
  `the room has components to scan  (${roomFiles.length} files)`,
  "components/room is empty — every check below would pass vacuously",
);

const assertive = roomFiles.filter((file) =>
  /role=["']alert["']|aria-live=["']assertive["']/.test(readRoom(file)),
);
check(
  assertive.length === 0,
  "no assertive live region in the room — the framework already owns one",
  `assertive in: ${assertive.join(", ")}`,
);

// And the polite ones exist, so the scan above is not passing merely because
// the room announces nothing at all.
const polite = roomFiles.filter((file) =>
  /aria-live=["']polite["']|role=["']status["']/.test(readRoom(file)),
);
check(
  polite.length > 0,
  `the room does announce, politely  (${polite.join(", ")})`,
  "no live regions at all",
);

const total =
  desktop.length + 4 + 4 + 2 + mobile.length + 2 + 2 + 1 + 6 + 3 + 1 + typing.length + 3;
console.log(`\n${total - failed}/${total} room checks passed.`);
if (failed) process.exit(1);
