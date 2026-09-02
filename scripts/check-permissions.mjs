#!/usr/bin/env node
/**
 * The two pure pieces of the pre-join media path.
 *
 * §3.3 lists six states and BUILD-PLAN says to test each by manipulating
 * browser settings rather than faking state — see its manual permission test
 * matrix, which is where the real verification happens. Some of those states
 * cannot be produced from a script at all: you cannot unplug a webcam, hold it
 * open from another application, or close a permission prompt programmatically.
 *
 * What can be checked exactly is the two decisions standing between a person
 * and a working preview, and both are where the mistakes are:
 *
 *   classify.ts  — which state a failure *is*. `getUserMedia` reports several
 *                  distinct situations through one error name, and getting
 *                  `NotAllowedError` wrong sends someone who merely clicked
 *                  away to a browser settings page.
 *   acquire.ts   — what to ask for next when the first ask fails. Hardware
 *                  that was remembered may be gone, and a camera that is gone
 *                  must not take a working microphone with it.
 *
 * Run with: npm run check:permissions
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "parley-perm-"));
try {
  execFileSync(
    "npx",
    ["tsc", "lib/media/classify.ts", "lib/media/acquire.ts", "lib/media/browser-hint.ts",
     "--outDir", out, "--module", "commonjs",
     "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile the media modules:\n" + e.stdout?.toString());
  process.exit(1);
}
// CommonJS so `./classify` resolves without an extension, the way the bundler
// resolves it in the app.
writeFileSync(join(out, "package.json"), '{"type":"commonjs"}');
const require = createRequire(join(out, "index.cjs"));
const { classifyMediaError } = require(join(out, "classify.js"));
const { acquireStream } = require(join(out, "acquire.js"));
const { permissionLocation } = require(join(out, "browser-hint.js"));
rmSync(out, { recursive: true, force: true });

const err = (name) => Object.assign(new Error(name), { name });

let failed = 0;
const check = (pass, label, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "✔" : "✘"} ${label}${pass ? "" : `  — ${detail}`}`);
};

// ---------------------------------------------------------------------------
// classify.ts — which state a failure is
// ---------------------------------------------------------------------------
console.log("Classifying failures\n");

// [label, error, hint, previous state, expected]
const cases = [
  // §3.3, in order.
  ["camera unplugged",            err("NotFoundError"),        null,      null,        "no-device"],
  ["requested device is gone",    err("OverconstrainedError"), null,      null,        "no-device"],
  ["another app holds the camera", err("NotReadableError"),    null,      null,        "in-use"],
  ["capture aborted",             err("AbortError"),           null,      null,        "in-use"],
  ["page is not HTTPS",           err("SecurityError"),        null,      null,        "insecure"],

  // The pair that shares one error name, and needs different copy.
  ["refused, browser remembers",  err("NotAllowedError"),      "denied",  null,        "denied"],
  ["prompt closed unanswered",    err("NotAllowedError"),      "prompt",  null,        "dismissed"],
  ["legacy alias, refused",       err("PermissionDeniedError"),"denied",  null,        "denied"],

  // Firefox exposes no `camera` permission descriptor, so the hint is absent.
  // The kinder reading wins: offer a retry that works rather than send someone
  // to a settings page for a permission they never refused.
  ["no Permissions API",          err("NotAllowedError"),      null,      null,        "dismissed"],
  ["hint says granted, yet it threw", err("NotAllowedError"),  "granted", null,        "dismissed"],

  // Safari. No camera descriptor, so the hint is null however the person
  // answered — and Safari will not re-prompt within a session, so the "Try
  // again" a dismissal offers does nothing at all. The second refusal in a row
  // is the evidence the API won't give: the retry was taken, and it failed
  // identically. This is the divergence BUILD-PLAN's matrix warns about.
  ["Safari, refused once",        err("NotAllowedError"),      null,      "idle",      "dismissed"],
  ["Safari, retry refused too",   err("NotAllowedError"),      null,      "dismissed", "denied"],
  ["Chrome embargo, third dismissal", err("NotAllowedError"),  "denied",  "dismissed", "denied"],

  // Retrying after something that was never a dismissal must not be read as
  // one — a camera that reappears and is then refused is a first refusal.
  ["retry after no-device",       err("NotAllowedError"),      null,      "no-device", "dismissed"],

  // Anything unrecognised errs towards the state that does not promise a
  // retry will help.
  ["unknown error name",          err("TypeError"),            null,      null,        "denied"],
  ["not an Error at all",         "something",                 null,      null,        "denied"],
];

for (const [label, error, hint, previous, expected] of cases) {
  const actual = classifyMediaError(error, hint, previous);
  check(actual === expected, `${label.padEnd(38)} → ${actual}`, `expected ${expected}`);
}

// Every state the UI can render must be reachable, or there is copy nobody
// will ever see.
const reachable = new Set(cases.map(([, e, h, p]) => classifyMediaError(e, h, p)));
const expectedStates = ["no-device", "in-use", "insecure", "denied", "dismissed"];
const missing = expectedStates.filter((s) => !reachable.has(s));
check(missing.length === 0, "every error-derived state is reachable",
      `never produced: ${missing.join(", ")}`);

// ---------------------------------------------------------------------------
// acquire.ts — what to ask for next
// ---------------------------------------------------------------------------
console.log("\nAcquiring a stream\n");

const CAM = "camera-that-is-gone";
const MIC = "mic-that-is-gone";

/**
 * A fake `getUserMedia` standing in for a machine.
 *
 * `camera` and `microphone` name what the machine actually has. Anything else
 * asked for by exact id is `OverconstrainedError`; a kind that is absent
 * entirely is `NotFoundError`, which is what browsers emit when Screen Time
 * has switched the camera off.
 */
