#!/usr/bin/env node
/**
 * The accessibility decisions that are arithmetic, pinned where waiting five
 * real seconds in a browser would be the alternative.
 *
 * Phase 9's substance is announcement timing, and almost none of it is
 * reachable from a test that drives a page: a five-second batching window, a
 * one-second drain gap, a ten-second staleness drop, and a suppression
 * threshold that behaves differently at eight and nine participants. Driving
 * those through a browser means real seconds and real rooms, and the boundary
 * cases — three held events versus two, the ninth participant, the repeat key
 * — would never be exercised at all.
 *
 * `axe` covers a different third of this phase and is a regression net rather
 * than the deliverable: it confirms an accessible name exists, not that it
 * means anything; that a live region is present, not that its output is
 * usable. Neither this file nor axe reaches the part that matters most, which
 * is a screen reader hearing the result. That is recorded as untested.
 *
 * Run with: npm run check:a11y
 */
import { execFileSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, readFileSync, readdirSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "parley-a11y-"));

/**
 * Compiled through a generated tsconfig rather than bare `tsc` arguments.
 *
 * `shortcuts.ts` imports `typing.ts` through the `@/` alias the rest of the
 * codebase uses, and `--paths` is rejected on the command line — tsc accepts
 * it only from a config file. Rewriting the import to a relative one to suit
 * the checker would be the tail wagging the dog.
 */
const tsconfig = join(out, "tsconfig.json");
writeFileSync(tsconfig, JSON.stringify({
  compilerOptions: {
    outDir: out,
    module: "commonjs",
    target: "es2022",
    moduleResolution: "node",
    skipLibCheck: true,
    baseUrl: process.cwd(),
    paths: { "@/*": ["./*"] },
    // Without this tsc picks its own common root and the emitted tree does not
    // mirror lib/room/, so the requires below miss.
    rootDir: process.cwd(),
  },
  files: [
    "lib/room/announce.ts", "lib/room/presence.ts",
    "lib/room/shortcuts.ts", "lib/room/typing.ts",
  ].map((f) => join(process.cwd(), f)),
}));
try {
  execFileSync("npx", ["tsc", "-p", tsconfig], { stdio: "pipe" });
} catch (e) {
  console.error("Could not compile the a11y modules:\n" + e.stdout?.toString());
  process.exit(1);
}
writeFileSync(join(out, "package.json"), '{"type":"commonjs"}');

/**
 * tsc resolves `@/` for type-checking and leaves it untouched in the emitted
 * JavaScript, so the compiled `shortcuts.js` still requires `@/lib/room/typing`
 * at runtime. Pointing `@` at the output root makes that resolve against the
 * compiled tree — which is cheaper than post-processing the emit, and much
 * cheaper than rewriting the source's imports to suit its checker.
 */
mkdirSync(join(out, "node_modules"), { recursive: true });
symlinkSync(out, join(out, "node_modules", "@"), "dir");

const require = createRequire(join(out, "index.cjs"));
const {
  AnnounceQueue, ANNOUNCE_GAP_MS, ANNOUNCE_MAX_AGE_MS, ANNOUNCE_CAP,
} = require(join(out, "lib/room/announce.js"));
const {
  PresenceBatcher, BATCH_WINDOW_MS, SUPPRESS_NAMES_ABOVE,
} = require(join(out, "lib/room/presence.js"));
const {
  matchShortcut, formatChord, chordFor, SHORTCUTS,
} = require(join(out, "lib/room/shortcuts.js"));
rmSync(out, { recursive: true, force: true });

