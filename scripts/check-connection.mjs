#!/usr/bin/env node
/**
 * §3.11's decision table, and the assumption it rests on.
 *
 * Two different things are checked here, and the second is the one that would
 * otherwise rot silently.
 *
 * The mapping itself is arithmetic over a small enum and is easy to get subtly
 * wrong at exactly one value — `ConnectionQuality.Unknown`, which is what the
 * SDK seeds every participant to and what they reset to after a reconnect.
 * `ParticipantsPanel` shipped in Phase 7 testing quality negatively, so it
 * renders amber "Unstable connection" for every participant on join. The
 * `unknown` cases below exist because of that bug, not in anticipation of it.
 *
 * The assumption is that our string literals still equal LiveKit's enum values.
 * `lib/room/connection.ts` deliberately does not import `livekit-client` —
 * both enums are string enums, so plain strings lose nothing and the module
 * stays pure. The cost is that a library upgrade renaming a value would leave
 * every reading falling through to "none" and every degraded state rendering
 * as healthy, with no symptom whatsoever. That is the failure this phase is
 * named after, so three separate gates cover it — see the note above that
 * section for which one catches what, and how each was measured.
 *
 * `ConnectionQuality.Poor` is not reachable by any local test — quality is the
 * server's verdict, delivered over the signalling socket, so killing the
 * network produces no updates rather than a bad one. The mapping below is the
 * only place it is ever exercised. See BUILD-PLAN's untested-paths table.
 *
 * Run with: npm run check:connection
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "parley-connection-"));
try {
  execFileSync(
    "npx",
    ["tsc", "lib/room/connection.ts",
     "--outDir", out, "--module", "commonjs",
     "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile lib/room/connection.ts:\n" + e.stdout?.toString());
  process.exit(1);
}
writeFileSync(join(out, "package.json"), '{"type":"commonjs"}');
const require = createRequire(join(out, "index.cjs"));
const {
  treatmentFor,
  phaseFor,
  isDegraded,
  announcementFor,
  barTone,
  BAR_COPY,
  TILE_COPY,
  DEFAULT_RETRY_DELAYS_MS,
  RETRY_BUDGET_MS,
} = require(join(out, "connection.js"));
rmSync(out, { recursive: true, force: true });

let failed = 0;
const check = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${label}${pass ? "" : `  — ${detail}`}`);
};
let count = 0;
const t = (pass, label, detail) => { count++; check(pass, label, detail); };

// ---------------------------------------------------------------------------
// The module actually loaded — a vacuity guard.
// ---------------------------------------------------------------------------
console.log("§3.11's decision table\n");

t(typeof treatmentFor === "function" && typeof phaseFor === "function",
  "the module compiled and its functions are callable",
  `treatmentFor=${typeof treatmentFor} phaseFor=${typeof phaseFor}`);

// ---------------------------------------------------------------------------
// Quality → tile treatment. Every value, including the two §3.11 omits.
// ---------------------------------------------------------------------------
console.log("\nQuality → tile\n");

t(treatmentFor("excellent") === "none", "excellent shows nothing — silence means fine");
t(treatmentFor("good") === "none", "good shows nothing");
t(treatmentFor("poor") === "poor", "poor gets the amber pill");
t(treatmentFor("lost") === "lost", "lost dims the tile");

// The load-bearing one. Delete the `unknown` arm of treatmentFor and only this
// fails — which is the point, because the negative form of this function looks
// correct and puts a warning on every participant at join.
t(treatmentFor("unknown") === "none",
  "unknown shows nothing — it is the seed value for every participant",
  treatmentFor("unknown"));

// ---------------------------------------------------------------------------
// State + quality → room phase.
// ---------------------------------------------------------------------------
console.log("\nState + quality → room phase\n");

t(phaseFor("connected", "excellent") === "healthy", "connected and excellent is healthy");
t(phaseFor("connected", "good") === "healthy", "connected and good is healthy");
t(phaseFor("connected", "unknown") === "healthy",
  "connected and unknown is healthy — not a degraded state",
  phaseFor("connected", "unknown"));
t(phaseFor("connected", "poor") === "unstable", "connected and poor is unstable");
t(phaseFor("connected", "lost") === "lost", "connected and lost is §3.11's Lost (local)");

t(phaseFor("reconnecting", "excellent") === "reconnecting",
  "reconnecting leads, whatever the last quality reading said");
t(phaseFor("reconnecting", "lost") === "reconnecting",
  "and it still leads when quality agrees");
t(phaseFor("signalReconnecting", "excellent") === "signal",
  "signalReconnecting is its own phase, not silence",
  phaseFor("signalReconnecting", "excellent"));
t(phaseFor("disconnected", "excellent") === "failed", "disconnected is failed");

// Connecting must not read as degraded, or every join looks like a failure.
t(phaseFor("connecting", "unknown") === "healthy",
  "connecting is healthy — RoomStage owns that screen",
  phaseFor("connecting", "unknown"));

t(isDegraded("healthy") === false && isDegraded("signal") === true,
  "isDegraded agrees with the phase set");

// ---------------------------------------------------------------------------
// §9: announced once per change, never per retry.
// ---------------------------------------------------------------------------
console.log("\nAnnouncements\n");

t(announcementFor("reconnecting", "healthy") === "Connection lost. Reconnecting.",
  "a drop is announced");
t(announcementFor("reconnecting", "reconnecting") === null,
  "and not announced again while it stands — this is the once-per-change gate",
  String(announcementFor("reconnecting", "reconnecting")));
t(announcementFor("healthy", "reconnecting") === "Connection restored.",
  "recovery is announced too — nothing fails silently cuts both ways");
t(announcementFor("healthy", null) === null,
  "but nothing is announced on first render",
  String(announcementFor("healthy", null)));
t(announcementFor("healthy", "failed") === null,
  "and nothing claims restoration after a state nobody was told to expect back");

// Every degraded phase must have something to say. A phase added later with no
// entry would announce `undefined`, which a screen reader reads aloud.
for (const phase of ["unstable", "lost", "signal", "reconnecting", "failed"]) {
  t(typeof announcementFor(phase, "healthy") === "string" &&
    announcementFor(phase, "healthy").length > 0,
    `${phase} has an announcement`, String(announcementFor(phase, "healthy")));
  t(typeof BAR_COPY[phase] === "string" && BAR_COPY[phase].length > 0,
    `${phase} has bar copy`, String(BAR_COPY[phase]));
}

// ---------------------------------------------------------------------------
// Copy, against CLAUDE.md's vocabulary table.
// ---------------------------------------------------------------------------
console.log("\nCopy\n");

const allCopy = [...Object.values(BAR_COPY), ...Object.values(TILE_COPY)];
const banned = /\b(call|conference|session|attendee|invite URL|meeting ID|PIN)\b/i;
const offender = allCopy.find((s) => banned.test(s));
t(offender === undefined,
  "no banned vocabulary in any connection copy", String(offender));

t(TILE_COPY.poor === "Unstable connection",
  "the tile and the participants panel spell the same fact the same way",
  TILE_COPY.poor);

// ---------------------------------------------------------------------------
// Hue is spent only where rule 5 permits it.
// ---------------------------------------------------------------------------
console.log("\nTone\n");

t(barTone("healthy") === null, "a healthy room has no bar and no hue");
t(barTone("unstable") === "warning" && barTone("signal") === "warning",
  "warnings are amber");

// §3.11 puts `lost` with the warnings, not the critical states: it is the gap
// before a retry has started, and "do not jump to critical for a state that may
// resolve without a retry". Pinned because the obvious reading of the name puts
// it the other way.
t(barTone("lost") === "warning",
  "quality-lost-before-retry is amber, not critical",
  String(barTone("lost")));

t(barTone("reconnecting") === "critical" && barTone("failed") === "critical",
  "a meeting that has actually stopped is critical");

// And the copy matches, because §3.11 says "same language as Poor".
t(BAR_COPY.lost === BAR_COPY.unstable,
  "and it speaks the same language as Poor",
  `${BAR_COPY.lost} / ${BAR_COPY.unstable}`);

// The signal bar names what was measured to break, not what sounds plausible.
t(/won't arrive/.test(BAR_COPY.signal) && /join or leave/.test(BAR_COPY.signal),
  "the signal bar names both halves of what was observed to stop",
  BAR_COPY.signal);
t(!/[Cc]hat and reactions are (un)?available/.test(BAR_COPY.signal),
  "and does not repeat the claim the probe disproved",
  BAR_COPY.signal);

// ---------------------------------------------------------------------------
// The vendored retry schedule, against the SDK's own.
// ---------------------------------------------------------------------------
console.log("\nThe retry policy\n");

const sdk = readFileSync(
  "node_modules/livekit-client/dist/livekit-client.esm.mjs", "utf8",
);
const maxMatch = sdk.match(/const maxRetryDelay = (\d+)/);
const arrayMatch = sdk.match(/const DEFAULT_RETRY_DELAYS_IN_MS = \[([^\]]+)\]/);

t(Boolean(maxMatch && arrayMatch),
  "the SDK's retry schedule is still where we read it from",
  "DEFAULT_RETRY_DELAYS_IN_MS or maxRetryDelay not found — the vendored copy below is now unverified");

if (maxMatch && arrayMatch) {
  const maxRetryDelay = Number(maxMatch[1]);
  // The source writes the middle terms as products; evaluate them the same way
  // rather than re-deriving, so a change of form is a mismatch we notice.
  const actual = arrayMatch[1]
    .split(",")
    .map((term) => term.replace(/maxRetryDelay/g, String(maxRetryDelay)))
    .map((term) => term.split("*").reduce((a, b) => a * Number(b.trim()), 1));

  t(actual.length === DEFAULT_RETRY_DELAYS_MS.length &&
    actual.every((v, i) => v === DEFAULT_RETRY_DELAYS_MS[i]),
    "our vendored copy of the retry delays matches the SDK's",
    `sdk=${JSON.stringify(actual)} ours=${JSON.stringify([...DEFAULT_RETRY_DELAYS_MS])}`);

  const sum = actual.reduce((a, b) => a + b, 0);
  t(sum === RETRY_BUDGET_MS,
    "and RETRY_BUDGET_MS is their sum",
    `sum=${sum} RETRY_BUDGET_MS=${RETRY_BUDGET_MS}`);

  // The acceptance criterion is a ten-second outage recovering. That only holds
  // if the policy has attempts left well past ten seconds.
  let elapsed = 0;
  let attemptsWithinTenSeconds = 0;
  for (const delay of actual) {
    elapsed += delay;
    if (elapsed <= 10_000) attemptsWithinTenSeconds++;
  }
  t(attemptsWithinTenSeconds >= 5 && sum > 10_000,
    "a ten-second outage is well inside the policy — several attempts remain",
    `${attemptsWithinTenSeconds} attempts inside 10s, ${sum}ms total`);
}

// ---------------------------------------------------------------------------
// The literals, against the SDK's enums.
//
// Three gates cover this, and they are not interchangeable — measured by
// mutating each one:
//
//   1. `tsc` catches a one-sided drift. Renaming a comparison but not the
//      union is TS2367 and the script exits before any check runs.
//   2. The phase and treatment cases above catch a *consistent* rename, which
//      compiles cleanly. They pass the SDK's literal strings in and assert a
//      specific result, so a union that no longer contains "signalReconnecting"
//      fails "signalReconnecting is its own phase" — verified by mutation.
//   3. This section catches the SDK changing underneath us, which neither of
//      the others can see: `ourStates` here is hand-written, so it pins the
//      library's values rather than our module's.
//
// Together they cover both directions. Separately, each one is blind to what
// the others catch.
// ---------------------------------------------------------------------------
console.log("\nLiveKit's enums, against what we assume they are\n");

const enumValues = (name) => {
  const d = readFileSync(
    name === "ConnectionQuality"
      ? "node_modules/livekit-client/dist/src/room/participant/Participant.d.ts"
      : "node_modules/livekit-client/dist/src/room/Room.d.ts",
    "utf8",
  );
  const block = d.match(new RegExp(`declare enum ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!block) return null;
  return [...block[1].matchAll(/=\s*"([^"]+)"/g)].map((m) => m[1]).sort();
};

const qualities = enumValues("ConnectionQuality");
const states = enumValues("ConnectionState");

t(qualities !== null && states !== null,
  "both enums are still declared where we read them",
  `quality=${qualities} state=${states}`);

if (qualities && states) {
  const ours = ["excellent", "good", "lost", "poor", "unknown"];
  t(qualities.length === ours.length && qualities.every((v, i) => v === ours[i]),
    "every ConnectionQuality value has a treatment",
    `sdk=${JSON.stringify(qualities)} ours=${JSON.stringify(ours)}`);

  // Not just that they match: that treatmentFor accepts each one and none
  // falls through to a treatment by accident.
  for (const q of qualities) {
    const treatment = treatmentFor(q);
    t(["none", "poor", "lost"].includes(treatment),
      `treatmentFor("${q}") returns a real treatment`, String(treatment));
  }

  const ourStates = [
    "connected", "connecting", "disconnected", "reconnecting", "signalReconnecting",
  ];
  t(states.length === ourStates.length && states.every((v, i) => v === ourStates[i]),
    "every ConnectionState value has a phase",
    `sdk=${JSON.stringify(states)} ours=${JSON.stringify(ourStates)}`);

  for (const s of states) {
    const phase = phaseFor(s, "unknown");
    t(["healthy", "unstable", "lost", "signal", "reconnecting", "failed"].includes(phase),
      `phaseFor("${s}", …) returns a real phase`, String(phase));
  }
}

// ---------------------------------------------------------------------------
// Rule 4, as amended: hue needs more than a scrim.
//
// "Hued state indicators therefore sit on an opaque chip at `--popover`, never
// on the scrim." The measured reason is that the scrim composited over white
// video resolves to about #515355, where --state-warning is 3.79:1 and
// --state-critical 2.53:1.
//
// `check:contrast` cannot catch this: ALL_SURFACES in lib/contrast-rules.ts is
// seven opaque tokens and --scrim is not among them, so the matrix passes
// 24/24 today and would still pass with a 2.53:1 label shipped. Until the
// contrast matrix learns about composited surfaces, this scan is what holds
// the rule — a source check rather than a colour computation, which is weaker,
// and worth naming as weaker.
// ---------------------------------------------------------------------------
console.log("\nRule 4: hue is never carried on the scrim\n");

{
  const files = readdirSync("components/room")
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ["components/room/" + f, readFileSync("components/room/" + f, "utf8")]);

  t(files.length > 0, "the room components were found to scan", String(files.length));

  const offenders = [];
  for (const [name, raw] of files) {
    // A rule quoted in a comment is not a rule broken in code. This suite has
    // tripped on its own documentation before.
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Same style block carrying both a state hue and the scrim.
    for (const block of source.matchAll(/style=\{\{[\s\S]*?\}\}/g)) {
      const hasHue = /--state-(critical|warning)/.test(block[0]);
      const hasScrim = /--scrim/.test(block[0]);
      if (hasHue && hasScrim) offenders.push(name);
    }
  }
  t(offenders.length === 0,
    "no room component paints a state hue onto the scrim",
    [...new Set(offenders)].join(", "));

  // And the two surfaces this phase adds are on the chip the rule names.
  for (const file of ["ConnectionPill.tsx", "ConnectionBar.tsx"]) {
    const raw = readFileSync("components/room/" + file, "utf8");
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    t(/background:\s*"var\(--popover\)"/.test(source),
      `${file} sits on an opaque --popover chip`,
      "rule 4: hued state indicators never sit on the scrim");
  }
}

// ---------------------------------------------------------------------------
// The LiveKit webhook.
//
// **Source scans, and weaker than the rest of this file.** The route needs a
// publicly reachable URL and a signed request from LiveKit's servers, so no
// check in this repo can exercise it without a tunnel or a deployed preview —
// which is why ACCOUNTS.md told Austine to skip that dashboard screen. What can
// be pinned is the shape: that the signature is verified, that the secret does
// not travel to a client, and that a finished room cannot quietly overwrite a
// cancellation.
//
// That last one is the reason this section exists at all. §3.2 spent a
// migration and a whole join-page state separating cancelled from ended
// because conflating them makes the product lie; a `room_finished` update
// without its `neq` would undo that silently, for the exact meeting someone
// cancelled and a straggler had already opened.
// ---------------------------------------------------------------------------
// §3.11: "Rejoin now and Leave are live throughout, not revealed after the
// tenth attempt." Which states count as "throughout" is the load-bearing part,
// and getting it wrong is invisible until someone is stuck in one of them.
console.log("\nThe way out\n");

{
  const raw = readFileSync("components/room/ConnectionBar.tsx", "utf8");
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const line = source.match(/const escapable = ([^;]+);/);
  t(Boolean(line), "ConnectionBar declares which phases offer a way out",
    "the escapable expression was not found");
  if (line) {
    const expr = line[1];
    t(/"signal"/.test(expr) && /"reconnecting"/.test(expr),
      "both retrying states offer Rejoin and Leave",
      expr);
    t(!/"lost"/.test(expr),
      "and the pre-retry gap does not — there is no countdown to interrupt yet",
      expr);
  }
}

console.log("\nThe webhook, by inspection\n");

{
  const path = "app/api/livekit/webhook/route.ts";
  const raw = readFileSync(path, "utf8");
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  t(source.length > 0, "the webhook route exists and was read", path);

  t(/^import "server-only";/m.test(source),
    "it imports server-only — rule 8d, a build error rather than a leak");

  t(/new WebhookReceiver\(/.test(source),
    "it verifies the signature with WebhookReceiver rather than trusting the body");

  // `receive(body, auth, skipAuth)` — a truthy third argument turns the
  // signature check off entirely, which is exactly the shape of a debugging
  // shortcut that survives into a commit.
  t(!/receive\([^)]*,\s*true/.test(source),
    "and never passes skipAuth", "signature verification is disabled");

  t(/await request\.text\(\)/.test(source) && !/await request\.json\(\)/.test(source),
    "it reads the raw body — the signature covers bytes, not a reparse");

  const finished = source.slice(source.indexOf('"room_finished"'));
  t(/\.neq\("status",\s*"cancelled"\)/.test(finished),
    "a finished room never overwrites a cancellation",
    "§3.2 separated cancelled from ended deliberately; this would silently undo it");

  const started = source.slice(
    source.indexOf('"room_started"'), source.indexOf('"room_finished"'),
  );
  t(/\.is\("started_at",\s*null\)/.test(started),
    "started_at is written once, so it means when the meeting began",
    "§3.2's 12h expiry reads started_at to mean never joined");
}

console.log(`\n${count - failed}/${count} connection checks passed.`);
if (failed) process.exit(1);
