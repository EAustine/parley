#!/usr/bin/env node
/**
 * Can a stranger reach the deployed app? — BUILD-PLAN v1.4 / v1.3 A5.
 *
 * > "Vercel enables Standard Protection by default on new deployments,
 * > bouncing anyone who is not a Vercel user with project access to a Vercel
 * > login page… **That is the guest flow, which is the highest-traffic path in
 * > the product and the thing the tagline is about.**"
 *
 * A5 asks for this to be verified "from a device that has never signed into
 * Vercel or Parley". This script is that check, and it is **stronger than the
 * manual version it replaces** — which is the reason it exists rather than a
 * line in `MANUAL.md`.
 *
 * A5's own diagnosis says why: "It is invisible to whoever built the project,
 * because they are signed into Vercel." A browser on the developer's machine
 * carries the exact cookie that hides the defect, so the manual check is
 * performed by the one party who cannot see the thing being checked, and
 * "borrow a phone" is a step that gets skipped. `fetch` here sends no cookies
 * at all: it is a permanently fresh device, every time, with no way to
 * accidentally be signed in.
 *
 * What it cannot do is flip the setting. That is
 * Project → Settings → Deployment Protection → Vercel Authentication →
 * **Disabled**, or a custom domain, which removes it structurally — and both
 * need the dashboard.
 *
 * Run with: npm run check:public:prod
 * or:       npm run check:public -- https://any-deployment.vercel.app
 *
 * **A correction to this file's first version.** It said the URL was an argument
 * because "CLAUDE.md forbids this repo's tooling from reading `.env.local`",
 * and that overstated the rule in both directions. The rule is addressed to
 * *Claude* — "anything you read enters your context and can end up quoted back
 * into the conversation or a commit message" — and nine scripts already run
 * with `--env-file=.env.local` for exactly this reason: the process reads it,
 * the assistant does not. `NEXT_PUBLIC_APP_URL` is not even a secret; it is
 * shipped to every browser in the page's own meta tags.
 *
 * So `check:public:prod` reads it, and the argument stays for the case it was
 * always better at: pointing this at a **preview** deployment, which is where
 * protection is most often left on and which no environment variable names.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const target = (
  process.argv[2] ??
  process.env.PARLEY_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  ""
).replace(/\/$/, "");
if (!target) {
  console.error(
    "Usage: npm run check:public:prod            (reads NEXT_PUBLIC_APP_URL)\n" +
      "   or: npm run check:public -- https://…    (any preview deployment)",
  );
  process.exit(2);
}
if (!/^https?:\/\//.test(target)) {
  console.error(`Not a URL: ${target}`);
  process.exit(2);
}

/**
 * A well-formed code from the real alphabet, compiled from the module rather
 * than typed — `CLAUDE.md`: "Hand-written codes containing `0` or `1` are
 * rejected as malformed before any lookup, so a test using them silently
 * exercises the wrong layer." A malformed code would be refused by our own
 * route before it ever proved anything about Vercel's wall.
 */
const out = mkdtempSync(join(tmpdir(), "parley-public-"));
let CODE_ALPHABET;
try {
  execFileSync(
    "npx",
    ["tsc", "lib/meetings/code.ts", "--outDir", out, "--module", "esnext",
      "--target", "es2022", "--moduleResolution", "bundler"],
    { stdio: "pipe" },
  );
  ({ CODE_ALPHABET } = await import(pathToFileURL(join(out, "code.js")).href));
} finally {
  rmSync(out, { recursive: true, force: true });
}
let at = 0;
const pick = (n) =>
  Array.from(
    { length: n },
    () => CODE_ALPHABET[(at++ * 7 + 3) % CODE_ALPHABET.length],
  ).join("");
// One sequence across the whole code, not three restarts of it — the first
// version produced `dmu-dmu3-dmu`, which is well formed and reads like a bug.
const CODE = `${pick(3)}-${pick(4)}-${pick(3)}`;

/**
 * What a Vercel wall looks like from outside.
 *
 * Matched broadly on purpose: the exact shape has changed across Vercel's own
 * versions (401 with a body, 302 to `vercel.com/sso-api`, a challenge page), and
 * a check that recognises only the shape current on the day it was written is a
 * check that goes quiet later. Anything that is not our own page is a failure
 * here; these patterns only make the *report* specific.
 */
const WALL = [
  /vercel\.com\/(sso|login)/i,
  /_vercel\/sso/i,
  /Authentication Required/i,
  /vercel-sso-nonce/i,
];

/** Ours, and specific enough that a generic 200 cannot pass for it. */
const OURS = [/Parley/, /A link is all anyone needs|Meeting|meeting/i];

async function probe(path, expect) {
  const url = `${target}${path}`;
  let response;
  try {
    // No cookies, no session, no redirect following — the redirect *is* the
    // evidence, and following it would land on a login page and report that.
    response = await fetch(url, { redirect: "manual", headers: { "user-agent": "parley-check-public" } });
  } catch (error) {
    return { url, ok: false, why: `could not be reached — ${error.message}` };
  }

  const location = response.headers.get("location") ?? "";
  const setCookie = response.headers.get("set-cookie") ?? "";
  const body = response.status === 200 ? await response.text() : "";
  const evidence = `${location}\n${setCookie}\n${body.slice(0, 4000)}`;

  const walled = WALL.find((p) => p.test(evidence));
  if (walled || response.status === 401) {
    return {
      url,
      ok: false,
      why:
        `HTTP ${response.status} — this is Vercel's wall, not the app` +
        (location ? `\n    redirected to: ${location.slice(0, 160)}` : "") +
        `\n    Turn it off: Project → Settings → Deployment Protection →` +
        ` Vercel Authentication → Disabled, or add a custom domain.`,
    };
  }

  if (response.status !== 200) {
    return { url, ok: false, why: `HTTP ${response.status}, expected 200` };
  }
  if (!OURS.some((p) => p.test(body))) {
    return { url, ok: false, why: "HTTP 200 but the body is not Parley's page" };
  }
  if (expect && !expect.test(body)) {
    return { url, ok: false, why: `HTTP 200 from Parley, but ${expect} is not in it` };
  }
  return { url, ok: true };
}

if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(target)) {
  console.log(
    `Checking ${target} — a local server, so this says nothing about Deployment\n` +
      "Protection. Useful for proving the check itself works; point it at the\n" +
      "deployment to answer the question A5 asks.\n",
  );
} else {
  console.log(`Checking ${target}\n`);
}

const results = [
  // The landing page — §3.10a, the first thing a stranger meets.
  await probe("/", null),
  /*
   * And a meeting link, which is the flow A5 is actually about. An unknown code
   * is used deliberately: it needs no fixture, and §3.2 requires it to render a
   * *designed* state rather than a 404 — so a 200 carrying our own copy proves
   * both that the wall is down and that the route works for a stranger.
   */
  await probe(`/j/${CODE}`, /isn.t here|another code|meeting/i),
];

let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`✔ ${r.url}`);
  else {
    failed += 1;
    console.log(`✘ ${r.url}\n    ${r.why}`);
  }
}

console.log(
  failed
    ? `\n${failed} of ${results.length} public checks failed. Guests cannot use this deployment.`
    : `\n${results.length}/${results.length} — a signed-out stranger can reach the app.`,
);
process.exit(failed ? 1 : 0);
