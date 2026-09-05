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
    ["tsc", "lib/room/layout.ts", "lib/room/typing.ts", "lib/room/limits.ts",
     "--outDir", out, "--module", "commonjs",
     "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile lib/room/layout.ts:\n" + e.stdout?.toString());
  process.exit(1);
}
writeFileSync(join(out, "package.json"), '{"type":"commonjs"}');
const require = createRequire(join(out, "index.cjs"));
const { gridLayout, filmstripLayout, visibleOrder, FILMSTRIP_CAPACITY } =
  require(join(out, "layout.js"));
const { isTyping } = require(join(out, "typing.js"));
// v1.3 C6's sway bound — the real module, not a transcription of it.
const { REACTION_SWAY, REACTION_DRIFT_MAX, REACTION_LANE_PITCH } =
  require(join(out, "limits.js"));
rmSync(out, { recursive: true, force: true });

let failed = 0;
/**
 * Counted here rather than summed by hand at the bottom.
 *
 * The total used to be an expression adding up every section's length, which
 * meant adding a check and forgetting the sum reported one fewer than ran —
 * silently, and in the direction that looks like nothing happened. That is
 * exactly what happened when the BUILD-PLAN ownership check was added.
 * `check-chat.mjs` has always self-counted; this now does too.
 */
let count = 0;
const check = (pass, label, detail = "") => {
  count++;
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
// §3.4, share mode: the filmstrip
// ---------------------------------------------------------------------------
console.log("\nFilmstrip\n");

// "shared content takes the main area, participants collapse to a filmstrip
// (desktop: right edge; mobile: top strip, 3 visible)."
check(filmstripLayout(4, "desktop").orientation === "vertical",
  "desktop puts the strip on the right edge, so it runs vertically");
check(filmstripLayout(4, "mobile").orientation === "horizontal",
  "mobile puts it across the top");
/*
 * The invariant worth gating is not a magic number — v1.2 F3.
 *
 * This asserted `FILMSTRIP_CAPACITY.mobile === 3`, which encoded §3.4's
 * "3 visible" as a capacity when it described the viewport. What actually
 * matters, on either surface, is that nobody vanishes silently: if there are
 * more people than places, the last place says so.
 */
for (const viewport of ["desktop", "mobile"]) {
  const capacity = FILMSTRIP_CAPACITY[viewport];
  const full = filmstripLayout(capacity, viewport);
  check(full.tiles === capacity && full.overflow === 0,
    `${viewport} filmstrip shows everyone at its capacity`,
    `${full.tiles} tiles, +${full.overflow}`);

  const over = filmstripLayout(capacity + 3, viewport);
  check(over.overflow === (capacity + 3) - over.tiles,
    `${viewport} filmstrip accounts for everyone it cannot show`,
    `${over.tiles} tiles, +${over.overflow} of ${capacity + 3}`);
  check(over.overflow > 0,
    `${viewport} filmstrip never hides anyone without saying so`,
    `+${over.overflow}`);
}

for (const [people, viewport, tiles, overflow] of [
  [1, "desktop", 1, 0],
  [5, "desktop", 5, 0],
  [6, "desktop", 4, 2],
  [20, "desktop", 4, 16],
  // v1.2 F3: the mobile strip scrolls through everyone up to the desktop
  // grid's own ceiling, rather than capping at the three §3.4 said were
  // *visible*. Four people are four tiles now, not two and a "+2".
  [3, "mobile", 3, 0],
  [4, "mobile", 4, 0],
  [16, "mobile", 16, 0],
  [17, "mobile", 15, 2],
]) {
  const l = filmstripLayout(people, viewport);
  check(l.tiles === tiles && l.overflow === overflow,
    `${String(people).padStart(2)} on ${viewport.padEnd(7)} → ${l.tiles} tiles, +${l.overflow}`,
    `expected ${tiles} tiles, +${overflow}`);
}
{
  // Same rule as the grid's 4×4: the "+N" cell takes a place, so everyone is
  // either shown or counted and nobody is silently dropped.
  const l = filmstripLayout(20, "desktop");
  check(l.tiles + l.overflow === 20, "everyone is either shown or counted",
    `${l.tiles} + ${l.overflow}`);
  check(l.tiles + 1 === l.capacity, "with the +N cell occupying one place",
    `${l.tiles} in ${l.capacity}`);
}
{
  // A filmstrip never pages — there is nowhere to page to beside the content —
  // so the cut matters far more often than in a sixteen-cell grid.
  const people = [];
  for (let i = 1; i <= 8; i++) people.push(person(`p${i}`, i, 5000 + i));
  people.push(person("me", 99, null, true));

  const shown = visibleOrder(people, filmstripLayout(9, "desktop")).map((p) => p.identity);
  check(shown.length === 4, "nine people, four places", `${shown.length}`);
  check(shown.includes("me"), "the local participant is never the one hidden", shown.join(","));
  check(shown.includes("p8"), "nor is the most recent speaker", shown.join(","));
  check(!shown.includes("p1"), "the one who spoke longest ago is dropped", shown.join(","));
  check(shown[0] === "me", "and the order is still join order, local first", shown.join(","));
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

// ---------------------------------------------------------------------------
// §3.8: what a server route is allowed to do with roomAdmin
// ---------------------------------------------------------------------------
console.log("\nServer-side room powers\n");

// "`roomAdmin` carries mute and unmute powers on LiveKit's server API… Any
// future route that spends `roomAdmin` inherits this constraint — the
// client-side guarantee is worthless if a server route quietly widens it."
//
// The absence of an unmute message stops a client. Nothing stops a route, so
// this is what does: every file that constructs a RoomServiceClient may call
// only the methods on this list. Adding one is a deliberate act with a
// failing check in front of it, which is the point.
//
// `deleteRoom` was added deliberately for v1.3 B1, which is the process this
// check exists to force. §3.8's sentence is now "that route ends and removes,
// nothing wider" — two verbs, two methods. Ending is the one power a host
// genuinely needs that Leave cannot express, and `deleteRoom` neither mutes nor
// unmutes anyone, so the guarantee this list protects is untouched: nothing
// here can activate a microphone.
const ALLOWED_ROOM_SERVICE_CALLS = new Set(["removeParticipant", "deleteRoom"]);

// Anything on the server SDK that could mute, unmute, or publish on someone
// else's behalf. Named rather than inferred, so the check states what it is
// defending against.
const FORBIDDEN_ROOM_SERVICE_CALLS = [
  "mutePublishedTrack",
  "updateParticipant",
  "updateSubscriptions",
  "sendData",
];

const routeFiles = [];
const walkRoutes = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkRoutes(path);
    else if (entry.name.endsWith(".ts")) routeFiles.push(path);
  }
};
walkRoutes("app");
walkRoutes("lib");

