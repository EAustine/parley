#!/usr/bin/env node
/**
 * Development fixtures for the dashboard.
 *
 * Three meetings, one of each state the dashboard can render: live, scheduled a
 * few days out, and ended with participants. Fixed codes, so running this twice
 * produces the same three rows rather than nine.
 *
 * The titles are chosen rather than left over. This dashboard ends up in
 * screenshots, and the rule that governs empty-state copy governs its contents
 * too — nothing visible should be accidental. "asdf" in a portfolio shot is the
 * same failure as an undesigned error state, just quieter.
 *
 * Run with: npm run seed:dev
 */

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Run via npm run seed:dev.`);
    process.exit(1);
  }
  return value;
}

const APP_URL = required("NEXT_PUBLIC_APP_URL");

/**
 * The guard, and the reason it is a hard stop.
 *
 * This script deletes every meeting belonging to its host before inserting.
 * Pointed at production that is silent, irreversible data loss — no error, no
 * symptom, just rows gone and someone eventually noticing. Same reasoning as
 * the env leak guard: the failures worth refusing outright are the ones with no
 * runtime symptom.
 */
const host = (() => {
  try {
    return new URL(APP_URL).hostname;
  } catch {
    return null;
  }
})();

if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
  console.error(
    `Refusing to seed: NEXT_PUBLIC_APP_URL points at ${host ?? APP_URL}, not localhost.\n` +
      "This script deletes rows before inserting. Against a real deployment that is\n" +
      "silent data loss. Point NEXT_PUBLIC_APP_URL at localhost and run it again.",
  );
  process.exit(1);
}

const SB = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SERVICE = required("SUPABASE_SERVICE_ROLE_KEY");

const api = (path, init = {}) =>
  fetch(`${SB}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

// --- whose dashboard? -------------------------------------------------------

const wanted = process.env.SEED_EMAIL;
const { users = [] } = await api("/auth/v1/admin/users?per_page=200").then((r) =>
  r.json(),
);

// Fixture accounts from the check scripts are never the seed target.
const real = users.filter((u) => !/@example\.com$/.test(u.email));
const target = wanted
  ? real.find((u) => u.email === wanted)
  : real.length === 1
    ? real[0]
    : null;

if (!target) {
  console.error(
    wanted
      ? `No account found for ${wanted}.`
      : real.length === 0
        ? "No account to seed against. Sign in once, then run this again."
        : `Several accounts exist — say which:\n${real.map((u) => `  SEED_EMAIL=${u.email} npm run seed:dev`).join("\n")}`,
  );
  process.exit(1);
}

// --- the fixtures -----------------------------------------------------------

const minutes = (n) => n * 60_000;
const days = (n) => n * 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const now = Date.now();

const FIXTURES = [
  {
    code: "wcz-4npm-hjd",
    title: "Design review",
    description: "Walk through the pre-join states.",
    status: "live",
    scheduled_start: null,
    scheduled_end: null,
    timezone: "Africa/Accra",
    started_at: iso(now - minutes(12)),
    ended_at: null,
    participants: [],
  },
  {
    code: "tgr-6xkv-bqs",
    title: "Roadmap planning",
    description: "Phases 4 through 6.",
    status: "scheduled",
    scheduled_start: iso(now + days(3) + minutes(30)),
    scheduled_end: iso(now + days(3) + minutes(90)),
    timezone: "Europe/Berlin",
    started_at: null,
    ended_at: null,
    participants: [],
  },
  {
    code: "mzn-3fhw-dpy",
    title: "Sprint retro",
    description: null,
    status: "ended",
    scheduled_start: iso(now - days(2)),
    scheduled_end: iso(now - days(2) + minutes(45)),
    timezone: "Africa/Accra",
    started_at: iso(now - days(2)),
    ended_at: iso(now - days(2) + minutes(45)),
    participants: ["Ama", "Kofi", "Yaa"],
  },
];

// --- replace ----------------------------------------------------------------

const existing = await api(
  `/rest/v1/meetings?select=code&host_id=eq.${target.id}`,
).then((r) => r.json());

if (existing.length > 0) {
  const gone = await api(`/rest/v1/meetings?host_id=eq.${target.id}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!gone.ok) {
    console.error(`Could not clear existing meetings: ${gone.status}`);
    process.exit(1);
  }
  console.log(
    `removed ${existing.length} existing meeting(s): ${existing.map((m) => m.code).join(", ")}`,
  );
}

// PostgREST requires identical keys across a bulk insert.
const rows = FIXTURES.map(({ participants, ...row }) => {
  void participants;
  return { ...row, host_id: target.id };
});

const inserted = await api("/rest/v1/meetings", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify(rows),
});
const created = await inserted.json();
if (!inserted.ok) {
  console.error(created);
  process.exit(1);
}

const withParticipants = FIXTURES.filter((f) => f.participants.length > 0);
for (const fixture of withParticipants) {
  const meeting = created.find((m) => m.code === fixture.code);
  await api("/rest/v1/meeting_participants", {
    method: "POST",
    body: JSON.stringify(
      fixture.participants.map((name, i) => ({
        meeting_id: meeting.id,
        user_id: null,
        display_name: name,
        identity: `guest_seed_${fixture.code}_${i}`,
        role: "participant",
        left_at: fixture.ended_at,
      })),
    ),
  });
}

console.log(`seeded ${created.length} meetings for ${target.email}:`);
for (const f of FIXTURES) {
  console.log(`  ${f.code}  ${f.status.padEnd(9)} ${f.title}`);
}
