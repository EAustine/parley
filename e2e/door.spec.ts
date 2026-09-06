import { expect, test } from "./fixtures";

import { signIn } from "./auth";
import { createFixtureHost, createMeeting, deleteFixtureHost } from "./meeting-admin";
import { joinAs, leave, type Participant } from "./room.helpers";

/**
 * The door — BUILD-PLAN v1.5 A1 and B1.
 *
 * > "The meeting link is the entire credential, and until now nothing stood
 * > between holding one and being in the room."
 *
 * Everything here is a **refusal**, which makes the testing rule sharper than
 * usual: a gate that never refuses passes every test that only checks the happy
 * path. So each case drives the refusal itself, and the mutation for all of them
 * is the same — turn `waiting_room` off and the door stops being a door.
 *
 * ## Two gates, not one
 *
 * A1's two sentences read like they disagree. "Nobody enters before a host is
 * present, including the first arrival" governs everybody, signed in or not.
 * "Every guest is admitted by the host individually. Signed-in participants pass
 * straight through" governs what happens *after* that. Confirmed with Austine:
 * a signed-in person waits for the host and then walks in; a guest waits for the
 * host and then waits to be let in.
 *
 * These talk to the endpoint rather than driving pre-join, deliberately. A1 puts
 * the rule in the token endpoint precisely because "the client is the thing
 * being kept out", so a test that only drives the client is testing the wrong
 * layer — it would pass against a door that refuses nothing and a pre-join that
 * politely declines to ask.
 */
