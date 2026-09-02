#!/usr/bin/env node
/**
 * The data-channel features, where they are arithmetic and where they are
 * security.
 *
 * §3.5 and §3.6 both state rules a component cannot be trusted to hold on its
 * own: a 60-second grouping window, a one-per-second reaction gate, a scheme
 * allow-list on autolinked URLs. The first two are the kind of thing that
 * looks right in a screenshot and is wrong at the boundary; the third is the
 * only place in the product where a substring of someone else's message
 * becomes an element.
 *
 * Every packet on this channel is attacker-controlled by definition. Anyone
 * who can join a meeting can craft one, and there is no server in the path —
 * data goes participant to participant through the SFU. So the decoder is
 * tested the way an endpoint would be.
 *
 * Run with: npm run check:chat
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "parley-chat-"));
try {
  execFileSync(
    "npx",
    ["tsc", "lib/room/messages.ts", "lib/room/autolink.ts", "lib/room/reaction-limit.ts",
     "--outDir", out, "--module", "commonjs",
     "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile the chat modules:\n" + e.stdout?.toString());
  process.exit(1);
}
writeFileSync(join(out, "package.json"), '{"type":"commonjs"}');
const require = createRequire(join(out, "index.cjs"));
const messages = require(join(out, "messages.js"));
const { autolink } = require(join(out, "autolink.js"));
const { Throttle, REACTION_INTERVAL_MS, nextLane, REACTION_LANES } =
  require(join(out, "reaction-limit.js"));
rmSync(out, { recursive: true, force: true });

const { encode, decode, sanitiseChatBody, REACTIONS, CHAT_MAX_LENGTH } = messages;

let failed = 0;
const check = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${label}${pass ? "" : `  — ${detail}`}`);
};
let count = 0;
const t = (pass, label, detail) => { count++; check(pass, label, detail); };

const bytes = (value) => new TextEncoder().encode(value);

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------
console.log("The wire format\n");

{
  const round = decode(encode({ v: 1, kind: "chat", body: "Shall we start?" }));
  t(round?.kind === "chat" && round.body === "Shall we start?",
    "a chat message survives a round trip", JSON.stringify(round));
}
{
  const round = decode(encode({ v: 1, kind: "reaction", emoji: "👏" }));
  t(round?.kind === "reaction" && round.emoji === "👏",
    "a reaction survives a round trip", JSON.stringify(round));
}

// Anything the room can be made to send has to be survivable.
const rejected = [
  ["empty payload", new Uint8Array(0)],
  ["not JSON", bytes("{oh dear")],
  ["a bare array", bytes("[1,2,3]")],
  ["null", bytes("null")],
  ["a number", bytes("42")],
  ["no version", bytes('{"kind":"chat","body":"hi"}')],
  ["a future version", bytes('{"v":2,"kind":"chat","body":"hi"}')],
  ["an unknown kind", bytes('{"v":1,"kind":"eval","body":"hi"}')],
  ["a chat with no body", bytes('{"v":1,"kind":"chat"}')],
  ["a chat whose body is an object", bytes('{"v":1,"kind":"chat","body":{}}')],
  ["a chat that is only whitespace", bytes('{"v":1,"kind":"chat","body":"   "}')],
  // Sanitising empties this one, and an empty message is not a message.
  ["a chat that is only control characters", bytes('{"v":1,"kind":"chat","body":"\\u0000\\u0007"}')],
  ["a reaction outside the six", bytes('{"v":1,"kind":"reaction","emoji":"💀"}')],
  ["a reaction that is an object", bytes('{"v":1,"kind":"reaction","emoji":{}}')],
  // §3.6 fixes six. An arbitrary string is someone probing the renderer.
  ["a reaction that is a script tag", bytes('{"v":1,"kind":"reaction","emoji":"<img src=x onerror=1>"}')],
];
for (const [label, payload] of rejected) {
  t(decode(payload) === null, `rejected: ${label}`, `decoded to ${JSON.stringify(decode(payload))}`);
}

{
  // A packet larger than the cap is dropped before JSON.parse is asked to
  // chew through it.
  const huge = bytes(JSON.stringify({ v: 1, kind: "chat", body: "a".repeat(20_000) }));
  t(decode(huge) === null, "rejected: a payload past the byte cap", `${huge.byteLength} bytes`);
}
{
  // At the limit rather than past it: 1,000 characters must still arrive.
  const full = { v: 1, kind: "chat", body: "b".repeat(CHAT_MAX_LENGTH) };
  const round = decode(encode(full));
  t(round?.body?.length === CHAT_MAX_LENGTH,
    `a full-length ${CHAT_MAX_LENGTH}-character message still arrives`,
    `${round?.body?.length}`);
}
{
  // Over the character limit but under the byte cap — truncated, not dropped.
  const over = bytes(JSON.stringify({ v: 1, kind: "chat", body: "c".repeat(1500) }));
  const round = decode(over);
  t(round?.body?.length === CHAT_MAX_LENGTH,
    "an over-long message is truncated to the limit rather than dropped",
    `${round?.body?.length}`);
}

console.log("\nSanitising a body\n");

// A bidi override survives being rendered as text — it is not markup, so
// escaping does nothing to it. Removing it is the only thing that works.
t(!sanitiseChatBody("Ship it ‮gnihton yaS").includes("‮"),
  "a bidi override is stripped, not escaped");
t(!sanitiseChatBody("in​visible").includes("​"),
  "zero-width characters are stripped");
t(sanitiseChatBody("one\ntwo") === "one\ntwo",
  "newlines survive — Shift+Enter inserts them on purpose",
  JSON.stringify(sanitiseChatBody("one\ntwo")));
t(sanitiseChatBody("a\n\n\n\n\nb") === "a\n\nb",
  "runs of blank lines collapse", JSON.stringify(sanitiseChatBody("a\n\n\n\n\nb")));
t(sanitiseChatBody("  spaced   out  ") === "spaced out",
  "horizontal whitespace collapses and trims");
t(sanitiseChatBody("<script>alert(1)</script>") === "<script>alert(1)</script>",
  "markup is left exactly as typed — it is rendered as text, not escaped here",
  sanitiseChatBody("<script>alert(1)</script>"));

// ---------------------------------------------------------------------------
// Autolinking — rule 6's other half
// ---------------------------------------------------------------------------
console.log("\nAutolinking\n");

const links = (text) => autolink(text).filter((s) => s.kind === "link");
const hrefs = (text) => links(text).map((s) => s.href);

t(hrefs("see https://example.com/x")[0] === "https://example.com/x",
  "an https URL becomes a link", hrefs("see https://example.com/x").join());
t(hrefs("go to www.example.com now")[0] === "https://www.example.com/",
  "a bare www. gets an https scheme, never a relative path",
  hrefs("go to www.example.com now").join());

// None of these is markup, so escaping catches none of them.
//
// Removing the scheme allow-list from `toHref` does not make any of these
// fail, and that is worth stating rather than leaving as a comfortable pass:
// every one of them parses to an *empty hostname*, so the hostname test
// rejects them first. The allow-list is a backstop against gate 1 being
// widened later, not today's active guard. The cases below the list pin the
// gate that is actually load-bearing.
const notLinks = [
  ["javascript:alert(1)", "javascript:"],
  ["JaVaScRiPt:alert(1)", "javascript: in mixed case"],
  ["data:text/html;base64,PHNjcmlwdD4=", "data:"],
  ["vbscript:msgbox(1)", "vbscript:"],
  ["file:///etc/passwd", "file:"],
  ["blob:https://example.com/abc", "blob: wrapping an https URL"],
];
for (const [text, label] of notLinks) {
  t(links(text).length === 0, `not linked: ${label}`, JSON.stringify(hrefs(text)));
}

t(autolink("javascript:alert(1)").map((s) => s.text).join("") === "javascript:alert(1)",
  "and the text is still shown, exactly as typed");

// A URL inside a larger token is not a URL someone shared.
for (const [text, label] of [
  ["mail me at ama@https://example.com", "an https inside an address"],
  ["path/https://example.com", "an https inside a path"],
  ["x-https://example.com", "an https after a hyphen"],
]) {
  t(links(text).length === 0, `not linked: ${label}`, JSON.stringify(hrefs(text)));
}
// Gate 1, pinned directly. These have a real hostname, so nothing downstream
// would stop them — they are rejected because they are never offered as
// candidates at all. Widening the pattern to "any scheme" breaks these and
// nothing else, which is exactly the mistake worth catching.
for (const [text, label] of [
  ["ftp://example.com/file", "ftp://, which has a real hostname"],
  ["ws://example.com/socket", "ws://, likewise"],
  ["chrome://settings", "chrome://"],
]) {
  t(links(text).length === 0, `not linked: ${label}`, JSON.stringify(hrefs(text)));
}

// No test for the hostname guard, deliberately. `http:` and `https:` are
// special schemes: the parser either finds a host or throws, so
// `http:///nowhere` normalises to host `nowhere` rather than to nothing. With
// gate 1 admitting only those two schemes, the hostname guard is unreachable —
// it exists, like the allow-list, for the day the pattern is widened. An
// assertion here would be asserting a state the code cannot reach.

// But ordinary punctuation before one is fine.
t(hrefs("(see https://example.com)")[0] === "https://example.com/",
  "a URL in brackets is still linked", JSON.stringify(hrefs("(see https://example.com)")));

{
  // Trailing punctuation belongs to the sentence.
  const [link] = links("look at https://example.com/page.");
  t(link?.href === "https://example.com/page",
    "a trailing full stop is not part of the URL", link?.href);
}
{
  const segments = autolink("before https://a.example after https://b.example end");
  t(segments.filter((s) => s.kind === "link").length === 2 &&
    segments.filter((s) => s.kind === "text").length === 3,
    "several links interleave with the text between them",
    segments.map((s) => s.kind).join(","));
}
{
  // Reassembly is the property that matters: no character is lost or doubled.
  const text = "hi https://example.com/a and www.b.example — done";
  t(autolink(text).map((s) => s.text).join("") === text,
    "the segments reassemble into exactly the original message");
}
t(autolink("no links here").every((s) => s.kind === "text"),
  "a message with no URL is one text segment");

// ---------------------------------------------------------------------------
// The reaction gate — §3.6
// ---------------------------------------------------------------------------
console.log("\nReactions\n");

t(REACTIONS.length === 6, `six reactions, fixed  (${REACTIONS.join(" ")})`, `${REACTIONS.length}`);

{
  const gate = new Throttle(REACTION_INTERVAL_MS);
  const rapid = [];
  // Someone holding the button down: a press every 50ms for two seconds.
  for (let ms = 0; ms <= 2000; ms += 50) rapid.push(gate.take("ama", ms));
  const passed = rapid.filter(Boolean).length;
  t(passed === 3, "rapid pressing yields one a second, not a stream",
    `${passed} of ${rapid.length} presses passed`);
}
{
  const gate = new Throttle(REACTION_INTERVAL_MS);
  t(gate.take("ama", 0) === true, "the first press always passes");
  t(gate.take("ama", 999) === false, "a press 999ms later is dropped");
  t(gate.take("ama", 1000) === true, "a press at exactly 1000ms passes");
}
{
  // One person flooding must not silence anyone else — which a single global
  // gate would do, and it would look exactly like the product being broken.
  const gate = new Throttle(REACTION_INTERVAL_MS);
  gate.take("ama", 0);
  t(gate.take("kwabena", 10) === true,
    "the gate is per participant, so one flooder cannot mute the room");
  t(gate.take("ama", 10) === false, "while the flooder is still gated");
}
{
  const gate = new Throttle(REACTION_INTERVAL_MS);
  gate.take("ama", 0);
  gate.forget("ama");
  t(gate.take("ama", 10) === true, "a participant who left is forgotten");
}
{
  // Dropped, not queued: nothing accumulates to be released later.
  const gate = new Throttle(REACTION_INTERVAL_MS);
  for (let ms = 0; ms < 1000; ms += 10) gate.take("ama", ms);
  const afterTheStorm = [gate.take("ama", 1000), gate.take("ama", 1010), gate.take("ama", 1020)];
  t(afterTheStorm.filter(Boolean).length === 1,
    "extra presses are dropped, not buffered for later",
    `${afterTheStorm.filter(Boolean).length} released at once`);
}
{
  const lanes = [0, 1, 2, 3, 4, 5, 6].map(nextLane);
  t(new Set(lanes.slice(0, REACTION_LANES)).size === REACTION_LANES,
    `simultaneous reactions take ${REACTION_LANES} distinct lanes`, lanes.join(","));
  t(lanes[REACTION_LANES] === lanes[0], "and wrap rather than drifting off-tile");
}

console.log(`\n${count - failed}/${count} chat checks passed.`);
if (failed) process.exit(1);
