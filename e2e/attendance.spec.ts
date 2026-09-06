import { expect, test } from "./fixtures";

import { signIn } from "./auth";
import {
  addSessions,
  addWaiting,
  createFixtureHost,
  createMeeting,
  deleteFixtureHost,
} from "./meeting-admin";

/**
 * Who was here — v1.5 C1, and the production bug that rewrote it.
 *
 * A host held a scheduled meeting, six people came, and the record said
 * **"Nobody joined this meeting."** All six had been admitted through the
 * queue; not one `participant_joined` webhook ever arrived, because the route's
 * own docblock said two events were wanted and LiveKit was configured to match.
 * `meeting_participants` had three rows in the whole database and all three came
 * from `seed-dev`.
 *
 * The record now reads the queue as well. A session is still the better
 * evidence — it carries arrival and departure — but it is no longer the *only*
 * evidence, so one missed delivery path cannot make a meeting look empty.
 */
test.describe("the attendance record", () => {
  /**
   * The reported bug, as a test: admitted people, no sessions at all.
   */
  test("shows people the host admitted when no session was recorded", async ({
    page,
  }) => {
    const host = await createFixtureHost();
    const start = new Date(Date.now() - 7_200_000);
    const code = await createMeeting({
      host: host.id,
      status: "ended",
      title: "Planning committee",
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 1_800_000),
      waitingRoom: true,
    });
    try {
      await addWaiting(code, [
        { name: "Ayomide Elizabeth", status: "admitted" },
        { name: "Ruth Olatayo", status: "admitted" },
        { name: "Isaiah Adejumo", status: "denied" },
      ]);
      await signIn(page, host.email, `/schedule/${code}`);

      const record = page.getByRole("region", { name: "Who was here" });
      await expect(
        record,
        "the record is missing entirely on an ended meeting",
      ).toBeVisible({ timeout: 20_000 });

      await expect(
        record,
        "a meeting with people in it still reports that nobody joined",
      ).not.toContainText("Nobody joined");

      await expect(record).toContainText("Ayomide Elizabeth");
      await expect(record).toContainText("Ruth Olatayo");

      /*
       * "Admitted", not "Joined". The host opened the door; without a session
       * row the server never saw them arrive, and saying "Joined" would claim
       * more than is known — the same distinction C1 draws between a name that
       * was attested and one that was typed.
       */
      await expect(
        record.getByText("Admitted", { exact: true }),
        "an admitted person is being reported as having joined",
      ).toHaveCount(2);

      // The denied person is still distinguished, as C1 requires.
      await expect(record).toContainText("Denied entry");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * **The row is not listed twice once the webhooks are configured.**
   *
   * This is the failure mode the fix introduces if it is done carelessly: with
   * participant events enabled, an admitted person has a queue row *and* a
   * session row, and a record that reads both without matching them replaces
   * "nobody was here" with "everybody was here twice".
   */
  test("prefers the session when somebody has both records", async ({ page }) => {
    const host = await createFixtureHost();
    const start = new Date(Date.now() - 7_200_000);
    const code = await createMeeting({
      host: host.id,
      status: "ended",
      title: "Both records",
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 1_800_000),
      waitingRoom: true,
    });
    try {
      await addWaiting(code, [{ name: "Ruth Olatayo", status: "admitted" }]);
      await addSessions(code, [
        { name: "Ruth Olatayo", identity: "guest_ruth", left: true },
      ]);
      await signIn(page, host.email, `/schedule/${code}`);

      const record = page.getByRole("region", { name: "Who was here" });
      await expect(record).toBeVisible({ timeout: 20_000 });

      expect(
        (await record.getByText("Ruth Olatayo").all()).length,
        "one person is listed twice — once from the queue and once from the session",
      ).toBe(1);

      // And it is the session that survives, because it knows more.
      await expect(
        record.getByText("Admitted", { exact: true }),
        "the queue row won over the session row, losing the arrival and departure times",
      ).toHaveCount(0);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });
});