let failed = 0;
const check = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${label}${pass ? "" : `  — ${detail}`}`);
};
let count = 0;
const t = (pass, label, detail) => { count++; check(pass, label, detail); };

// ---------------------------------------------------------------------------
console.log("The announcement queue\n");

t(typeof AnnounceQueue === "function" && typeof PresenceBatcher === "function"
  && typeof matchShortcut === "function",
  "the modules compiled and their exports are callable");

{
  const q = new AnnounceQueue();
  q.push("first", 0);
  q.push("second", 0);
  t(q.drain(0)?.text === "first", "the queue is first in, first out");
  t(q.drain(0) === null,
    "and holds the next one back until the gap has passed",
    "two strings swapped inside a frame are one mutation, and the first is lost");
  t(q.drain(ANNOUNCE_GAP_MS)?.text === "second", "which it releases after the gap");
}

{
  // The bug this class exists for. A bare string in state means React bails
  // out when the value is unchanged, the DOM is never touched, and nothing is
  // spoken — so two messages from the same sender announced once.
  const q = new AnnounceQueue();
  q.push("Ama sent a message", 0);
  q.push("Ama sent a message", 0);
  const a = q.drain(0);
  const b = q.drain(ANNOUNCE_GAP_MS);
  t(a?.text === b?.text && a?.id !== b?.id,
    "an identical repeat is kept, and carries a different id",
    `${JSON.stringify(a)} ${JSON.stringify(b)}`);
}

{
  const q = new AnnounceQueue();
  q.push("stale", 0);
  q.push("fresh", ANNOUNCE_MAX_AGE_MS + 1);
  t(q.drain(ANNOUNCE_MAX_AGE_MS + 1)?.text === "fresh",
    "a head older than the staleness limit is dropped, not spoken",
    "thirty-second-old news is an interruption about the past");
}

{
  const q = new AnnounceQueue();
  for (let i = 0; i < ANNOUNCE_CAP + 3; i++) q.push(`m${i}`, 0);
  t(q.depth === ANNOUNCE_CAP, "the queue is capped", String(q.depth));
  t(q.drain(0)?.text === "m3", "and overflow drops the oldest, not the newest");
}

// ---------------------------------------------------------------------------
console.log("\nJoin and leave batching\n");

{
  const b = new PresenceBatcher();
  t(b.add({ kind: "joined", name: "Ama Serwaa" }, 0, 2) === "Ama Serwaa joined",
    "the first event announces immediately, by name");
  t(b.add({ kind: "joined", name: "Kofi Mensah" }, 100, 3) === null,
    "and the next one inside the window is held");
  t(b.due(100) === false, "the window is not due before it elapses");
  t(b.due(BATCH_WINDOW_MS) === true, "and is due exactly when it does");
}

{
  // §9: "One further arrival reads as a name, two or more as a count."
  const b = new PresenceBatcher();
  b.add({ kind: "joined", name: "Ama Serwaa" }, 0, 2);
  b.add({ kind: "joined", name: "Kofi Mensah" }, 100, 3);
  t(JSON.stringify(b.flush(BATCH_WINDOW_MS, 3)) === JSON.stringify(["Kofi Mensah joined"]),
    "one held event reads as a name",
    JSON.stringify(b.flush(BATCH_WINDOW_MS, 3)));
}

{
  const b = new PresenceBatcher();
  b.add({ kind: "joined", name: "Ama Serwaa" }, 0, 2);
  b.add({ kind: "joined", name: "Kofi Mensah" }, 100, 3);
  b.add({ kind: "joined", name: "Nana Adjei" }, 200, 4);
  t(JSON.stringify(b.flush(BATCH_WINDOW_MS, 4)) === JSON.stringify(["2 people joined"]),
    "two held events read as a count");
}

{
  // §9's own example string, and the reason the earlier wording was replaced:
  // under a separate "more than three collapses" threshold the smallest
  // collapsed number was four, so "3 people joined" could not be produced.
  const b = new PresenceBatcher();
  b.add({ kind: "joined", name: "Ama Serwaa" }, 0, 2);
  for (const name of ["Kofi", "Nana", "Yaa"]) {
    b.add({ kind: "joined", name }, 100, 5);
  }
  t(JSON.stringify(b.flush(BATCH_WINDOW_MS, 5)) === JSON.stringify(["3 people joined"]),
    "and §9's own example string is producible",
    JSON.stringify(b.flush(BATCH_WINDOW_MS, 5)));
}

{
  const b = new PresenceBatcher();
  b.add({ kind: "joined", name: "Ama" }, 0, 2);
  b.add({ kind: "joined", name: "Kofi" }, 10, 3);
  b.add({ kind: "joined", name: "Nana" }, 20, 4);
  b.add({ kind: "left", name: "Yaa" }, 30, 3);
  b.add({ kind: "left", name: "Kwame" }, 40, 2);
  t(JSON.stringify(b.flush(BATCH_WINDOW_MS, 2)) ===
    JSON.stringify(["2 people joined", "2 people left"]),
    "a mixed batch splits by direction, joins first",
    JSON.stringify(b.flush(BATCH_WINDOW_MS, 2)));
}

{
  const b = new PresenceBatcher();
  t(JSON.stringify(b.flush(BATCH_WINDOW_MS, 2)) === "[]",
    "flushing an empty window says nothing");
}

{
  // §9 suppresses "individual announcements" above eight, which is narrower
  // than suppressing everything: in the ten-person standup the section is
  // written about, the count is the useful sentence and the names are the
  // thirty seconds lost.
  const b = new PresenceBatcher();
  t(b.add({ kind: "joined", name: "Ama" }, 0, SUPPRESS_NAMES_ABOVE + 1) === null,
    "above the threshold, a name is not announced");
  b.add({ kind: "joined", name: "Kofi" }, 10, SUPPRESS_NAMES_ABOVE + 1);
  b.add({ kind: "joined", name: "Nana" }, 20, SUPPRESS_NAMES_ABOVE + 1);
  t(JSON.stringify(b.flush(BATCH_WINDOW_MS, SUPPRESS_NAMES_ABOVE + 1)) ===
    JSON.stringify(["2 people joined"]),
    "but the count still is — that is the sentence worth hearing",
    JSON.stringify(b.flush(BATCH_WINDOW_MS, SUPPRESS_NAMES_ABOVE + 1)));
}

{
  const b = new PresenceBatcher();
  t(b.add({ kind: "joined", name: "Ama" }, 0, SUPPRESS_NAMES_ABOVE) === "Ama joined",
    "at exactly the threshold, names still announce — 'above eight' is nine",
    "an off-by-one here silences a room of eight");
}

{
  const b = new PresenceBatcher();
  b.add({ kind: "joined", name: "Ama" }, 0, 2);
  b.add({ kind: "joined", name: "Kofi" }, 10, 3);
  t(b.pending === 1, "events are held while a window is open");
  b.discard();
  t(b.pending === 0 && b.due(BATCH_WINDOW_MS) === false,
    "and a reconnect can throw the whole burst away",
    "LiveKit unwinds every participant and re-adds them: 16 events from one blip");
}

{
  // A slow trickle announces each arrival individually, because each opens a
  // new window. §9 calls that out as falling out rather than needing a rule.
  const b = new PresenceBatcher();
  t(b.add({ kind: "joined", name: "Ama" }, 0, 2) === "Ama joined", "trickle: first");
  t(b.add({ kind: "joined", name: "Kofi" }, BATCH_WINDOW_MS * 2, 3) === "Kofi joined",
    "trickle: a later arrival opens its own window and is named");
}

// ---------------------------------------------------------------------------
console.log("\nShortcuts\n");

const evt = (over = {}) => ({
  key: "", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
  repeat: false, target: null, ...over,
});

t(matchShortcut(evt({ key: "d", metaKey: true })) === "mic", "Cmd+D toggles the mic");
t(matchShortcut(evt({ key: "d", ctrlKey: true })) === "mic", "and so does Ctrl+D");
t(matchShortcut(evt({ key: "e", metaKey: true })) === "camera", "Cmd+E toggles the camera");
t(matchShortcut(evt({ key: "c", metaKey: true, altKey: true })) === "chat",
  "Cmd+Alt+C toggles chat");

// The `?` case, which the old hook could not reach at all: it returned before
// inspecting any key unless a modifier was held.
t(matchShortcut(evt({ key: "?" })) === "help", "? opens the shortcuts dialog");
t(matchShortcut(evt({ key: "?", metaKey: true })) === null,
  "and Cmd+? does not — that chord belongs to the browser");
t(matchShortcut(evt({ key: "?", altKey: true })) === null, "nor does Alt+?");

// Matched on the produced character, not on Shift plus a key: which physical
// key yields `?` differs by layout.
t(matchShortcut(evt({ key: "?", shiftKey: true })) === "help",
  "? still matches when the layout reports Shift",
  "requiring Shift would exclude layouts where ? is unshifted");

t(matchShortcut(evt({ key: "d", metaKey: true, shiftKey: true })) === null,
  "Cmd+Shift+D is left alone — it is bookmark-all-tabs, not mute",
  "the previous matcher claimed it");

t(matchShortcut(evt({ key: "d", metaKey: true, repeat: true })) === null,
  "a held key toggles once, not forty times");

t(matchShortcut(evt({ key: "x", metaKey: true })) === null, "and unbound chords are ignored");

// Typing suppression — the load-bearing one, because these shortcuts call
// preventDefault and would otherwise swallow a keystroke.
for (const [label, target] of [
  ["an input", { tagName: "INPUT" }],
  ["a textarea", { tagName: "TEXTAREA" }],
  ["a contenteditable", { isContentEditable: true }],
]) {
  t(matchShortcut(evt({ key: "d", metaKey: true, target })) === null,
    `no shortcut fires while focus is in ${label}`);
  t(matchShortcut(evt({ key: "?", target })) === null,
    `and ? least of all in ${label}`,
    "? is an ordinary printable character");
}

// ---------------------------------------------------------------------------
console.log("\nThe shortcut table\n");

t(SHORTCUTS.length === 4, "every action §9 lists is in the table", String(SHORTCUTS.length));
for (const s of SHORTCUTS) {
  t(typeof s.label === "string" && s.label.length > 0,
    `${s.action} has a label for the dialog`, JSON.stringify(s));
}
t(formatChord({ mod: true, key: "D" }, "mac") === "⌘D", "Mac notation has no separators");
t(formatChord({ mod: true, key: "D" }, "other") === "Ctrl+D",
  "and elsewhere it is Ctrl, not ⌘",
  "three tooltips used to hardcode ⌘ for every platform");
t(formatChord({ mod: true, alt: true, key: "C" }, "mac") === "⌘⌥C", "modifiers keep their order");
t(formatChord({ shift: true, key: "?" }, "mac") === "?",
  "? is printed alone — 'Shift+?' reads as a different key",
  formatChord({ shift: true, key: "?" }, "mac"));
t(chordFor("mic", "other") === "Ctrl+D", "chordFor resolves an action for a tooltip");

// ---------------------------------------------------------------------------
// Source scans. Weaker than the above, and named as weaker.
// ---------------------------------------------------------------------------
console.log("\nBy inspection\n");

{
  const room = readdirSync("components/room").filter((f) => f.endsWith(".tsx"));
  t(room.length > 0, "the room components were found", String(room.length));

  const strip = (raw) =>
    raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // The floor: "Mark them as labelled regions, never role="dialog" with
  // aria-modal — the ARIA attribute is what promises a trap, so using it
  // without one is the lie."
  const liars = room.filter((f) => {
    const s = strip(readFileSync(`components/room/${f}`, "utf8"));
    return /aria-modal/.test(s) && !/DialogContent/.test(s);
  });
  t(liars.length === 0,
    "no non-modal panel claims aria-modal",
    `${liars.join(", ")} — the attribute promises a trap`);

  // §9 and the floor: one polite region for the room's announcements. Others
  // exist for their own purposes; this asserts the list rather than the count,
  // so a tenth is loud instead of invisible.
  const withPolite = room.filter((f) =>
    /aria-live="polite"/.test(strip(readFileSync(`components/room/${f}`, "utf8"))));
  const EXPECTED_POLITE = [
    "MuteRequestPrompt.tsx",  // a host asked you to mute — a request, not a toggle
    "ReplacedNotice.tsx",     // "Kofi is now presenting"
    "ResumePrompt.tsx",       // §12's iOS resume state
    "RoomEntry.tsx",          // the join hold, and "Connecting you…"
    "RoomGrid.tsx",           // mobile page changes
    "RoomStage.tsx",          // the room's announcement region, and "Connecting you…"
    "SharingBar.tsx",         // "You're sharing your screen"
  ];
  const unexpected = withPolite.filter((f) => !EXPECTED_POLITE.includes(f));
  t(unexpected.length === 0,
    "every polite live region in the room is one we know about",
    `unlisted: ${unexpected.join(", ")}`);

  // The two that narrated on a clock, and no longer do. §9's premise is that
  // the hard problem is stopping the room announcing things — a counter whose
  // text changes every second is that failure through a channel §9 never
  // enumerated. Both keep their text visible; neither is live any more.
  t(!withPolite.includes("ChatPanel.tsx"),
    "the chat cooldown counter is not a live region",
    "its text changed every second, and on every keystroke past 900");
  {
    const entry = strip(readFileSync("components/room/RoomEntry.tsx", "utf8"));
    t(/aria-hidden> — \{outcome\.seconds\}s<\/span>/.test(entry),
      "and the join countdown announces its sentence, not its number",
      "it read 9s, then 8s, then 7s, for the whole hold");
  }

  /**
   * Portalled content on the dark-forced routes carries `dark` itself.
   *
   * Rule 8b forces dark on /j/[code] and /room/[code] "via a wrapper element in
   * the route-group layout" — and Radix portals render to `document.body`,
   * which is outside that wrapper. So every tooltip, dialog, popover and select
   * in the room fell back to the *light* palette.
   *
   * It hid since Phase 3 because it only appears when the viewer's OS is in
   * light mode: otherwise next-themes puts `.dark` on <html> and the portal
   * inherits it. axe found it as a 2.79:1 contrast failure on a tooltip.
   */
  const PORTALLED = ["TooltipContent", "PopoverContent", "DialogContent", "SelectContent"];
  const darkForced = [
    ...readdirSync("components/room").map((f) => `components/room/${f}`),
    ...readdirSync("components/prejoin").map((f) => `components/prejoin/${f}`),
  ].filter((f) => f.endsWith(".tsx"));

  const unscoped = [];
  for (const file of darkForced) {
    const source = strip(readFileSync(file, "utf8"));
    for (const tag of PORTALLED) {
      // Opening tags, tolerating arrow functions in the attribute list.
      for (const m of source.matchAll(new RegExp(`<${tag}\\b`, "g"))) {
        const tail = source.slice(m.index, m.index + 400);
        const open = tail.slice(0, tail.search(/>\s*[<{\n]/) + 1);
        if (!/className="[^"]*\bdark\b/.test(open)) {
          unscoped.push(`${file}: <${tag}>`);
        }
      }
    }
  }
  t(unscoped.length === 0,
    "portalled content in the room carries the dark palette itself",
    `${unscoped.join(", ")} — a Radix portal escapes the route layout's wrapper`);

  // The reaction announce gate is otherwise untested: REACTION_ANNOUNCE_MS is
  // declared, imported and used in one place each, and check:chat constructs
  // every Throttle with REACTION_INTERVAL_MS instead. Change 2000 to 200 and
  // every other check stays green.
  const limits = readFileSync("lib/room/limits.ts", "utf8");
  const m = limits.match(/REACTION_ANNOUNCE_MS\s*=\s*([\d_]+)/);
  t(m && Number(m[1].replace(/_/g, "")) === 2000,
    "§9's reaction announce throttle is still one per participant per 2s",
    m ? m[1] : "REACTION_ANNOUNCE_MS not found");
}

console.log(`\n${count - failed}/${count} accessibility checks passed.`);
if (failed) process.exit(1);