function machine({ camera = null, microphone = null, refuse = null } = {}) {
  return async (constraints) => {
    const wanted = (c, have) => {
      if (c === false || c === undefined) return null;
      const exact = typeof c === "object" ? c?.deviceId?.exact : null;
      if (exact) {
        // Constraints before permission. Measured in Chromium: asking for an
        // exact deviceId nobody has throws OverconstrainedError even when
        // permission is already denied.
        if (exact !== have) throw err("OverconstrainedError");
        if (refuse) throw err(refuse);
        return have;
      }
      if (refuse) throw err(refuse);
      if (!have) throw err("NotFoundError");
      return have;
    };
    const video = wanted(constraints.video, camera);
    const audio = wanted(constraints.audio, microphone);
    if (!video && !audio) throw err("NotFoundError");
    return { video, audio };
  };
}

const exactIdsIn = (attempts) =>
  attempts.flatMap((a) =>
    [a.video, a.audio]
      .map((c) => (typeof c === "object" ? c?.deviceId?.exact : null))
      .filter(Boolean),
  );

let acquireChecks = 0;
const acq = (pass, label, detail) => { acquireChecks++; check(pass, label, detail); };

{
  const r = await acquireStream(machine({ camera: "cam", microphone: "mic" }));
  acq(r.stream?.video === "cam" && r.stream?.audio === "mic" && r.attempts.length === 1,
      "a working machine is asked once", `${r.attempts.length} attempts`);
}

{
  const r = await acquireStream(machine({ camera: CAM, microphone: MIC }),
                                { cameraId: CAM, microphoneId: MIC });
  acq(Boolean(r.stream) && r.attempts.length === 1 && !r.forgotDevices,
      "remembered devices that are still here are used as-is",
      `${r.attempts.length} attempts, forgot=${r.forgotDevices}`);
}

{
  // The camera in localStorage was replaced since last time.
  const r = await acquireStream(machine({ camera: "a-different-cam", microphone: MIC }),
                                { cameraId: CAM, microphoneId: MIC });
  acq(r.stream?.video === "a-different-cam" && r.forgotDevices,
      "a remembered device that is gone falls back to what is here",
      `stream=${JSON.stringify(r.stream)} forgot=${r.forgotDevices}`);
  acq(exactIdsIn(r.attempts.slice(1)).length === 0,
      "and the dead id is never asked for again",
      `still asked for ${exactIdsIn(r.attempts.slice(1)).join(", ")}`);
}

{
  // The Screen Time row of BUILD-PLAN's matrix: camera hidden, microphone fine.
  const r = await acquireStream(machine({ camera: null, microphone: "mic" }));
  acq(r.stream?.audio === "mic" && !r.stream?.video,
      "a missing camera does not cost the microphone",
      `stream=${JSON.stringify(r.stream)}`);
}

