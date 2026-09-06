import { expect, test } from "./fixtures";

import { createFixtureHost, createMeeting, deleteFixtureHost } from "./meeting-admin";
import { joinAs, leave, type Participant, GATED_JOIN_TIMEOUT } from "./room.helpers";

/**
 * The waiting screen — BUILD-PLAN v1.5 A3.
 *
 * > "Five terminal states that must not share a screen."
 *
 * §3.11 already refuses to let a dropped connection, a voluntary leave and a
 * host ending the meeting share one screen. A3 extends that from three to five,
 * and the two new ones differ only in what happened to you: **denied and
 * removed carry the same ten-minute block and different words.** Telling
 * somebody they were ejected when they were turned away is the same class of
 * error as §3.2's cancelled meeting reading as one you missed.
 *
 * So each case here asserts the *words*, not just that some screen appeared.
 * A test that only checked "a waiting screen is up" would pass with all five
 * endings collapsed into one, which is the exact thing A3 exists to prevent.
 */
test.describe("waiting at the door", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  async function gated() {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: true });
    return { code, host };
  }

  /** Pre-join, named, joined — the flow a guest actually takes. */
  async function joinAndBeHeld(page: import("@playwright/test").Page, code: string) {
    await page.goto(`/j/${code}`);
    await page.getByLabel("Your name").fill("Kwabena Osei");
    await page.getByRole("button", { name: /^Join/ }).click();
  }

  /**
   * No host yet, and the screen says which wait this is.
   *
   * The heading distinguishes it from waiting to be admitted, and both differ
   * from every ending — that separation is the whole of A3.
   */
  test("says it is waiting for the host, and Leave works immediately", async ({ page }) => {
    const { code, host } = await gated();
    try {
      await joinAndBeHeld(page, code);

      await expect(
        page.getByRole("heading", { name: "Waiting for the host to let you in" }),
      ).toBeVisible({ timeout: 20_000 });

      /*
       * A3: "Escapable throughout. Leave is live from the first second." §3.11's
       * rule about the reconnect countdown, applied to a wait whose length
       * nobody controls and which A1 admits may never end — there is no
       * co-host, so a host who never arrives means a meeting nobody enters.
       */
      const leaveLink = page.getByRole("link", { name: "Leave" });
      await expect(leaveLink).toBeVisible();
      await leaveLink.click();
      await page.waitForURL((url) => new URL(url).pathname === "/");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * Nothing publishes while waiting — v1.4 A1's rule reaching one step back.
   *
   * Asserted the way the consent spec asserts it: by counting `getUserMedia`,
   * because a track cannot exist without a call that resolved. Checking the
   * chips would only prove the interface says the right thing, and A3's claim
   * is about what is happening, not what is displayed.
   */
  test("publishes nothing while held, and holds the device choice", async ({
    browser,
  }) => {
    const { code, host } = await gated();
    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    await context.addInitScript(() => {
      const w = window as unknown as { __gum?: { calls: string[] } };
      w.__gum = { calls: [] };
      const media = navigator.mediaDevices;
      if (!media) return;
      const real = media.getUserMedia.bind(media);
      media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        w.__gum!.calls.push(location.pathname);
        return real(constraints);
      };
    });
    const page = await context.newPage();

    try {
      await page.goto(`/j/${code}`);
      // Grant, so the held state is "on" rather than "off by default" — the
      // interesting case, since off-by-default would publish nothing anyway.
      await page.getByRole("button", { name: "Allow camera and microphone" }).click();
      await expect(
        page.getByRole("button", { name: /Turn (off|on) microphone/ }),
      ).toBeVisible({ timeout: 20_000 });
      await page.getByLabel("Your name").fill("Kwabena Osei");
      await page.getByRole("button", { name: /^Join/ }).click();

      await expect(
        page.getByRole("heading", { name: "Waiting for the host to let you in" }),
      ).toBeVisible({ timeout: 20_000 });

      // The choice is held and shown, so a person can see what will be on.
      await expect(page.getByText("Mic on")).toBeVisible();
      await expect(page.getByText("Camera on")).toBeVisible();

      const before = await page.evaluate(() => {
        const w = window as unknown as { __gum?: { calls: string[] } };
        return (w.__gum?.calls ?? []).length;
      });
      await page.waitForTimeout(4_000);
      const after = await page.evaluate(() => {
        const w = window as unknown as { __gum?: { calls: string[] } };
        return (w.__gum?.calls ?? []).length;
      });

      expect(
        after - before,
        "the waiting screen asked the browser for a device — a person who is not in a meeting is not on camera in it",
      ).toBe(0);
    } finally {
      await context.close();
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * Admitted, and the screen hands over to the room rather than to itself.
   *
   * The whole path: held, host allows, the guest lands in the meeting. This is
   * the case that proves the poll and the handoff agree — pre-join owns the
   * token, so admission has to route back through it.
   */
  test("goes into the meeting when the host allows", async ({ browser, page }) => {
    test.setTimeout(GATED_JOIN_TIMEOUT);
    const { code, host } = await gated();
    try {
      const hostParticipant = await joinAs(browser, "Abena Poku", {
        code,
        withMedia: false,
        asHost: host.email,
      });
      open.push(hostParticipant);

      await joinAndBeHeld(page, code);
      await expect(
        page.getByRole("heading", { name: /Waiting for the host/ }),
      ).toBeVisible({ timeout: 20_000 });

      const { waiting } = await (
        await hostParticipant.page.request.get(`/api/meetings/${code}/waiting`)
      ).json();
      expect(waiting).toHaveLength(1);
      await hostParticipant.page.request.post(
        `/api/meetings/${code}/waiting/${waiting[0].id}`,
        { data: { decision: "admit" } },
      );

      await page.waitForURL(`**/room/${code}`, { timeout: 30_000 });
      await expect(
        page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
      ).toBeAttached({ timeout: 60_000 });
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * Denied — its own words, and not the removed ones.
   *
   * The assertion names the copy on purpose. Both endings carry the same block,
   * so a screen that said the wrong one would look correct in every way that a
   * status code or a URL could check.
   */
  test("denied says it was denied, not that it was removed", async ({
    browser,
    page,
  }) => {
    test.setTimeout(GATED_JOIN_TIMEOUT);
    const { code, host } = await gated();
    try {
      const hostParticipant = await joinAs(browser, "Abena Poku", {
        code,
        withMedia: false,
        asHost: host.email,
      });
      open.push(hostParticipant);

      await joinAndBeHeld(page, code);
      await expect(
        page.getByRole("heading", { name: /Waiting for the host/ }),
      ).toBeVisible({ timeout: 20_000 });

      const { waiting } = await (
        await hostParticipant.page.request.get(`/api/meetings/${code}/waiting`)
      ).json();
      await hostParticipant.page.request.post(
        `/api/meetings/${code}/waiting/${waiting[0].id}`,
        { data: { decision: "deny" } },
      );

      await expect(
        page.getByRole("heading", { name: "The host didn’t let you in" }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: /removed you/ }),
        "a denied person was told they were removed",
      ).toHaveCount(0);
      // The way out is the one that can actually work — never a retry against
      // a ten-minute block, which is a button that exists to fail.
      await expect(page.getByRole("link", { name: "Back to Parley" })).toBeVisible();
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The meeting ending under somebody who is waiting — the fifth ending, and
   * the only one that is not about them personally.
   */
  test("says the meeting ended when it ends while waiting", async ({ page }) => {
    const { code, host } = await gated();
    try {
      await joinAndBeHeld(page, code);
      await expect(
        page.getByRole("heading", { name: /Waiting for the host/ }),
      ).toBeVisible({ timeout: 20_000 });

      // Ended out from under them, the way `room_finished` would.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      await fetch(`${url}/rest/v1/meetings?code=eq.${code}`, {
        method: "PATCH",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }),
      });

      await expect(
        page.getByRole("heading", { name: "This meeting has ended" }),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await deleteFixtureHost(host.id);
    }
  });
});
