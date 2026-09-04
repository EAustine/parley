import { expect, test } from "@playwright/test";

import {
  isStaleFixtureHost,
  STALE_AFTER_MS,
  hostId,
} from "./meeting-admin";

/**
 * The stale-fixture sweep — v1.3 A4.
 *
 * `globalTeardown` deletes the run's fixture host and cascades away everything
 * its tests made. It only runs when the run *finishes*, so Ctrl-C, a crashed
 * worker or a killed process leaves the host behind with all of its meetings —
 * and nothing else collects them, because `seed-dev.mjs` deliberately skips
 * `@example.com` accounts when choosing whose dashboard to seed. The residue is
 * exactly the residue that script cannot reach.
 *
 * `globalSetup` now sweeps them, because setup is the step that *does* run.
 *
 * **The direction that matters is the false positive.** Deleting a host that a
 * suite is still using is unrecoverable mid-run and surfaces as a flake
 * somewhere unrelated — which is the failure that moved these fixtures off
 * `seed:dev` in the first place. `check:media` makes it concrete: it invokes
 * Playwright twice back to back, so a second global setup fires with no
 * guarantee the first has torn down. An unguarded sweep would have one run
 * delete the other's host.
 *
 * So the age gate is the load-bearing part, and it is tested by putting inputs
 * to a pure function rather than by deleting accounts and looking.
 */
test.describe("the stale fixture-host sweep", () => {
  const NOW = Date.parse("2026-09-04T12:00:00Z");
  const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
  const fixture = (over: { email?: string; created_at?: string }) => ({
    email: "e2e-host-1206316078488625@example.com",
    created_at: at(9),
    ...over,
  });

  test("spares a host young enough to belong to a running suite", () => {
    // The case that matters most: check:media's second invocation, minutes
    // after the first, while the first may still be running.
    expect(isStaleFixtureHost(fixture({ created_at: at(0) }), NOW)).toBe(false);
    expect(isStaleFixtureHost(fixture({ created_at: at(0.02) }), NOW)).toBe(false);
    expect(isStaleFixtureHost(fixture({ created_at: at(5.9) }), NOW)).toBe(false);
  });

  test("collects one left by a run that never tore down", () => {
    expect(isStaleFixtureHost(fixture({ created_at: at(6.1) }), NOW)).toBe(true);
    expect(isStaleFixtureHost(fixture({ created_at: at(48) }), NOW)).toBe(true);
  });

  test("the boundary is exact, in both directions", () => {
    const exactly = new Date(NOW - STALE_AFTER_MS).toISOString();
    const older = new Date(NOW - STALE_AFTER_MS - 1).toISOString();
    expect(isStaleFixtureHost(fixture({ created_at: exactly }), NOW)).toBe(false);
    expect(isStaleFixtureHost(fixture({ created_at: older }), NOW)).toBe(true);
  });

  test("touches nothing that is not a minted fixture host", () => {
    for (const email of [
      "eluroaustine3@gmail.com",
      // The other check scripts' fixtures, which own their own cleanup.
      "meet-1206316078488625@example.com",
      "wh-1206316078488625@example.com",
      "e2e-host@example.com", // no timestamp — not one of ours
      "e2e-host-123@example.org",
      "not-e2e-host-123@example.com",
    ]) {
      expect(
        isStaleFixtureHost({ email, created_at: at(72) }, NOW),
        `${email} is not a minted fixture host and must be left alone`,
      ).toBe(false);
    }
    expect(isStaleFixtureHost({ created_at: at(72) }, NOW)).toBe(false);
  });

  test("a missing or unreadable date is not evidence of staleness", () => {
    expect(isStaleFixtureHost(fixture({ created_at: undefined }), NOW)).toBe(false);
    expect(isStaleFixtureHost(fixture({ created_at: "not a date" }), NOW)).toBe(false);
  });

  /**
   * The vacuity guard, and the one assertion that touches the real run.
   *
   * Every case above is synthetic, and all of them would pass against a
   * predicate wired to something that no longer resembles what
   * `createFixtureHost` mints. This one asserts the address format against the
   * host this very suite is running under — so a rename there fails here rather
   * than quietly turning the sweep into a no-op that collects nothing forever.
   */
  test("and matches the address this run's own host was minted with", () => {
    expect(hostId()).toBeTruthy();
    const email = process.env.PARLEY_E2E_HOST_EMAIL;
    expect(email, "global setup did not publish the fixture host's email").toBeTruthy();
    expect(
      isStaleFixtureHost({ email, created_at: at(72) }, NOW),
      `a host minted as ${email} would not be collected once stale — ` +
        "the sweep's pattern and createFixtureHost have drifted apart",
    ).toBe(true);
  });
});
