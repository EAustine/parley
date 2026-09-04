import {
  createFixtureHost,
  createMeeting,
  deleteFixtureHost,
  deleteStaleFixtureHosts,
} from "./meeting-admin";

/**
 * One fixture host for the run, and the two read-only meetings that several
 * specs display without ever joining.
 *
 * This replaces `npm run seed:dev` as the suite's prerequisite. The seed still
 * exists for developing against the dashboard by hand, but the tests no longer
 * depend on someone having run it — and, more to the point, no longer depend on
 * *not* running it mid-suite. `seed-dev.mjs` deletes every meeting belonging to
 * its target before inserting, so a suite sharing that host was one terminal
 * away from having its fixtures deleted underneath it.
 *
 * The ended and scheduled meetings are shared deliberately. Nothing joins them;
 * they exist so `/j/[code]` can render "this meeting has ended" and "not yet
 * started". Read-only fixtures are safe to share across parallel workers, and
 * making them per-test would cost a row insert per test for no isolation gain.
 * The live rooms are the ones that need owning, and those are per-test — see
 * `meeting-admin.ts`.
 *
 * Codes travel to the workers through the environment because Playwright forks
 * workers after global setup returns, so they inherit whatever it set.
 */
export default async function globalSetup() {
  /**
   * Repair the last run before starting this one — A4.
   *
   * `globalTeardown` only runs when a run finishes, so an interrupted one
   * leaves its fixture host and every meeting its tests made. Nothing else
   * cleans them: `seed-dev.mjs` skips `@example.com` accounts by design.
   * Doing it here rather than there is the whole idea — teardown is the step
   * that did not happen.
   */
  const swept = await deleteStaleFixtureHosts();
  if (swept > 0) {
    console.log(`swept ${swept} fixture host(s) left by an interrupted run`);
  }

  const host = await createFixtureHost();
  process.env.PARLEY_E2E_HOST_ID = host.id;
  // Published so `fixture-sweep.spec.ts` can assert the sweep's pattern still
  // matches what `createFixtureHost` mints — a rename there must fail a test,
  // not silently turn the sweep into a no-op.
  process.env.PARLEY_E2E_HOST_EMAIL = host.email;

  try {
    const days = (n: number) => new Date(Date.now() + n * 86_400_000);

    process.env.PARLEY_E2E_ENDED_CODE = await createMeeting({
      status: "ended",
      title: "Sprint retro",
      scheduledStart: days(-2),
      scheduledEnd: days(-2),
      endedAt: days(-2),
    });

    process.env.PARLEY_E2E_SCHEDULED_CODE = await createMeeting({
      status: "scheduled",
      title: "Roadmap planning",
      scheduledStart: days(3),
      scheduledEnd: days(3),
      timezone: "Europe/Berlin",
    });
  } catch (error) {
    // A half-built fixture set is worse than none: the run would fail later,
    // somewhere unrelated, with a stray user left behind.
    await deleteFixtureHost(host.id);
    throw error;
  }

  console.log(`e2e fixture host ${host.email}`);
}
