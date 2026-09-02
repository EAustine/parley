#!/usr/bin/env node
/**
 * The permission-state classifier.
 *
 * §3.3 lists six states and BUILD-PLAN says to test each by manipulating
 * browser settings rather than faking state. Two of them — "not yet asked" and
 * "blocked" — were confirmed that way in a real browser. The other four cannot
 * be produced from a script: you cannot unplug a webcam, hold it open from
 * another application, or close a permission prompt programmatically.
 *
 * What can be checked exactly is the mapping that decides which state you see,
 * and that is where the mistakes are. `getUserMedia` reports several distinct
 * situations through one error name, and getting `NotAllowedError` wrong sends
 * someone who merely clicked away to a browser settings page.
 *
 * Run with: npm run check:permissions
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = mkdtempSync(join(tmpdir(), "parley-perm-"));
try {
  execFileSync(
    "npx",
    ["tsc", "lib/media/classify.ts", "--outDir", out, "--module", "esnext",
     "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
    { stdio: "pipe" },
  );
} catch (e) {
  console.error("Could not compile lib/media/classify.ts:\n" + e.stdout?.toString());
  process.exit(1);
}
renameSync(join(out, "classify.js"), join(out, "classify.mjs"));
const { classifyMediaError } = await import(
  pathToFileURL(join(out, "classify.mjs")).href
);
rmSync(out, { recursive: true, force: true });

const err = (name) => Object.assign(new Error(name), { name });

const cases = [
  // §3.3, in order.
  ["camera unplugged",            err("NotFoundError"),        null,      "no-device"],
  ["requested device is gone",    err("OverconstrainedError"), null,      "no-device"],
  ["another app holds the camera", err("NotReadableError"),    null,      "in-use"],
  ["capture aborted",             err("AbortError"),           null,      "in-use"],
  ["page is not HTTPS",           err("SecurityError"),        null,      "insecure"],

  // The pair that shares one error name, and needs different copy.
  ["refused, browser remembers",  err("NotAllowedError"),      "denied",  "denied"],
  ["prompt closed unanswered",    err("NotAllowedError"),      "prompt",  "dismissed"],
  ["legacy alias, refused",       err("PermissionDeniedError"),"denied",  "denied"],

  // Firefox exposes no `camera` permission descriptor, so the hint is absent.
  // The kinder reading wins: offer a retry that works rather than send someone
  // to a settings page for a permission they never refused.
  ["no Permissions API",          err("NotAllowedError"),      null,      "dismissed"],
  ["hint says granted, yet it threw", err("NotAllowedError"),  "granted", "dismissed"],

  // Anything unrecognised errs towards the state that does not promise a
  // retry will help.
  ["unknown error name",          err("TypeError"),            null,      "denied"],
  ["not an Error at all",         "something",                 null,      "denied"],
];

let failed = 0;
for (const [label, error, hint, expected] of cases) {
  const actual = classifyMediaError(error, hint);
  const pass = actual === expected;
  if (!pass) failed++;
  console.log(
    `${pass ? "✔" : "✘"} ${label.padEnd(34)} → ${actual}${pass ? "" : `  (expected ${expected})`}`,
  );
}

// Every state the UI can render must be reachable, or there is copy nobody
// will ever see.
const reachable = new Set(cases.map(([, e, h]) => classifyMediaError(e, h)));
const expectedStates = ["no-device", "in-use", "insecure", "denied", "dismissed"];
const missing = expectedStates.filter((s) => !reachable.has(s));
console.log(
  `${missing.length === 0 ? "✔" : "✘"} every error-derived state is reachable` +
    (missing.length ? `  — never produced: ${missing.join(", ")}` : ""),
);
if (missing.length) failed++;

console.log(`\n${cases.length + 1 - failed}/${cases.length + 1} classifier checks passed.`);
if (failed) process.exit(1);
