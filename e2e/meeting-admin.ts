import { generateMeetingCode } from "@/lib/meetings/code";

/**
 * Meeting rows for tests, created and destroyed by the tests that use them.
 *
 * The suite used to share one seeded meeting, `wcz-4npm-hjd`, across every
 * spec. That is what forced `workers: 1`: with one room, a participant left
 * behind by one test is a participant inside the next test's grid, and half
 * this suite asserts exact counts. `emptyRoom` between specs made that less
 * likely without making it impossible.
 *
 * A code per test makes it impossible. Two tests cannot collide in a room they
 * do not share, so `fullyParallel` becomes safe by construction rather than by
 * timing — which is the difference `CLAUDE.md`'s "assert room composition,
 * never assume it" is pointing at, applied one level up: do not assume a room
 * is yours, own one.
 *
 * Codes come from `generateMeetingCode`, never typed. A hand-written code
 * containing `0` or `1` is rejected as malformed before any lookup, so a test
 * using one exercises the wrong layer and passes for the wrong reason — the
 * same conventions rule that governs the check scripts.
 *
 * This is the service role, in Node, in the test runner. Never in a browser
 * context and never in the app. Credentials arrive the way `livekit-admin.ts`
 * gets its own: `--env-file=.env.local`, via `npm run check:media`.
 */

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Run via \`npm run check:media\`, which loads it with ` +
        "--env-file=.env.local.",
    );
  }
  return value;
}

/**
 * One retry, on a failed connection only.
 *
 * Three tests in one run died with `ConnectTimeoutError` reaching Supabase
 * while creating their fixtures — including two that predate this file's last
 * change. That is the network, not the suite: an HTTP response of any status
 * still resolves, and is passed straight back to the caller to fail on.
 *
 * This is not the flake tolerance `CLAUDE.md` forbids. That rule is about
 * re-running a *test* until it passes, which hides contention the suite
 * created. A TCP connect that never completed produced no result to judge, and
 * nothing about the assertion is being retried.
 */
export async function serviceFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return await fetch(url, init);
    } catch {
      throw first;
    }
  }
}

const rest = (path: string, init: RequestInit = {}): Promise<Response> => {
  const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  return serviceFetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
};

export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";

/**
 * The host every test meeting belongs to.
 *
 * One fixture account for the whole run, created in global setup and deleted
 * in teardown. `meetings.host_id` is `on delete cascade`, so removing the user
 * removes every row any test created, including rows a crashed test never got
 * to clean up. That is the property worth having: cleanup that does not depend
 * on the test finishing.
 *
 * Deliberately not the developer's own account. `scripts/seed-dev.mjs` deletes
 * every meeting belonging to its target before inserting, so sharing a host
 * with the seed means a `npm run seed:dev` in another terminal silently
 * destroys a running suite's fixtures.
 */
export function hostId(): string {
  return env("PARLEY_E2E_HOST_ID");
}

/**
 * `fullName` is optional because **not** having one is the common case.
 *
 * §3.1 has two doors. Google fills `user_metadata.full_name` from the profile;
 * the magic link asks for an address and nothing else, and nothing writes the
 * field afterwards. So a magic-link account is nameless for its whole life, and
 * that is what the default builds — the state that used to make a host's email
 * address their display name in the room. Passing a name is how the other
 * branch, an account that already knows what it is called, gets exercised.
 */
export async function createFixtureHost(
  options: { fullName?: string } = {},
): Promise<{ id: string; email: string }> {
  const email = `e2e-host-${process.hrtime.bigint()}@example.com`;
  const response = await rest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: `E2e-${process.hrtime.bigint()}-Aa1!`,
      email_confirm: true,
      ...(options.fullName
        ? { user_metadata: { full_name: options.fullName } }
        : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(`create fixture host: ${response.status} ${await response.text()}`);
  }
  const user = await response.json();
  return { id: user.id as string, email };
}

export async function deleteFixtureHost(id: string): Promise<void> {
  // Cascades to meetings and, through them, to meeting_participants.
  await rest(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => {});
}

