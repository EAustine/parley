#!/usr/bin/env node
/**
 * Standalone env check. Runs before dev and in CI without booting Next.
 * Wire up as:  "check:env": "node scripts/check-env.mjs"
 */
import { readFileSync, existsSync } from "node:fs";

const FILE = ".env.local";
if (!existsSync(FILE)) {
  console.error(`Missing ${FILE}. Copy .env.example and fill it in — see ACCOUNTS.md.`);
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const required = [
  "NEXT_PUBLIC_LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
];

/** Values shipped in .env.example that mean "not filled in yet". */
const PLACEHOLDERS = [
  "wss://your-project.livekit.cloud",
  "https://your-ref.supabase.co",
];

const errors = [];
for (const key of required) {
  if (!env[key]) {
    errors.push(`${key} is missing or empty`);
  } else if (PLACEHOLDERS.includes(env[key]) || /your-(project|ref)/.test(env[key])) {
    errors.push(`${key} still holds the .env.example placeholder`);
  } else if (env[key] !== env[key].trim()) {
    errors.push(`${key} has leading or trailing whitespace — a pasting artefact`);
  } else if (/^["'].*["']$/.test(env[key])) {
    errors.push(`${key} is wrapped in quotes; .env values are literal, drop them`);
  } else if (/^(.)\1+$/u.test(env[key])) {
    // The LiveKit dashboard masks the secret until you press Reveal. Copying
    // the masked field yields the right length of the wrong character, which
    // passes every other check here and fails only at the first API call with
    // an unhelpful "invalid token".
    errors.push(
      `${key} is one character repeated ${env[key].length} times — you copied a masked field, not the revealed value`,
    );
  } else if (/[^\x20-\x7E]/.test(env[key])) {
    errors.push(
      `${key} contains non-ASCII characters — credentials are ASCII, so this is a paste artefact (a masked value, a smart quote, or a zero-width character)`,
    );
  }
}

// Shape checks: catch a value pasted into the wrong variable.
if (env.NEXT_PUBLIC_LIVEKIT_URL && !env.NEXT_PUBLIC_LIVEKIT_URL.startsWith("wss://"))
  errors.push("NEXT_PUBLIC_LIVEKIT_URL should start with wss://");
if (env.NEXT_PUBLIC_SUPABASE_URL && !/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL))
  errors.push("NEXT_PUBLIC_SUPABASE_URL should look like https://<20-letter-ref>.supabase.co");
if (env.LIVEKIT_API_KEY && !env.LIVEKIT_API_KEY.startsWith("API"))
  errors.push("LIVEKIT_API_KEY should start with API — you may have the secret here");

const jwtRole = (v) => {
  const p = v?.split(".");
  if (p?.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(p[1], "base64url").toString("utf8"))?.role ?? null;
  } catch {
    return null;
  }
};

for (const [key, value] of Object.entries(env)) {
  if (!key.startsWith("NEXT_PUBLIC_") || !value) continue;
  if (value.startsWith("sb_secret_")) errors.push(`${key} holds a Supabase secret key`);
  if (jwtRole(value) === "service_role") errors.push(`${key} holds a service_role JWT`);
  if (env.LIVEKIT_API_SECRET && value === env.LIVEKIT_API_SECRET)
    errors.push(`${key} holds the LiveKit API secret`);
}

if (env.SUPABASE_SERVICE_ROLE_KEY && jwtRole(env.SUPABASE_SERVICE_ROLE_KEY) === "anon")
  errors.push("SUPABASE_SERVICE_ROLE_KEY holds the anon key — the two are swapped");

if (errors.length) {
  console.error("Environment check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log(`Environment OK — ${required.length} variables present, no secrets in public vars.`);
