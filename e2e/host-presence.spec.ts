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
 * The stale open host row — BUILD-PLAN v1.5 A1.
 *
 * > "LiveKit's webhooks are push-based with no delivery guarantee, so a missed
 * > `participant_left` leaves a row with a null `left_at` for a host who went
 * > home hours ago. The database then answers 'host present' indefinitely,
 * > which is the permissive error — and the LiveKit confirm is precisely what
 * > catches it. Without that step this design would hold the door open on the
 * > strength of a row nobody closed."
 *
 * A1's table is explicit about which way the asymmetry runs: the database
 * saying "host present" when they are absent means **a guest walks into an
 * empty room**, which is the failure the whole feature exists to prevent. The
 * opposite error costs somebody a few seconds.
 *
 * **This was untestable until now and dead in production until today.**
 * `participant_joined` was never delivered, so the table held no host rows at
 * all, the check always fell through to LiveKit, and the branch that trusts the
 * database was never taken. Configuring the webhook is what brings it to life.
 */
test.describe("the door and a host who is not there", () => {
  test("a stale open host row does not open the door", async ({ request }) => {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: true });
    try {
      /*
       * The row a missed `participant_left` leaves behind: role host, no
       * `left_at`, and nobody in the LiveKit room — which is true here because
       * no browser ever joined it.
       */
      await addSessions(code, [
        { name: "Abena Poku", identity: `user_${host.id}`, role: "host" },
      ]);

      const response = await request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });

      expect(
        response.status(),
        "the door opened on the strength of a row nobody closed — a guest just walked into an empty room",
      ).toBe(403);
      expect((await response.json()).error).toBe("waiting_for_host");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * **The signed-in case is the one that actually walks in**, and the guest
   * case above cannot show it.
   *
   * Under the old logic a stale row got a guest as far as
   * `waiting_for_admission` — queued, in a queue no host is watching, which is
   * wrong but not the failure A1 names. A signed-in participant passes the
   * second gate by design ("signing in buys accountability… enough to skip the
   * second gate and not the first"), so for them the stale row is the only
   * thing between arriving and being alone in a meeting.
   */
  test("a stale row does not let a signed-in participant into an empty room", async ({
    page,
  }) => {
    const host = await createFixtureHost();
    const member = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: true });
    try {
      await addSessions(code, [
        { name: "Abena Poku", identity: `user_${host.id}`, role: "host" },
      ]);
      await signIn(page, member.email, "/dashboard");

      const response = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });

      expect(
        response.status(),
        "a signed-in participant was let into a room whose host left hours ago",
      ).toBe(403);
      expect((await response.json()).error).toBe("waiting_for_host");
    } finally {
      await deleteFixtureHost(member.id);
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * **Somebody the host already admitted gets in, even when presence says no.**
   *
   * The mitigation A1's own table leans on — "the host sees them in the queue
   * and allows them" — and it was not true while `admitted` was checked after
   * the presence gate. Allowing somebody did not get them in if the gate still
   * said no.
   *
   * It became load-bearing when `hostIsPresent` stopped falling back to LiveKit
   * on a database *no*. Without this, a missed `participant_joined` would make
   * a gated meeting unenterable by anyone at all, including people the host had
   * already let in — a worse outcome than the stale row the confirm step was
   * added to catch.
   *
   * No host row and no LiveKit room here, so presence is a definite no. The
   * only thing that can open this door is the admission itself.
   */
  test("a person the host already admitted is not held by the presence check", async ({
    page,
  }) => {
    const host = await createFixtureHost();
    const member = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: true });
    try {
      // The row a host's "Allow" leaves behind. `subjectFor` builds `user_<id>`
      // for an account, which is what the token route matches on.
      await addWaiting(code, [
        { name: "Kwabena Osei", status: "admitted", userId: member.id },
      ]);
      await signIn(page, member.email, "/dashboard");

      const response = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });

      expect(
        response.status(),
        "the host allowed them and the door still refused — A1's mitigation does not exist",
      ).toBe(200);
    } finally {
      await deleteFixtureHost(member.id);
      await deleteFixtureHost(host.id);
    }
  });
});
