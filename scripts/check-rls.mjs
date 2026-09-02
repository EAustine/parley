#!/usr/bin/env node
/**
 * Proves row level security, against the live project.
 *
 * The whole test rests on one decision: every read is made with a *user's own
 * JWT*, never the service-role key. The service role bypasses RLS entirely, so
 * a test written with it passes whether the policies exist or not. The service
 * role is used here only to create and delete the two fixture users, which is
 * the one thing it legitimately does.
 *
 * The second decision is what counts as a pass. PostgREST does not refuse a
 * forbidden read — it filters it, and returns 200 with an empty array. A test
 * asserting on 403 would pass for the wrong reason today and start failing the
 * day the behaviour is correct. So: pass means Alice sees exactly her own row
 * and zero of Bob's.
 *
 * Run with: npm run check:rls
 *
 * Credentials arrive through `node --env-file=.env.local`, not by reading the
 * file. Nothing here ever holds the file's contents as a string, so there is
 * nothing to accidentally log. `scripts/check-env.mjs` is the only script that
 * opens it, because reporting on it is its whole job — and it prints variable
 * names and verdicts, never values.
 */

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(
      `${name} is not set. Run this through npm run check:rls, which supplies --env-file.`,
    );
    process.exit(1);
  }
  return value;
}

const URL_ = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const ANON = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = required("SUPABASE_SERVICE_ROLE_KEY");

