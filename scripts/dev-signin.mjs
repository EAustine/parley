#!/usr/bin/env node
/**
 * A one-time sign-in link for the local app, so the screens behind auth can
 * actually be looked at.
 *
 * Every authed surface — the dashboard, the schedule form, a meeting's own page
 * — is unreachable in a browser without a session, and magic links arrive by
 * email. This mints one directly, the same way `check-meetings.mjs` does.
 *
 * **Refuses unless `NEXT_PUBLIC_APP_URL` points at localhost**, the same guard
 * `seed-dev.mjs` carries and for a stronger reason: the output is a working
 * credential for whatever account is named. Pointed at production it would
 * print a way into a real one.
 *
 * The link is single-use and short-lived, and it is for the developer's own
 * account on their own machine. It is still a credential — do not paste it
 * anywhere but the address bar.
 *
 * Run with: npm run dev:signin -- you@example.com
 */

const APP = process.env.NEXT_PUBLIC_APP_URL ?? "";
const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!APP || !SB || !SERVICE) {
  console.error("Missing configuration. Run via `npm run dev:signin`.");
  process.exit(1);
}

let host;
try {
  host = new URL(APP).hostname;
} catch {
  console.error(`NEXT_PUBLIC_APP_URL is not a URL: ${APP}`);
  process.exit(1);
}
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(
    `Refusing to run: NEXT_PUBLIC_APP_URL is ${host}, not localhost.\n` +
      "This prints a working sign-in link, so it is local-only by design.",
  );
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run dev:signin -- you@example.com");
  process.exit(1);
}

const response = await fetch(`${SB}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type: "magiclink",
    email,
    redirect_to: `${APP}/auth/callback?next=/dashboard`,
  }),
});

if (!response.ok) {
  console.error(`generate_link failed: HTTP ${response.status}`);
  process.exit(1);
}

const link = await response.json();
if (!link.hashed_token) {
  console.error("generate_link returned no token.");
  process.exit(1);
}

const url =
  `${APP}/auth/callback?token_hash=${link.hashed_token}` +
  `&type=${link.verification_type}&next=%2Fdashboard`;

console.log(`Sign in as ${email} — single use, opens the dashboard:\n`);
console.log(url);
