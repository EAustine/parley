import { chromium, type FullConfig } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { signIn } from "./auth";
import {
  createFixtureHost,
  createMeeting,
  deleteFixtureHost,
  deleteStaleFixtureHosts,
} from "./meeting-admin";

/**
 * One fixture host for the run, its signed-in session, and the two read-only
 * meetings that several specs display without ever joining.
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
export default async function globalSetup(config: FullConfig) {
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
    process.env.PARLEY_E2E_HOST_STATE = await captureHostSession(config, host);

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

    /**
     * A gated meeting nobody hosts — v1.5, for the state list.
     *
     * The waiting screen was reachable by no check at all: `targets.spec` and
     * `a11y.spec` walk a fixed list of states, and none of them had a queue or a
     * door in it, so the Leave on the waiting screen had never been measured
     * against the 44px floor and axe had never seen the surface.
     *
     * Shared across workers like the other two, and safe for the same reason
     * with a stronger guarantee: **nobody can enter it.** With `waiting_room`
     * on and no host ever joining, every visitor is held at the first gate, so
     * there is no room to contend for and no composition to assert. Visitors
     * leave `meeting_waiting` rows behind, which cascade away with the host in
     * teardown.
     */
    process.env.PARLEY_E2E_GATED_CODE = await createMeeting({
      status: "live",
      title: "Product planning",
      waitingRoom: true,
    });
  } catch (error) {
    // A half-built fixture set is worse than none: the run would fail later,
    // somewhere unrelated, with a stray user left behind.
    await deleteFixtureHost(host.id);
    throw error;
  }

  console.log(`e2e fixture host ${host.email}`);
}

/**
 * Sign the fixture host in **once for the whole run**, and write the cookies
 * where every worker can read them.
 *
 * **This was a worker fixture, and that was a race.** Supabase invalidates the
 * previous link when a new one is minted for the same address, and every worker
 * signs in as this one host — so four workers starting together minted four
 * links for one address and three of them held a dead one. The symptom is
 * `CLAUDE.md`'s own rule being broken by the fixture written to obey it:
 * "That link has expired or has already been used", with `callback requests: 1`
 * and a fresh link that verifies on the spot. Measured, not supposed — a
 * three-engine run produced three simultaneous refusals from four workers.
 *
 * Per-worker made it rare rather than safe: four mints instead of a hundred and
 * eighty, which is why it read as flakiness for so long. One mint cannot race
 * itself.
 *
 * **The retry it replaces was aimed at a different fault.** It is documented as
 * a rate remedy — "waiting 5s for the window to slide" — and a fixed pause does
 * nothing for mutual invalidation except wake every loser at the same moment to
 * race again. In the run that prompted this, one of the three lost twice.
 *
 * **Why global setup is a safe place to need a server**, which an earlier note
 * here doubted: Playwright 1.62.1 builds its startup tasks as
 * `[removeOutputDirs, ...pluginSetup, ...globalTeardowns, ...globalSetups]`
 * (`runner/index.js:6003`) and runs them strictly in order, and the `webServer`
 * is a plugin whose `setup()` awaits `_waitForProcess()` — it polls the URL
 * until it answers. So by the time this runs the server is up. Worth
 * re-checking on a Playwright upgrade; it is an ordering this depends on.
 *
 * The state is minted in Chromium and read by the WebKit and Firefox workers
 * too. `storageState` is cookies and origin storage as JSON, with nothing
 * engine-specific in it.
 *
 * It is also four times less of the sign-in budget: one `verifyOtp` per run
 * against the measured ceiling of thirty per five minutes.
 */
async function captureHostSession(
  config: FullConfig,
  host: { id: string; email: string },
): Promise<string> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) {
    throw new Error("globalSetup: no baseURL in the config — cannot sign in.");
  }

  /*
   * Named for the host, so a file left by an interrupted run can never be
   * mistaken for this one's — and the directory is emptied first anyway, for
   * the same reason `deleteStaleFixtureHosts` exists above: teardown is the
   * step that does not happen. These hold live session cookies, so they are
   * not litter to be tolerated.
   *
   * Safe to clear wholesale because two suites cannot run here at once: the
   * `webServer` refuses to start on a port already in use.
   */
  const dir = resolve(config.rootDir, ".auth");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const path = resolve(dir, `host-${host.id}.json`);

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await signIn(page, host.email, "/dashboard");
    await context.storageState({ path });
  } finally {
    await browser.close();
  }

  return path;
}
