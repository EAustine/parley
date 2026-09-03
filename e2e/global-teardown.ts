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
  const id = process.env.PARLEY_E2E_HOST_ID;
  if (!id) return;
  await deleteFixtureHost(id);
}
