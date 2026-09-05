#!/usr/bin/env node
/**
 * The LiveKit webhook — BUILD-PLAN v1.3 A2.
 *
 * A1's symptom points here. `room_started` writes `status = 'live'` and
 * `started_at`; `room_finished` writes `status = 'ended'` and `ended_at`. If
 * those were arriving, a meeting that ran and emptied would have sorted
 * correctly without A1's time fallback needing to exist.
 *
 * A2 asks for three things in order. This settles the third and reports on the
 * first two, because they are the ones a script cannot reach:
 *
 *   1. the route is deployed and reachable at its **production** URL
 *   2. that URL is registered in the **LiveKit project settings**
 *   3. signature verification **passes** rather than silently rejecting
 *
 * "**A webhook that 401s on every delivery looks exactly like one that was
 * never called.**" So (3) is checked by signing a real event with the project's
 * own credentials and watching the database change — the same path LiveKit
 * takes, minus the network. A handler that rejects everything and a handler
 * nothing reaches produce identical dashboards, and only this tells them apart.
 *
 * (2) is dashboard-only: LiveKit Cloud's webhook URL is project configuration
 * and is not exposed through the server SDK. What this *can* do is report the
 * empirical answer — how many meetings have ever been marked started — which
 * is the evidence for whether anything has ever been delivered.
 *
 * Credentials arrive through `node --env-file=.env.local`; nothing here opens
 * the file or prints a value.
 *
 * Run with: npm run check:webhook   (needs npm run dev)
 */
