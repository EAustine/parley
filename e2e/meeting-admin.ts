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

export async function createFixtureHost(): Promise<{ id: string; email: string }> {
  const email = `e2e-host-${process.hrtime.bigint()}@example.com`;
  const response = await rest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: `E2e-${process.hrtime.bigint()}-Aa1!`,
      email_confirm: true,
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

export async function deleteMeeting(code: string): Promise<void> {
  await rest(`/rest/v1/meetings?code=eq.${encodeURIComponent(code)}`, {
    method: "DELETE",
  }).catch(() => {});
}