const results = [];
const record = (pass, name, detail = "") => {
  results.push({ pass, name, detail });
  console.log(`${pass ? "✔" : "✘"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const admin = (path, init = {}) =>
  fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

/** A request made as a signed-in user — their token, the publishable key. */
const asUser = (token, path, init = {}) =>
  fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

const stamp = process.env.RLS_RUN_ID ?? String(process.hrtime.bigint());
const password = `Test-${stamp}-Aa1!`;

async function createUser(label) {
  const email = `rls-${label}-${stamp}@example.com`;
  const r = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!r.ok) throw new Error(`create ${label}: ${r.status} ${await r.text()}`);
  const user = await r.json();

  // Sign in the ordinary way to obtain a real user JWT.
  const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!t.ok) throw new Error(`sign in ${label}: ${t.status} ${await t.text()}`);
  const { access_token } = await t.json();
  return { id: user.id, email, token: access_token };
}

let alice, bob;
try {
  alice = await createUser("alice");
  bob = await createUser("bob");
  record(true, "two fixture users created and signed in");

  // Each user creates a meeting as themselves, through RLS.
  const make = async (user, code, title) => {
    const r = await asUser(user.token, "/rest/v1/meetings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ code, title, host_id: user.id }),
    });
    if (!r.ok) throw new Error(`insert for ${user.email}: ${r.status} ${await r.text()}`);
    return (await r.json())[0];
  };

  const aliceMeeting = await make(alice, `rls-a-${stamp}`.slice(0, 24), "Alice's meeting");
  const bobMeeting = await make(bob, `rls-b-${stamp}`.slice(0, 24), "Bob's meeting");
  record(true, "each user inserted a meeting under their own identity");

  // 0. Control. The same query under three identities.
  //
  // Without this the suite has a silent failure mode: if the inserts had gone
  // nowhere, or the select were malformed, every "sees nothing" assertion below
  // would pass while proving nothing at all. The service role bypasses RLS, so
  // it establishes that both rows genuinely exist and the query finds them.
  // Alice and Bob then each see exactly one — theirs. It is the *difference*
  // between these three numbers that is the evidence.
  const bypass = await admin("/rest/v1/meetings?select=id");
  const bypassRows = await bypass.json();
  const aliceCount = (await (await asUser(alice.token, "/rest/v1/meetings?select=id")).json()).length;
  const bobCount = (await (await asUser(bob.token, "/rest/v1/meetings?select=id")).json()).length;
  record(
    bypassRows.length === 2 && aliceCount === 1 && bobCount === 1,
    "control: service role sees both rows, each user sees only their own",
    `service-role ${bypassRows.length}, alice ${aliceCount}, bob ${bobCount}`,
  );

  // 1. The core claim.
  const list = await asUser(alice.token, "/rest/v1/meetings?select=id,host_id");
  const rows = await list.json();
  const ids = rows.map((r) => r.id);
  record(
    list.status === 200 &&
      ids.includes(aliceMeeting.id) &&
      !ids.includes(bobMeeting.id),
    "Alice reads her own meeting and not Bob's",
    `HTTP ${list.status}, ${rows.length} row(s) visible`,
  );

  // 2. Asking for Bob's row by id, which is the attack rather than the accident.
  const direct = await asUser(
    alice.token,
    `/rest/v1/meetings?select=id&id=eq.${bobMeeting.id}`,
  );
  const directRows = await direct.json();
  record(
    direct.status === 200 && Array.isArray(directRows) && directRows.length === 0,
    "Alice asking for Bob's row by id gets an empty result, not an error",
    `HTTP ${direct.status}, ${directRows.length} row(s)`,
  );

  // 3. Writes, not just reads.
  const patch = await asUser(
    alice.token,
    `/rest/v1/meetings?id=eq.${bobMeeting.id}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title: "seized" }) },
  );
  const patched = await patch.json();
  record(
    Array.isArray(patched) && patched.length === 0,
    "Alice cannot update Bob's meeting",
    `${Array.isArray(patched) ? patched.length : "?"} row(s) affected`,
  );

  const del = await asUser(alice.token, `/rest/v1/meetings?id=eq.${bobMeeting.id}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  const deleted = await del.json();
  record(
    Array.isArray(deleted) && deleted.length === 0,
    "Alice cannot delete Bob's meeting",
    `${Array.isArray(deleted) ? deleted.length : "?"} row(s) affected`,
  );

  // 4. Inserting a row owned by someone else must be refused by WITH CHECK.
  const forge = await asUser(alice.token, "/rest/v1/meetings", {
    method: "POST",
    body: JSON.stringify({ code: `rls-f-${stamp}`.slice(0, 24), title: "forged", host_id: bob.id }),
  });
  record(
    forge.status === 403 || forge.status === 401,
    "Alice cannot insert a meeting owned by Bob",
    `HTTP ${forge.status}`,
  );

  // 5. Anonymous access to the table at all.
  const anon = await fetch(`${URL_}/rest/v1/meetings?select=id`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const anonRows = await anon.json();
  record(
    anon.status === 200 && Array.isArray(anonRows) && anonRows.length === 0,
    "anonymous reads see no meetings at all",
    `HTTP ${anon.status}, ${anonRows.length} row(s)`,
  );

  // 6. The security definer function: the deliberate hole. It must open exactly
  //    as far as its six columns and no further.
  const rpc = await fetch(`${URL_}/rest/v1/rpc/get_meeting_by_code`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: aliceMeeting.code }),
  });
  const rpcRows = await rpc.json();
  const row = Array.isArray(rpcRows) ? rpcRows[0] : null;
  record(
    rpc.status === 200 && row?.code === aliceMeeting.code,
    "get_meeting_by_code returns the meeting to an anonymous caller",
    `HTTP ${rpc.status}`,
  );

  const expectedCols = ["code", "title", "status", "scheduled_start", "timezone", "guests_allowed"];
  const actualCols = row ? Object.keys(row).sort() : [];
  record(
    JSON.stringify(actualCols) === JSON.stringify([...expectedCols].sort()),
    "get_meeting_by_code leaks nothing beyond its six columns",
    row ? `returned: ${Object.keys(row).join(", ")}` : "no row",
  );
  record(
    row !== null && !("host_id" in row) && !("id" in row) && !("settings" in row),
    "no host_id, no row id, no settings in the anonymous payload",
  );

  // 7. An ended meeting must fall out of the function's WHERE clause.
  await admin(`/rest/v1/meetings?id=eq.${aliceMeeting.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "ended" }),
  });
  const ended = await fetch(`${URL_}/rest/v1/rpc/get_meeting_by_code`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: aliceMeeting.code }),
  });
  const endedRows = await ended.json();
  record(
    Array.isArray(endedRows) && endedRows.length === 0,
    "get_meeting_by_code refuses an ended meeting",
    `${Array.isArray(endedRows) ? endedRows.length : "?"} row(s)`,
  );

  // 8. Participants are reachable only through a meeting you host.
  const part = await admin("/rest/v1/meeting_participants", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      meeting_id: bobMeeting.id,
      display_name: "Someone in Bob's meeting",
      identity: `guest_${stamp}`,
    }),
  });
  if (!part.ok) throw new Error(`participant insert: ${part.status} ${await part.text()}`);

  const aliceSees = await asUser(alice.token, "/rest/v1/meeting_participants?select=id");
  const aliceParts = await aliceSees.json();
  record(
    aliceSees.status === 200 && Array.isArray(aliceParts) && aliceParts.length === 0,
    "Alice cannot read participants of Bob's meeting",
    `${Array.isArray(aliceParts) ? aliceParts.length : "?"} row(s)`,
  );

  const bobSees = await asUser(bob.token, "/rest/v1/meeting_participants?select=id");
  const bobParts = await bobSees.json();
  record(
    bobSees.status === 200 && Array.isArray(bobParts) && bobParts.length === 1,
    "Bob can read participants of his own meeting",
    `${Array.isArray(bobParts) ? bobParts.length : "?"} row(s)`,
  );
} catch (error) {
  record(false, "test harness completed", String(error.message).slice(0, 200));
} finally {
  // Fixture users cascade to their meetings and participants.
  for (const u of [alice, bob]) {
    if (u?.id) await admin(`/auth/v1/admin/users/${u.id}`, { method: "DELETE" });
  }
  const leftover = await admin(`/rest/v1/meetings?code=like.rls-*`, { method: "DELETE" });
  void leftover;
}

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} RLS assertions passed.`,
);
if (failed.length) {
  console.error("\nFailed:");
  for (const f of failed) console.error(`  - ${f.name}`);
  process.exit(1);
}