import { createHash, createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const APP = process.env.CHECK_APP_URL ?? "http://localhost:3000";

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Run via npm run check:webhook.`);
    process.exit(1);
  }
  return value;
}

const SB = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SERVICE = required("SUPABASE_SERVICE_ROLE_KEY");
const KEY = required("LIVEKIT_API_KEY");
const SECRET = required("LIVEKIT_API_SECRET");

const results = [];
const check = (pass, name, detail = "") => {
  results.push({ pass, name });
  console.log(`${pass ? "✔" : "✘"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const admin = (path, init = {}) =>
  fetch(`${SB}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

/** Fixture codes come from the real generator, never from the keyboard. */
const codeLib = await (async () => {
  const out = mkdtempSync(join(tmpdir(), "parley-wh-code-"));
  try {
    execFileSync(
      "npx",
      ["tsc", "lib/meetings/code.ts", "--outDir", out, "--module", "esnext",
       "--target", "es2022", "--moduleResolution", "bundler", "--skipLibCheck"],
      { stdio: "pipe" },
    );
    renameSync(join(out, "code.js"), join(out, "code.mjs"));
    return await import(pathToFileURL(join(out, "code.mjs")).href);
  } catch (e) {
    console.error("Could not compile lib/meetings/code.ts:\n" + e.stdout?.toString());
    process.exit(1);
  } finally {
    setTimeout(() => rmSync(out, { recursive: true, force: true }), 0);
  }
})();

/**
 * A LiveKit webhook signature, built the way `WebhookReceiver` verifies it.
 *
 * The header is a JWT issued by the API key and signed with the API secret,
 * carrying a `sha256` claim that is the **base64 of the raw digest** of the
 * body — not hex, and not base64url. `WebhookReceiver.receive` recomputes that
 * digest over the bytes it was given and compares, which is why the route sets
 * `dynamic = "force-dynamic"` and reads `request.text()` before anything
 * parses: re-serialising JSON would change the spacing and break the hash in a
 * way no diff would show.
 *
 * Signed here with node's own `crypto` rather than by reaching into
 * `livekit-server-sdk`'s internals — HS256 is an HMAC over two base64url
 * segments, and rule 9 is not worth spending on ten lines.
 */
function sign(body, secret = SECRET, issuer = KEY) {
  const b64url = (buf) =>
    Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: issuer,
      nbf: now - 10,
      exp: now + 300,
      sha256: createHash("sha256").update(body).digest("base64"),
    }),
  );
  const signature = b64url(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

const event = (name, code, participant) =>
  JSON.stringify({
    event: name,
    id: `EV_${process.hrtime.bigint()}`,
    createdAt: String(Math.floor(Date.now() / 1000)),
    room: {
      sid: `RM_${process.hrtime.bigint()}`,
      name: code,
      emptyTimeout: 300,
      creationTime: String(Math.floor(Date.now() / 1000)),
    },
    ...(participant ? { participant } : {}),
  });

/**
 * A participant as LiveKit sends one — v1.3 A2.
 *
 * `identity` is the shape the token route mints: `user_<uuid>` for a signed-in
 * participant, `guest_<nanoid>` for everyone else. `metadata` is where the
 * token puts the display name and the role, because both are labels.
 */
const participantOf = (identity, name, role = "participant") => ({
  sid: `PA_${process.hrtime.bigint()}`,
  identity,
  name,
  metadata: JSON.stringify({ name, role }),
  joinedAt: String(Math.floor(Date.now() / 1000)),
});

/** Sessions on a meeting, as the two dashboard counts read them. */
const sessionsOf = async (code) => {
  const r = await admin(
    `/rest/v1/meetings?code=eq.${code}&select=joined:meeting_participants(count),here:meeting_participants(count)&here.left_at=is.null`,
  );
  const row = (await r.json())[0] ?? {};
  return {
    joined: row.joined?.[0]?.count ?? 0,
    here: row.here?.[0]?.count ?? 0,
  };
};

const deliver = (body, authorization) =>
  fetch(`${APP}/api/livekit/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/webhook+json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body,
  });

const rowOf = async (code) => {
  const r = await admin(
    `/rest/v1/meetings?code=eq.${code}&select=status,started_at,ended_at`,
  );
  return (await r.json())[0];
};

let user;
let code;
try {
  await fetch(`${APP}/sign-in`).catch(() => {
    throw new Error(`No server at ${APP}. Start it with npm run dev.`);
  });

  // --- a meeting to aim the events at -------------------------------------
  const email = `wh-${process.hrtime.bigint()}@example.com`;
  const link = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email, redirect_to: `${APP}/dashboard` }),
  });
  if (!link.ok) throw new Error(`generate_link: ${link.status}`);
  const link_ = await link.json();
  user = { id: link_.id };
  if (!user.id) throw new Error("generate_link returned no user id");

  code = codeLib.generateMeetingCode();
  const created = await admin("/rest/v1/meetings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ code, title: "Webhook fixture", host_id: user.id }),
  });
  if (!created.ok) throw new Error(`insert meeting: ${created.status}`);

  // --- 3. is verification passing, or silently rejecting everything? -------

  {
    const r = await deliver(event("room_started", code));
    check(r.status === 401, "an unsigned delivery is refused", `HTTP ${r.status}`);
  }
  {
    const body = event("room_started", code);
    const r = await deliver(body, sign(body, `${SECRET}-wrong`));
    check(r.status === 401, "a delivery signed with the wrong secret is refused", `HTTP ${r.status}`);
  }
  {
    const body = event("room_started", code);
    // Signature over a *different* body than the one sent — the sha256 claim
    // is what makes a replayed header useless against edited contents.
    const r = await deliver(body, sign(event("room_started", code)));
    check(r.status === 401, "a signature over different bytes is refused", `HTTP ${r.status}`);
  }

  /**
   * The one that distinguishes "rejecting everything" from "never called".
   *
   * Everything above passes just as well against a handler that returns 401
   * unconditionally, which is precisely the failure A2 describes. Only a
   * correctly signed event that *changes the database* separates them.
   */
  {
    const body = event("room_started", code);
    const r = await deliver(body, sign(body));
    const row = await rowOf(code);
    check(
      r.status === 200 && row?.status === "live" && row?.started_at !== null,
      "a correctly signed room_started is accepted and writes status + started_at",
      `HTTP ${r.status}, status=${row?.status}, started_at=${row?.started_at ? "set" : "null"}`,
    );
  }
  {
    const body = event("room_finished", code);
    const r = await deliver(body, sign(body));
    const row = await rowOf(code);
    check(
      r.status === 200 && row?.status === "ended" && row?.ended_at !== null,
      "and room_finished writes status + ended_at",
      `HTTP ${r.status}, status=${row?.status}, ended_at=${row?.ended_at ? "set" : "null"}`,
    );
  }

  /* --- the writer A2 was asked for ---------------------------------------
   *
   * `meeting_participants` had no writer anywhere in the application until
   * now — only the dev seeder inserted rows — so every count the dashboard
   * read from it was structurally zero, and past meetings asserted "0
   * participants" whatever had happened.
   *
   * A row is a **session**, and the two counts D1 names fall out of that: every
   * row is how many arrived, `left_at is null` is how many are here now. Both
   * are checked below, because a writer that only satisfies one of them is the
   * bug this replaces wearing a different number.
   *
   * The fixture meeting was just marked ended above, which closed its sessions
   * — so this opens a fresh room on the same code, which is exactly what a
   * rejoin does.
   */
  {
    const ama = participantOf(`user_${user.id}`, "Ama Serwaa", "host");
    const kwabena = participantOf("guest_wh1", "Kwabena Osei");

    for (const p of [ama, kwabena]) {
      const body = event("participant_joined", code, p);
      await deliver(body, sign(body));
    }
    const both = await sessionsOf(code);
    check(
      both.joined === 2 && both.here === 2,
      "participant_joined opens a session for each arrival",
      `joined ${both.joined}, here ${both.here}`,
    );

    /*
     * The retry. LiveKit re-delivers anything it did not get a 2xx for, so one
     * arrival can produce two events — and a second open row would make the
     * live count read one too many for the rest of the meeting.
     */
    const again = event("participant_joined", code, ama);
    const r = await deliver(again, sign(again));
    const afterRetry = await sessionsOf(code);
    check(
      r.status === 200 && afterRetry.joined === 2 && afterRetry.here === 2,
      "and a redelivered join is not a second person",
      `HTTP ${r.status}, joined ${afterRetry.joined}, here ${afterRetry.here}`,
    );

    /*
     * Leaving closes the session rather than deleting it. That is the whole
     * reason two counts can come from one table: the arrival is still on
     * record after the departure.
     */
    const left = event("participant_left", code, kwabena);
    await deliver(left, sign(left));
    const afterLeave = await sessionsOf(code);
    check(
      afterLeave.joined === 2 && afterLeave.here === 1,
      "participant_left closes it, and the arrival stays on the record",
      `joined ${afterLeave.joined}, here ${afterLeave.here}`,
    );

    const leftAgain = event("participant_left", code, kwabena);
    const r2 = await deliver(leftAgain, sign(leftAgain));
    const afterLeaveRetry = await sessionsOf(code);
    check(
      r2.status === 200 && afterLeaveRetry.here === 1,
      "and a redelivered leave changes nothing",
      `HTTP ${r2.status}, here ${afterLeaveRetry.here}`,
    );

    /*
     * A room torn down by `deleteRoom` — which is what "End meeting" does — is
     * not obliged to send `participant_left` for everybody on the way out. Any
     * session left open after that would count toward "here now" forever, on a
     * meeting that has ended.
     */
    const finished = event("room_finished", code);
    await deliver(finished, sign(finished));
    const afterFinish = await sessionsOf(code);
    check(
      afterFinish.joined === 2 && afterFinish.here === 0,
      "room_finished closes every session still open",
      `joined ${afterFinish.joined}, here ${afterFinish.here}`,
    );

    /*
     * An event for a room we have no meeting for. LiveKit will open a room for
     * any name asked of it, and a 500 here would have it retry forever.
     */
    const orphan = event("participant_joined", "zzz-zzzz-zzz", kwabena);
    const r3 = await deliver(orphan, sign(orphan));
    check(
      r3.status === 200,
      "a participant in a room we do not know is acknowledged, not retried",
      `HTTP ${r3.status}`,
    );
  }

  // --- 1 and 2, as far as a script can reach them -------------------------

  /**
   * The empirical answer, and the reason A1 needed a time fallback.
   *
   * Counts only — no titles, no codes, no host. If nothing outside this run's
   * own fixture has ever been marked started, nothing has ever been delivered
   * in production, and items 1 and 2 are where to look.
   */
  const all = await admin(
    "/rest/v1/meetings?select=started_at,ended_at,status,meeting_participants(count)",
  );
  const rows = await all.json();
  const joined = (m) =>
    (m.meeting_participants?.[0]?.count ?? 0) > 0;
  const started = rows.filter((m) => m.started_at !== null).length;
  const ended = rows.filter((m) => m.ended_at !== null).length;

  /**
   * The sharp one. A meeting somebody joined is a meeting LiveKit opened a room
   * for, so `room_started` was emitted for every one of these. Any that lack
   * `started_at` are deliveries that did not land — the difference between
   * "the webhook is not configured" and "the webhook is configured and
   * occasionally misses", which the two totals above cannot tell apart.
   */
  const missed = rows.filter((m) => joined(m) && m.started_at === null).length;

  console.log();
  console.log(`  ${rows.length} meetings in the database`);
  console.log(`  ${started} have started_at set   (room_started landed)`);
  console.log(`  ${ended} have ended_at set     (room_finished landed)`);
  console.log(`  ${rows.filter(joined).length} were actually joined by somebody`);
  console.log(`  ${missed} of those have no started_at  ← deliveries that did not land`);

  if (started <= 1) {
    console.log();
    console.log("  Nothing but this run's fixture has ever been marked started,");
    console.log("  and the handler demonstrably works — so A2's remaining");
    console.log("  suspects are the two a script cannot see: whether the");
    console.log("  production URL is reachable, and whether it is registered in");
    console.log("  the LiveKit project settings. MANUAL.md carries both.");
  } else {
    console.log();
    console.log("  started_at has only one writer — the deployed webhook route.");
    console.log("  LiveKit Cloud cannot reach localhost, so these were written by");
    console.log("  production accepting a signed delivery: the URL is registered,");
    console.log("  reachable, and verifying. A2 items 1 and 2 are answered.");
  }
} catch (e) {
  check(false, "harness completed", e.message);
} finally {
  if (code) {
    await admin(`/rest/v1/meetings?code=eq.${code}`, { method: "DELETE" }).catch(() => {});
  }
  if (user?.id) {
    await admin(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" }).catch(() => {});
  } else {
    console.log("  ! no fixture user id — nothing was cleaned up");
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} webhook checks passed.`);
if (failed.length) process.exit(1);
