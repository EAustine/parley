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

const errors = [];
for (const key of required) {
  if (!env[key]) errors.push(`${key} is missing or empty`);
}

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