{
  const r = await acquireStream(machine({ camera: "cam", microphone: null }));
  acq(r.stream?.video === "cam" && !r.stream?.audio,
      "a missing microphone does not cost the camera",
      `stream=${JSON.stringify(r.stream)}`);
}

{
  const r = await acquireStream(machine({}));
  acq(!r.stream && r.error?.name === "NotFoundError",
      "no devices at all reports no-device",
      `stream=${JSON.stringify(r.stream)} error=${r.error?.name}`);
  acq(classifyMediaError(r.error, null, "idle") === "no-device",
      "and that failure classifies as no-device");
}

{
  // A refusal is an answer. Asking twice more spends the browser's patience —
  // Chrome embargoes a permission after repeated prompting, which would turn
  // one dismissal into a lasting block.
  const r = await acquireStream(machine({ refuse: "NotAllowedError" }));
  acq(r.attempts.length === 1 && !r.forgotDevices,
      "a refusal is asked exactly once and forgets nothing",
      `${r.attempts.length} attempts, forgot=${r.forgotDevices}`);
}

{
  // Chrome checks an exact deviceId before it checks permission, so someone
  // who clicked Block *and* has a device remembered fails the first attempt
  // with OverconstrainedError — which looks exactly like hardware that has
  // gone. Their choice must survive the answer they gave.
  const r = await acquireStream(
    machine({ camera: "cam", microphone: "mic", refuse: "NotAllowedError" }),
    { cameraId: CAM, microphoneId: MIC },
  );
  acq(!r.stream && !r.forgotDevices && r.error?.name === "NotAllowedError",
      "a denial with devices remembered keeps the remembered devices",
      `forgot=${r.forgotDevices} error=${r.error?.name}`);
  acq(classifyMediaError(r.error, "denied", "idle") === "denied",
      "and still lands on denied, not no-device");
}

{
  const r = await acquireStream(machine({ refuse: "NotReadableError" }));
  acq(r.attempts.length === 1, "a camera held by another app is not retried",
      `${r.attempts.length} attempts`);
}

{
  // Both failures at once: a remembered camera that has gone, on a machine
  // whose camera is switched off anyway.
  const r = await acquireStream(machine({ camera: null, microphone: "mic" }),
                                { cameraId: CAM });
  acq(r.stream?.audio === "mic" && r.forgotDevices,
      "a dead id and a missing camera still leave a working microphone",
      `stream=${JSON.stringify(r.stream)} forgot=${r.forgotDevices}`);
}

// ---------------------------------------------------------------------------
// browser-hint.ts — where the setting actually lives
// ---------------------------------------------------------------------------
console.log("\nNaming the setting's location\n");

// BUILD-PLAN's matrix: "the copy is the real deliverable in the denied state:
// it must name where the setting lives, and that location differs per
// browser." Chrome's UA contains `Safari/` and Edge's contains `Chrome/`, so
// every one of these is a chance to send someone to the wrong menu.
const uas = [
  ["Chrome, macOS",  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", "Site settings"],
  ["Chrome, Android","Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36", "Site settings"],
  ["Chrome, iOS",    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1", "Site settings"],
  ["Edge, macOS",    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0", "Permissions for this site"],
  ["Firefox, macOS", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0", "More information"],
  ["Safari, macOS",  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "Settings for This Website"],
  // No menu bar on an iPhone, so the desktop Safari instructions name a menu
  // that is not there.
  ["Safari, iOS",    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", "Website Settings"],
];

for (const [label, ua, expected] of uas) {
  const actual = permissionLocation(ua);
  check(actual.includes(expected), `${label.padEnd(16)} → names "${expected}"`, `got: ${actual}`);
}
check(
  permissionLocation(null) === "your browser's site settings",
  "an unknown browser gets a generic but honest fallback",
);
// A location repeated across two different browsers means one of them is
// being sent to a menu it does not have.
const named = uas.map(([, ua]) => permissionLocation(ua));
const distinct = new Set(named).size;
check(distinct === 5, "the five browser families get five distinct locations",
      `${distinct} distinct`);

const total = cases.length + 1 + acquireChecks + uas.length + 2;
console.log(`\n${total - failed}/${total} checks passed.`);
if (failed) process.exit(1);