/**
 * Fixture hosts left behind by runs that did not finish — v1.3 A4.
 *
 * `globalTeardown` deletes this run's host and cascades away everything it
 * created, and that is the right first line. It has one hole: it only runs when
 * the run *completes*. Ctrl-C, a crashed worker, a killed process — and the
 * host survives, with every meeting its tests made, invisible to everything.
 * `seed-dev.mjs` will not touch them either; it deliberately excludes
 * `@example.com` accounts when choosing whose dashboard to seed, so the litter
 * it leaves is exactly the litter that script cannot clean.
 *
 * Cleaning at *setup* rather than at teardown is the point: teardown is the
 * thing that did not run. The next run repairs the previous one.
 *
 * **Age-gated, and that is not caution — it is correctness.** `check:media`
 * runs two Playwright invocations back to back (the parallel projects, then the
 * serial media ones), so a second global setup fires while nothing guarantees
 * the first has torn down. Deleting every fixture host on sight would let one
 * run destroy the other's host mid-suite, which is precisely the failure that
 * moved these fixtures off `seed:dev` in the first place.
 *
 * The timestamp is already in the address: `createFixtureHost` names them from
 * `process.hrtime.bigint()`, so `created_at` needs no parsing and no schema.
 */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Pure, and separated from the deleting on purpose.
 *
 * The dangerous direction here is a false *positive*: deleting a host a running
 * suite is still using. That is unrecoverable mid-run and would look like a
 * flake somewhere unrelated. A predicate that only ever gets exercised by
 * actually deleting accounts cannot be tested in the direction that matters, so
 * it is a function of its inputs and `e2e/fixture-sweep.spec.ts` puts the cases
 * to it directly.
 */
export function isStaleFixtureHost(
  user: { email?: string; created_at?: string },
  now: number,
): boolean {
  // Only the addresses `createFixtureHost` mints. A real account that happens
  // to be an @example.com is not in scope, and neither is any other fixture.
  if (!/^e2e-host-\d+@example\.com$/.test(user.email ?? "")) return false;
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  // An unparseable or missing date is not evidence of staleness. Leave it.
  if (!Number.isFinite(created)) return false;
  return created < now - STALE_AFTER_MS;
}

export async function deleteStaleFixtureHosts(): Promise<number> {
  const response = await rest("/auth/v1/admin/users?per_page=500");
  if (!response.ok) return 0;

  const { users = [] } = (await response.json()) as {
    users?: { id: string; email?: string; created_at?: string }[];
  };

  const now = Date.now();
  const stale = users.filter((user) => isStaleFixtureHost(user, now));

  for (const user of stale) await deleteFixtureHost(user.id);
  return stale.length;
}

/**
 * Insert one meeting and return its code.
 *
 * `live` by default because that is what a room test needs: `get_meeting_by_code`
 * returns `status`, and the join page branches on it.
 */
export async function createMeeting(
  options: {
    status?: MeetingStatus;
    title?: string;
    scheduledStart?: Date | null;
    scheduledEnd?: Date | null;
    endedAt?: Date | null;
    timezone?: string;
    /** Whose meeting it is. Defaults to the run's fixture host. */
    host?: string;
  } = {},
): Promise<string> {
  const {
    status = "live",
    title = "Test meeting",
    scheduledStart = null,
    scheduledEnd = null,
    endedAt = null,
    timezone = "Africa/Accra",
    host = hostId(),
  } = options;

  const code = generateMeetingCode();
  const response = await rest("/rest/v1/meetings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      code,
      title,
      host_id: host,
      status,
      scheduled_start: scheduledStart?.toISOString() ?? null,
      scheduled_end: scheduledEnd?.toISOString() ?? null,
      ended_at: endedAt?.toISOString() ?? null,
      started_at: status === "live" ? new Date().toISOString() : null,
      timezone,
    }),
  });
  if (!response.ok) {
    throw new Error(`create meeting: ${response.status} ${await response.text()}`);
  }
  return code;
}

/**
 * Sessions on a meeting — v1.3 A2.
 *
 * A row in `meeting_participants` is a session: it opens on arrival and closes
 * on departure. The webhook writes them in production; this writes them
 * directly, because what the dashboard tests are about is the two *counts* and
 * whether **RLS lets a host read them** — not the delivery path, which
 * `check:webhook` owns and exercises end to end.
 *
 * That distinction is the point. The counts were structurally zero for the
 * whole of v1.2 and nothing noticed, so a test that reads them as the service
 * role would reproduce the bug rather than catch it.
 */
export async function addSessions(
  code: string,
  sessions: { name: string; identity: string; left?: boolean }[],
): Promise<void> {
  const found = await rest(
    `/rest/v1/meetings?code=eq.${encodeURIComponent(code)}&select=id`,
  );
  const [meeting] = (await found.json()) as { id: string }[];
  if (!meeting) throw new Error(`no meeting ${code}`);

  for (const session of sessions) {
    const response = await rest("/rest/v1/meeting_participants", {
      method: "POST",
      body: JSON.stringify({
        meeting_id: meeting.id,
        display_name: session.name,
        identity: session.identity,
        role: "participant",
        left_at: session.left ? new Date().toISOString() : null,
      }),
    });
    if (!response.ok) {
      throw new Error(`add session: ${response.status} ${await response.text()}`);
    }
  }
}

export async function deleteMeeting(code: string): Promise<void> {
  await rest(`/rest/v1/meetings?code=eq.${encodeURIComponent(code)}`, {
    method: "DELETE",
  }).catch(() => {});
}
