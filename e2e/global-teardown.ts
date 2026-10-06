import { rm } from "node:fs/promises";

import { deleteFixtureHost } from "./meeting-admin";

/**
 * Delete the fixture host, and with it every meeting any test created.
 *
 * `meetings.host_id` is `on delete cascade`, and `meeting_participants` cascades
 * from `meetings` — so one delete removes the whole run's data, including rows
 * belonging to tests that crashed before their own cleanup ran. Per-test cleanup
 * is still there and still the first line of defence; this is the one that does
 * not depend on the test finishing.
 */
export default async function globalTeardown() {
  /*
   * The session file first, and unconditionally: it holds live cookies for the
   * host about to be deleted, and the one thing worse than leaving it behind is
   * leaving it behind while still valid. `force` because an interrupted run may
   * never have written one.
   */
  const state = process.env.PARLEY_E2E_HOST_STATE;
  if (state) await rm(state, { force: true });

  const id = process.env.PARLEY_E2E_HOST_ID;
  if (!id) return;
  await deleteFixtureHost(id);
}