test.describe("the waiting room", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /** A gated meeting, and the account that owns it. */
  async function gated() {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: true });
    return { code, host };
  }

  /**
   * The first gate: nobody at all before a host has joined.
   *
   * The alternative — an open door until the host lands — is the one A1
   * rejects, and its reasoning is worth keeping next to the assertion: "the
   * link-holder who should not be there arrives *early*, which is the natural
   * behaviour of anyone unsure of the time." A door that opens for early
   * arrivals is open exactly when the risk is highest.
   */
  test("holds a guest when no host has joined", async ({ page }) => {
    const { code, host } = await gated();
    try {
      const response = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Ama Serwaa" },
      });
      expect(response.status(), "a guest reached a meeting with no host in it").toBe(403);
      expect((await response.json()).error).toBe("waiting_for_host");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * And holds a *signed-in* person too, which is the half that reads like a
   * contradiction and is not.
   */
  test("holds a signed-in participant when no host has joined", async ({ page }) => {
    const { code, host } = await gated();
    const guest = await createFixtureHost();
    try {
      await signIn(page, guest.email, "/dashboard");
      /*
       * A name, even signed in. These fixture accounts are magic-link and carry
       * no `full_name`, so v1.4's rule refuses to name them from their email —
       * and pre-join is what asks. The first version of this omitted it and got
       * `display_name_required` before the door was ever reached, which is the
       * product being right and the test being wrong.
       */
      const response = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Adwoa Mensimah" },
      });
      expect(
        response.status(),
        "signing in walked past the first gate — it should only skip the second",
      ).toBe(403);
      expect((await response.json()).error).toBe("waiting_for_host");
    } finally {
      await deleteFixtureHost(guest.id);
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The host is never held. A door that stops the host is a meeting that never
   * starts, and with no co-host there is nobody else who can open it.
   */
  test("never holds the host", async ({ page }) => {
    const { code, host } = await gated();
    try {
      await signIn(page, host.email, "/dashboard");
      const response = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Abena Poku" },
      });
      expect(
        response.status(),
        "the host was held out of their own meeting, which nobody can undo",
      ).toBe(200);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The second gate, and the difference between the two kinds of person.
   *
   * With a host actually in the room, a signed-in participant walks in and a
   * guest joins the queue. Both halves in one case because the contrast *is*
   * the rule — asserting either alone would pass against a door that treats
   * everybody the same.
   */
  test("with a host present, signed-in walks in and a guest queues", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);
    const { code, host } = await gated();
    const other = await createFixtureHost();
    try {
      // A real host, actually joined — A1: "host presence means joined, not
      // sitting in pre-join."
      const hostParticipant = await joinAs(browser, "Abena Poku", {
        code,
        withMedia: false,
        asHost: host.email,
      });
      open.push(hostParticipant);

      const guest = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });
      expect(guest.status(), "a guest was let straight in past the queue").toBe(403);
      expect((await guest.json()).error).toBe("waiting_for_admission");

      await signIn(page, other.email, "/dashboard");
      const member = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Adwoa Mensimah" },
      });
      expect(
        member.status(),
        "a signed-in participant was queued, but only guests are admitted individually",
      ).toBe(200);
    } finally {
      await deleteFixtureHost(other.id);
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The whole flow: queue, host allows, guest gets in.
   *
   * Uses the routes rather than the panel, because A2's UI does not exist yet
   * and the rule does. When the panel lands it drives these same endpoints.
   */
  test("a host can admit a waiting guest, who then gets a token", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);
    const { code, host } = await gated();
    try {
      const hostParticipant = await joinAs(browser, "Abena Poku", {
        code,
        withMedia: false,
        asHost: host.email,
      });
      open.push(hostParticipant);

      // The guest joins the queue.
      const queued = await page.request.post(`/api/meetings/${code}/waiting`, {
        data: { displayName: "Kwabena Osei" },
      });
      expect(queued.status()).toBe(200);
      expect((await queued.json()).status).toBe("waiting");

      // The host sees exactly one request, by the name that was typed.
      const list = await hostParticipant.page.request.get(`/api/meetings/${code}/waiting`);
      expect(list.status()).toBe(200);
      const { waiting } = await list.json();
      expect(waiting).toHaveLength(1);
      expect(waiting[0].name).toBe("Kwabena Osei");
      /*
       * C1's distinction, asserted at the source: a guest is *typed*, never
       * verified. Signing in buys accountability, not authorisation, and a list
       * that does not say which is which implies an attestation the product
       * cannot make.
       */
      expect(waiting[0].verified, "a guest's typed name was marked as verified").toBe(false);

      await hostParticipant.page.request.post(
        `/api/meetings/${code}/waiting/${waiting[0].id}`,
        { data: { decision: "admit" } },
      );

      const admitted = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });
      expect(admitted.status(), "an admitted guest was still refused a token").toBe(200);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * Deny, and B1's ten minutes.
   *
   * The block is the reason B1 has to exist before A2: without it a denied
   * person re-queues on their next poll and the host answers the same question
   * forever.
   */
  test("denying blocks, and the block outlives the refusal", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);
    const { code, host } = await gated();
    try {
      const hostParticipant = await joinAs(browser, "Abena Poku", {
        code,
        withMedia: false,
        asHost: host.email,
      });
      open.push(hostParticipant);

      await page.request.post(`/api/meetings/${code}/waiting`, {
        data: { displayName: "Kwabena Osei" },
      });
      const { waiting } = await (
        await hostParticipant.page.request.get(`/api/meetings/${code}/waiting`)
      ).json();

      await hostParticipant.page.request.post(
        `/api/meetings/${code}/waiting/${waiting[0].id}`,
        { data: { decision: "deny" } },
      );

      // The door now refuses by name, with the time until it lapses.
      const refused = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });
      expect(refused.status()).toBe(403);
      const body = await refused.json();
      expect(body.error, "a denied person met the queue again instead of the block").toBe(
        "denied",
      );
      expect(
        body.retryAfter,
        "the refusal carried no Retry-After, so the screen cannot say how long",
      ).toBeGreaterThan(0);

      // And they do not silently rejoin the queue for the host to answer twice.
      const requeued = await page.request.post(`/api/meetings/${code}/waiting`, {
        data: { displayName: "Kwabena Osei" },
      });
      expect((await requeued.json()).status, "a denied person re-queued").toBe("denied");

      const again = await (
        await hostParticipant.page.request.get(`/api/meetings/${code}/waiting`)
      ).json();
      expect(again.waiting, "the host was asked the same question twice").toHaveLength(0);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The door only exists when it is switched on.
   *
   * This is the mutation, kept as a case rather than performed by hand: with
   * `waiting_room` false the same guest walks straight in. Without it every
   * assertion above could be satisfied by a token endpoint that refuses
   * everybody for some unrelated reason.
   */
  test("with the waiting room off, a guest walks in", async ({ page }) => {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: false });
    try {
      const response = await page.request.post("/api/livekit/token", {
        data: { code, displayName: "Ama Serwaa" },
      });
      expect(
        response.status(),
        "the door refused with the waiting room off, so the tests above prove nothing",
      ).toBe(200);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });
});
