#!/usr/bin/env node
/**
 * Meeting creation, end to end against the running dev server.
 *
 * Goes through `POST /api/meetings` with a real session cookie rather than
 * inserting rows directly, so the route handler, the zod schema, the session
 * lookup and RLS are all on the path being tested.
 *
 * Credentials arrive through `node --env-file=.env.local`; nothing here opens
 * the file.
 *
 * Run with: npm run check:meetings   (needs npm run dev)
 */

const APP = process.env.CHECK_APP_URL ?? "http://localhost:3000";

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Run via npm run check:meetings.`);
    process.exit(1);
  }
  return value;
}

const SB = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SERVICE = required("SUPABASE_SERVICE_ROLE_KEY");

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

/** Cookie jar just large enough for one session. */
const jar = new Map();
function absorb(response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookieHeader = () =>
  [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

const app = async (path, init = {}) => {
  const response = await fetch(`${APP}${path}`, {
    ...init,
    redirect: "manual",
    headers: { cookie: cookieHeader(), ...(init.headers ?? {}) },
  });
  absorb(response);
  return response;
};

let user;
try {
  await fetch(`${APP}/sign-in`).catch(() => {
    throw new Error(`No server at ${APP}. Start it with npm run dev.`);
  });

  // A real host, signed in through the real callback route.
  const email = `meet-${process.hrtime.bigint()}@example.com`;
  const link = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({
      type: "magiclink",
      email,
      redirect_to: `${APP}/auth/callback?next=/dashboard`,
    }),
  });
  if (!link.ok) throw new Error(`generate_link: ${link.status}`);
  // The response *is* the user, flattened — `id` sits at the top level, not
  // under a `user` key. Reading it wrongly once left eight fixture accounts
  // behind, because the cleanup below guarded on `user?.id` and skipped in
  // silence. Hence the explicit check rather than optional chaining.
  const link_ = await link.json();
  user = { id: link_.id, email: link_.email };
  if (!user.id) throw new Error("generate_link returned no user id");
  const { hashed_token, verification_type } = link_;

  const callback = await app(
    `/auth/callback?token_hash=${hashed_token}&type=${verification_type}&next=%2Fdashboard`,
  );
  check(
    callback.status === 307 && [...jar.keys()].some((k) => k.startsWith("sb-")),
    "signed in through the callback route",
    `HTTP ${callback.status}`,
  );

  // --- unauthenticated requests are refused before anything else ----------
  const anon = await fetch(`${APP}/api/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "instant" }),
  });
  check(
    anon.status === 401 && (await anon.json()).error === "unauthenticated",
    "POST /api/meetings refuses an unauthenticated caller",
    `HTTP ${anon.status}`,
  );

  // --- instant -------------------------------------------------------------
  const instantRes = await app("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "instant" }),
  });
  const instant = await instantRes.json();
  check(instantRes.status === 201, "creates an instant meeting", `HTTP ${instantRes.status}`);
  check(
    /^[abcdefghjkmnpqrstuvwxyz23456789]{3}-[abcdefghjkmnpqrstuvwxyz23456789]{4}-[abcdefghjkmnpqrstuvwxyz23456789]{3}$/.test(
      instant.code ?? "",
    ),
    "instant meeting has a well-formed code",
    instant.code,
  );
  check(
    instant.scheduled_start === null,
    "instant meeting has no scheduled_start",
  );

  // --- scheduled -----------------------------------------------------------
  const start = new Date(Date.now() + 86_400_000).toISOString();
  const scheduledRes = await app("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "scheduled",
      title: "Quarterly parley",
      description: "Agenda to follow.",
      scheduledStart: start,
      durationMinutes: 45,
      timezone: "Africa/Accra",
    }),
  });
  const scheduled = await scheduledRes.json();
  check(scheduledRes.status === 201, "creates a scheduled meeting", `HTTP ${scheduledRes.status}`);
  check(
    scheduled.scheduled_start !== null && scheduled.timezone === "Africa/Accra",
    "scheduled meeting stores UTC plus the creator's zone",
    `${scheduled.scheduled_start} / ${scheduled.timezone}`,
  );

  // scheduled_end must be start + duration, computed server-side.
  const row = await admin(
    `/rest/v1/meetings?select=scheduled_start,scheduled_end,title,description&code=eq.${scheduled.code}`,
  ).then((r) => r.json());
  const minutes =
    (new Date(row[0].scheduled_end) - new Date(row[0].scheduled_start)) / 60000;
  check(minutes === 45, "scheduled_end is start plus the requested duration", `${minutes} min`);

  // --- validation ----------------------------------------------------------
  const bad = [
    ["missing kind", {}],
    ["unknown kind", { kind: "whenever" }],
    ["scheduled without a start", { kind: "scheduled", title: "x", durationMinutes: 30, timezone: "UTC" }],
    ["invented timezone", { kind: "scheduled", title: "x", scheduledStart: start, durationMinutes: 30, timezone: "Mars/Olympus" }],
    ["duration out of range", { kind: "scheduled", title: "x", scheduledStart: start, durationMinutes: 100000, timezone: "UTC" }],
    ["empty title", { kind: "scheduled", title: "   ", scheduledStart: start, durationMinutes: 30, timezone: "UTC" }],
  ];
  let rejected = 0;
  for (const [label, payload] of bad) {
    const r = await app("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.status === 400) rejected++;
    else console.log(`   ✘ ${label} returned ${r.status}, expected 400`);
  }
  check(rejected === bad.length, `rejects ${bad.length} malformed requests with 400`);

  // --- host_id cannot be forged -------------------------------------------
  const otherRes = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: `other-${process.hrtime.bigint()}@example.com`,
      password: `Other-${process.hrtime.bigint()}-Aa1!`,
      email_confirm: true,
    }),
  });
  if (!otherRes.ok) {
    throw new Error(`create second user: ${otherRes.status} ${await otherRes.text()}`);
  }
  const other = await otherRes.json();
  const forged = await app("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "instant", host_id: other.id }),
  });
  const forgedBody = await forged.json();
  const forgedRow = await admin(
    `/rest/v1/meetings?select=host_id&code=eq.${forgedBody.code}`,
  ).then((r) => r.json());
  check(
    forgedRow[0]?.host_id === user.id,
    "host_id in the request body is ignored; the session decides",
  );
  await admin(`/auth/v1/admin/users/${other.id}`, { method: "DELETE" });

  // --- /j/[code] resolves for a stranger -----------------------------------
  //
  // Fetched with `fetch`, not `app()`, so no cookie is sent. That is the whole
  // point: the page must resolve through `get_meeting_by_code` as `anon`, the
  // way someone opening a pasted link does. Using the signed-in helper here
  // would test the `authenticated` path and prove nothing about the one that
  // ships.
  const joinRes = await fetch(`${APP}/j/${instant.code}`);
  const joinHtml = await joinRes.text();
  check(
    joinRes.status === 200 && joinHtml.includes(instant.code),
    "/j/[code] resolves the meeting with no session cookie",
    `HTTP ${joinRes.status}`,
  );

  // The security definer function returns six columns. Anything else reaching
  // the page would mean it is handing a stranger more than it should.
  const leaked = [
    ["host id", user.id],
    ["meeting row id", (await admin(`/rest/v1/meetings?select=id&code=eq.${instant.code}`).then((r) => r.json()))[0]?.id],
    ["host email", user.email],
  ].filter(([, value]) => value && joinHtml.includes(value));
  check(
    leaked.length === 0,
    "/j/[code] leaks no host id, row id or email to an anonymous reader",
    leaked.length ? `leaked: ${leaked.map(([n]) => n).join(", ")}` : "",
  );

  // An unknown code is a designed state, not a framework 404.
  //
  // Discriminated on status and on our own content. Next inlines its default
  // not-found component into every page's payload, so "This page could not be
  // found" appears in the HTML of a perfectly healthy page — searching for it
  // proves nothing. A genuinely missing route answers 404; this one answers
  // 200 and offers somewhere to type another code.
  const unknown = await fetch(`${APP}/j/zzz-zzzz-zzz`);
  const unknownHtml = await unknown.text();
  check(
    unknown.status === 200 &&
      unknownHtml.includes("That meeting isn’t here") &&
      unknownHtml.includes("kqr-8mzt-vnp"),
    "an unknown code renders a designed state with a way forward",
    `HTTP ${unknown.status}`,
  );

  const missingRoute = await fetch(`${APP}/definitely-not-a-route`);
  check(
    missingRoute.status === 404,
    "a genuinely missing route still 404s — the join page is the exception, not a blanket catch",
    `HTTP ${missingRoute.status}`,
  );

  // An ended meeting is its own state, never conflated with a wrong code.
  // Someone arriving late to a real meeting must be told it finished.
  await admin(`/rest/v1/meetings?code=eq.${instant.code}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "ended",
      ended_at: new Date(Date.now() - 86_400_000).toISOString(),
    }),
  });
  const endedRes = await fetch(`${APP}/j/${instant.code}`);
  const endedHtml = await endedRes.text();
  check(
    endedRes.status === 200 &&
      endedHtml.includes("This meeting has ended") &&
      !endedHtml.includes("That meeting isn’t here"),
    "an ended meeting says so, and is not the unknown-code state",
    `HTTP ${endedRes.status}`,
  );
  check(
    endedHtml.includes("Meeting") && !endedHtml.includes(user.email),
    "the ended state shows the meeting title and not the host",
  );

  // Past the window it becomes indistinguishable, which is the intended end.
  await admin(`/rest/v1/meetings?code=eq.${instant.code}`, {
    method: "PATCH",
    body: JSON.stringify({
      ended_at: new Date(Date.now() - 31 * 86_400_000).toISOString(),
    }),
  });
  const staleRes = await fetch(`${APP}/j/${instant.code}`);
  const staleHtml = await staleRes.text();
  check(
    staleRes.status === 200 && staleHtml.includes("That meeting isn’t here"),
    "a meeting ended over 30 days ago falls through to unknown-code",
    `HTTP ${staleRes.status}`,
  );

  const malformed = await fetch(`${APP}/j/not-a-code`);
  const malformedHtml = await malformed.text();
  check(
    malformed.status === 200 && malformedHtml.includes("That meeting isn’t here"),
    "a malformed code renders the same designed state",
    `HTTP ${malformed.status}`,
  );

  // --- the token endpoint --------------------------------------------------
  //
  // Each run gets its own rate-limit bucket via `x-real-ip`. That header is
  // spoofable by any local client, which is exactly why the endpoint trusts it
  // only where a proxy overwrites it — Vercel does. Being able to set it here
  // is a property of running against localhost, not a hole in the limiter, and
  // without it the tenth token request in a suite starts failing the ones
  // after it.
  const runIp = `10.0.0.${Math.floor(Math.random() * 250) + 1}-${Date.now()}`;
  const asIp = (ip) => ({ "Content-Type": "application/json", "x-real-ip": ip });
  //
  // Every claim in §7 that can be checked from outside. The decode is the
  // point: a token is authority, so what it grants matters more than that a
  // request succeeded.
  const decode = (jwt) =>
    JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));

  const guestToken = await fetch(`${APP}/api/livekit/token`, {
    method: "POST",
    headers: asIp(runIp),
    body: JSON.stringify({ code: scheduled.code, displayName: "  Ama   Serwaa  " }),
  });
  const guestBody = await guestToken.json();
  check(guestToken.status === 200, "mints a token for a guest", `HTTP ${guestToken.status}`);

  const claims = guestBody.token ? decode(guestBody.token) : {};
  check(
    /^guest_[A-Za-z0-9_-]{10}$/.test(guestBody.identity ?? ""),
    "guest identity is generated server-side",
    guestBody.identity,
  );
  check(
    claims.video?.room === scheduled.code &&
      claims.video?.roomJoin === true &&
      claims.video?.canPublish === true &&
      claims.video?.canSubscribe === true &&
      claims.video?.canPublishData === true,
    "grants exactly roomJoin, canPublish, canSubscribe, canPublishData, room",
  );
  check(
    !claims.video?.roomAdmin &&
      !claims.video?.roomCreate &&
      !claims.video?.roomList &&
      !claims.video?.canUpdateOwnMetadata,
    "grants nothing wider — no roomAdmin, roomCreate, roomList, canUpdateOwnMetadata",
  );
  // The SDK emits `nbf` and `exp`, not `iat` — measuring against a missing
  // claim gave NaN, which compared false and looked like a real failure.
  const ttlHours = (claims.exp - claims.nbf) / 3600;
  check(ttlHours === 6, "ttl is 6 hours", `${ttlHours}h (exp - nbf)`);
  const metadata = claims.metadata ? JSON.parse(claims.metadata) : {};
  check(
    metadata.displayName === "Ama Serwaa" && metadata.role === "participant",
    "display name is sanitised and travels in metadata, not identity",
    JSON.stringify(metadata),
  );

  // Control characters and bidi overrides are stripped, not escaped downstream.
  const nasty = await fetch(`${APP}/api/livekit/token`, {
    method: "POST",
    headers: asIp(runIp),
    body: JSON.stringify({
      code: scheduled.code,
      displayName: "A\u0000m\u202Ea\u200B " + "x".repeat(80),
    }),
  });
  const nastyMeta = JSON.parse(decode((await nasty.json()).token).metadata);
  check(
    !/[\u0000-\u001F\u202A-\u202E\u200B]/.test(nastyMeta.displayName) &&
      nastyMeta.displayName.length <= 40,
    "control characters and bidi overrides are stripped, and 40 chars enforced",
    `${nastyMeta.displayName.length} chars`,
  );

  // A guest with no usable name is refused rather than labelled "Guest".
  const nameless = await fetch(`${APP}/api/livekit/token`, {
    method: "POST",
    headers: asIp(runIp),
    body: JSON.stringify({ code: scheduled.code, displayName: "   " }),
  });
  check(
    nameless.status === 400 &&
      (await nameless.json()).error === "display_name_required",
    "a guest with a blank name is refused",
    `HTTP ${nameless.status}`,
  );

  // The host gets role: host — decided by RLS, not by anything they send.
  const hostToken = await app("/api/livekit/token", {
    method: "POST",
    headers: asIp(runIp),
    body: JSON.stringify({ code: scheduled.code }),
  });
  const hostBody = await hostToken.json();
  const hostMeta = JSON.parse(decode(hostBody.token).metadata);
  check(
    hostMeta.role === "host" && hostBody.identity === `user_${user.id}`,
    "the host is recognised by RLS, and identity comes from the session",
    `${hostBody.identity} / ${hostMeta.role}`,
  );

  const unknownToken = await fetch(`${APP}/api/livekit/token`, {
    method: "POST",
    headers: asIp(runIp),
    body: JSON.stringify({ code: "zzz-zzzz-zzz", displayName: "Ama" }),
  });
  check(
    unknownToken.status === 404 &&
      (await unknownToken.json()).error === "meeting_not_found",
    "an unknown code gets 404 meeting_not_found",
    `HTTP ${unknownToken.status}`,
  );

  // The limiter itself, on a bucket of its own so it cannot disturb anything
  // above. Ten allowed, the eleventh refused — the count is asserted rather
  // than "some request eventually 429s", because a limiter off by several is
  // still a bug and would pass the looser test.
  const limitIp = `10.9.9.${Math.floor(Math.random() * 250) + 1}-${Date.now()}`;
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const r = await fetch(`${APP}/api/livekit/token`, {
      method: "POST",
      headers: asIp(limitIp),
      body: JSON.stringify({ code: scheduled.code, displayName: "Ama" }),
    });
    statuses.push(r.status);
  }
  const okCount = statuses.filter((s) => s === 200).length;
  check(
    okCount === 10 && statuses[10] === 429,
    "rate limit allows 10 per minute and refuses the 11th",
    `${okCount} allowed, then HTTP ${statuses[10]}`,
  );

  // --- the dashboard renders what was created ------------------------------
  const dash = await app("/dashboard");
  const html = await dash.text();
  check(dash.status === 200, "dashboard loads for the signed-in host", `HTTP ${dash.status}`);
  check(html.includes(instant.code), "dashboard shows the instant meeting's code");
  check(html.includes(scheduled.code), "dashboard shows the scheduled meeting's code");
  check(html.includes("Quarterly parley"), "dashboard shows the scheduled meeting's title");
  check(html.includes("Upcoming"), "dashboard renders the Upcoming section");
} catch (error) {
  check(false, "harness completed", String(error.message).slice(0, 160));
  if (process.env.CHECK_DEBUG) console.error(error.stack);
} finally {
  if (user?.id) {
    const gone = await admin(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
    if (!gone.ok) console.error(`  ! fixture user ${user.id} was not deleted (HTTP ${gone.status})`);
  } else {
    console.error("  ! no fixture user id — nothing was cleaned up");
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} meeting checks passed.`);
if (failed.length) process.exit(1);