const usesRoomService = routeFiles.filter((file) =>
  /new\s+RoomServiceClient\b/.test(readFileSync(file, "utf8")),
);

check(
  usesRoomService.length > 0,
  `something spends roomAdmin, so this check is not vacuous  (${usesRoomService.length} file)`,
  "no RoomServiceClient found — either it moved or this check stopped applying",
);

for (const file of usesRoomService) {
  const source = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
  const called = [...source.matchAll(/\bservice\.(\w+)\s*\(/g)].map((m) => m[1]);
  const beyond = called.filter((name) => !ALLOWED_ROOM_SERVICE_CALLS.has(name));
  check(
    beyond.length === 0,
    `${file} calls only what §3.8 permits  (${[...new Set(called)].join(", ")})`,
    `also calls: ${[...new Set(beyond)].join(", ")}`,
  );

  const forbidden = FORBIDDEN_ROOM_SERVICE_CALLS.filter((name) =>
    source.includes(`${name}(`),
  );
  check(
    forbidden.length === 0,
    `${file} never reaches for a mute or unmute power`,
    `found: ${forbidden.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// The accessibility floor's two control patterns
// ---------------------------------------------------------------------------
console.log("\nControl patterns\n");

// CLAUDE.md is now the authoritative copy of these, and PRD §9 defers to it.
// The split is stated in both files and says the two "cannot now" drift — so
// it is checked rather than trusted. Prose is not the enforcement; this is.
const interactive = [];
const walkTsx = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(path);
    else if (entry.name.endsWith(".tsx")) interactive.push(path);
  }
};
walkTsx("components");
walkTsx("app");

// Comments stripped: the files that explain why `aria-pressed` is absent say
// the words, and a scan that reads its own documentation as a violation finds
// the rule wherever the rule is written down.
const codeOf = (file) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

check(interactive.length > 0, `there are components to scan  (${interactive.length})`,
      "nothing found — this check would pass vacuously");

// "State toggles… name the action and change with it… No `aria-pressed` —
// carrying both an action name and a pressed state announces the same fact
// twice, in a confusing order."
const pressed = interactive.filter((f) => /aria-pressed/.test(codeOf(f)));
check(
  pressed.length === 0,
  "no aria-pressed anywhere — state toggles carry the action in the name",
  `found in: ${pressed.map((f) => f.replace(/^.*\//, "")).join(", ")}`,
);

// "Disclosure controls… a noun name plus `aria-expanded` and `aria-controls`."
// Neither half alone is the pattern: expanded without controls leaves a screen
// reader knowing something opened and not what.
//
// Counted as JSX *attributes*, not as substrings. `RoomStage` restores focus by
// finding a panel's trigger with `querySelector('[aria-controls="…"]')`, and a
// bare /aria-controls/ counted that selector as an unpaired control — the check
// reporting a violation it had invented. A preceding `[` is a CSS selector; an
// attribute never has one.
// Fresh each time: a /g regex carries `lastIndex` between `.test()` calls, so
// reusing one across a filter silently skips every other file.
const attrControls = () => /(?<!\[)\baria-controls=/g;
const attrExpanded = () => /(?<!\[)\baria-expanded=/g;
/**
 * `aria-selected` is the other legitimate partner — v1.3 C3.
 *
 * The rule above is the *disclosure* pattern, and it was written when every
 * `aria-controls` in the room was one. C3's panel added tabs, where the correct
 * pairing is `aria-controls` with `aria-selected`: a tab does not expand, it
 * selects, and `aria-expanded` on one would be describing a state it does not
 * have.
 *
 * Widened deliberately rather than loosened. What the check exists to prevent
 * is "a screen reader knowing something opened and not what" — and a tab that
 * names the panel it selects does not leave that gap. Anything carrying
 * `aria-controls` with *neither* partner still fails.
 */
const attrSelected = () => /(?<!\[)\baria-selected=/g;

const disclosures = interactive.filter((f) => attrControls().test(codeOf(f)));
check(disclosures.length > 0, `something uses the disclosure pattern  (${disclosures.length} file)`,
      "no aria-controls found — either the panels changed or this stopped applying");

for (const file of disclosures) {
  const code = codeOf(file);
  const controls = (code.match(attrControls()) ?? []).length;
  const expanded =
    (code.match(attrExpanded()) ?? []).length +
    (code.match(attrSelected()) ?? []).length;
  check(
    expanded >= controls,
    `${file.replace(/^.*\//, "")} pairs every aria-controls with aria-expanded or aria-selected`,
    `${controls} controls, ${expanded} expanded`,
  );
}

// ---------------------------------------------------------------------------
// The ownership split itself
// ---------------------------------------------------------------------------
console.log("\nWho owns which rule\n");

// Two documents describing the same thing drifted once already — PRD §9 said
// mic and camera use `aria-pressed` while CLAUDE.md said they must not. The
// split is the fix, and these markers are what make it findable by the next
// person rather than a convention someone has to already know.
const claude = readFileSync("CLAUDE.md", "utf8");
const prd = readFileSync("PRD.md", "utf8");
const buildPlan = readFileSync("BUILD-PLAN.md", "utf8");
check(
  /authoritative copy/.test(claude),
  "CLAUDE.md's floor declares itself authoritative",
  "the marker is gone — the split is no longer stated anywhere",
);
check(
  // Matched on the sentences rather than on a formatted token: the file
  // writes the filename in backticks, and a regex that assumes otherwise
  // reports a missing deferral that is right there.
  /not repeated here/.test(prd) &&
    /owns it and this document does not restate it/.test(prd),
  "PRD §9 defers the mechanics and says who owns them",
  "the deferral is gone — §9 may have started restating mechanics again",
);

/**
 * The third document, which the split forgot.
 *
 * The Phase 7 ownership split reconciled `CLAUDE.md` and `PRD.md` §9 and left
 * `BUILD-PLAN.md` out — so its Phase 9 task list went on asking for
 * `aria-pressed` for two more phases while both gates above stayed green. A
 * split between two of three documents is not a split; it is a smaller
 * contradiction.
 *
 * Scoped to **task bullets**, not to the whole file.
 *
 * The first version forbade the string anywhere, and the very next edit to
 * BUILD-PLAN broke it — by adding a paragraph explaining that `aria-pressed`
 * had been removed and why. That note is the kind of record this project keeps
 * deliberately, and a check that forbids describing a mistake would push the
 * next person to delete the explanation rather than the requirement.
 *
 * What must not come back is a *requirement*: a line in the task list asking
 * for it. Prose about the history is welcome.
 */
{
  const asks = buildPlan
    .split("\n")
    .filter((line) => /^\s*[-*]\s/.test(line) && /aria-pressed/.test(line));
  check(
    asks.length === 0,
    "no BUILD-PLAN task asks for aria-pressed",
    `${asks.map((l) => l.trim()).join(" | ")} — CLAUDE.md's floor owns this mechanic`,
  );
}

// ---------------------------------------------------------------------------
// Hiding, owned rather than inherited
// ---------------------------------------------------------------------------
console.log("\nWhat hides a panel\n");

// CLAUDE.md's testing rules: "A correctness property may not rest on a
// third-party reset." The `hidden` attribute hides through a UA rule that any
// author `display` declaration outranks, so a `display: flex` panel with
// `hidden` set is visible. The chat panel worked only because Tailwind's
// preflight happens to mark its own `[hidden]` rule important.
const globals = readFileSync("app/globals.css", "utf8");
const rule = /\[hidden\][^{]*\{[^}]*display:\s*none\s*!important/;
check(
  rule.test(globals),
  "app/globals.css declares [hidden] { display: none !important } itself",
  "not found — the panel is relying on Tailwind's preflight again",
);
// `until-found` exists so find-in-page can reveal collapsed content; hiding it
// important would break that.
check(
  /until-found/.test(globals),
  "and excludes hidden=\"until-found\", which find-in-page needs",
);

/* -------------------------------------------------------------------------- *
 * v1.3 C6: the reaction arc, and the lane guarantee it could quietly break.
 *
 * `REACTION_DRIFT_MAX` is a quarter of the lane pitch so that "two reactions in
 * adjacent lanes stay at least 11px apart however the drift falls". That held
 * trivially while the path was a straight line from 0 to `drift` — the greatest
 * excursion was the endpoint, and the endpoint was bounded.
 *
 * A sway moves the excursion into the middle of the flight, where nothing was
 * checking it. A keyframe at 1.4x the drift would look fine, break nothing
 * visible in a two-person room, and collapse the separation the lanes exist to
 * provide the first time five people reacted at once.
 *
 * So: the coefficients are bounded here, and the stylesheet is checked against
 * them rather than trusted to match. Two copies of a number agree until one is
 * edited, which is the failure this whole file was written for.
 * -------------------------------------------------------------------------- */
const sway = REACTION_SWAY;
check(
  sway.every((c) => Math.abs(c) <= 1),
  "no sway keyframe exceeds the drift it was bounded against",
  `worst ${Math.max(...sway.map(Math.abs))}x`,
);
check(
  Math.max(...sway.map(Math.abs)) * REACTION_DRIFT_MAX * 2 < REACTION_LANE_PITCH,
  "so two reactions in adjacent lanes cannot cross",
  `${(Math.max(...sway.map(Math.abs)) * REACTION_DRIFT_MAX * 2).toFixed(1)}px of swing against a ${REACTION_LANE_PITCH}px pitch`,
);
check(
  sway.slice(1).every((c, i) => i === 0 || Math.abs(c) < Math.abs(sway[i])),
  "and the sway damps rather than repeating — floating, not wobbling",
  sway.join(", "),
);

/*
 * The stylesheet says the same numbers.
 *
 * Parsed out of the keyframes rather than compared to a transcription: the
 * comment in `limits.ts` claims "the stylesheet is written from these numbers",
 * and a claim nothing checks is how the two drift apart.
 */
const swayBlock = globals.match(/@keyframes parley-reaction-sway\s*\{([\s\S]*?)\n\}/);
check(Boolean(swayBlock), "the sway keyframes exist in app/globals.css");
if (swayBlock) {
  const declared = [
    0,
    ...[...swayBlock[1].matchAll(/translate:\s*calc\(var\(--parley-drift[^)]*\)\s*\*\s*(-?[\d.]+)\)/g)].map(
      (m) => Number(m[1]),
    ),
  ];
  // The 25% keyframe is a bare `var(--parley-drift)` — 1x, with no `calc`.
  const full = /25%\s*\{\s*translate:\s*var\(--parley-drift[^)]*\);/.test(swayBlock[1]);
  const fromCss = full ? [declared[0], 1, ...declared.slice(1)] : declared;
  check(
    JSON.stringify(fromCss) === JSON.stringify([...sway]),
    "and they are REACTION_SWAY, not a second copy of it",
    `css ${JSON.stringify(fromCss)} vs limits ${JSON.stringify([...sway])}`,
  );
  check(
    /rotate:\s*0deg/.test(swayBlock[1].split("100%")[1] ?? ""),
    "a reaction is level again by the time it fades",
    "a fading emoji frozen mid-tip looks broken, not buoyant",
  );
}

console.log(`\n${count - failed}/${count} room checks passed.`);
if (failed) process.exit(1);
