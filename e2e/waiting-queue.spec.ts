import { expect, test } from "./fixtures";

import { createFixtureHost, createMeeting, deleteFixtureHost } from "./meeting-admin";
import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";
import { POLL_MS } from "../lib/meetings/waiting";

/** Two poll cycles plus slack: every arrival has been seen and announced by now. */
const POLL_SETTLE_MS = POLL_MS * 3;

/**
 * The host's view of the queue — BUILD-PLAN v1.5 A2.
 *
 * The endpoints are already covered by `door.spec`; these are the claims that
 * only exist in the interface, and each one is a thing A2 argues for rather
 * than a thing that merely renders.
 */
test.describe("the queue in People", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /** A gated meeting with the host already inside, which is the only state with a queue. */
  async function hostInside(browser: Parameters<typeof joinAs>[0]) {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: true });
    const participant = await joinAs(browser, "Abena Poku", {
      code,
      withMedia: false,
      asHost: host.email,
    });
    open.push(participant);
    return { code, host, participant };
  }

  /** Somebody queues, without a browser — the request is what matters here. */
  async function queue(
    request: import("@playwright/test").APIRequestContext,
    code: string,
    name: string,
  ) {
    const response = await request.post(`/api/meetings/${code}/waiting`, {
      data: { displayName: name },
    });
    expect(response.status()).toBe(200);
  }

  /**
   * The badge is **taken**, not added to.
   *
   * A2: "three people present and two waiting is not five." So this asserts the
   * number *changes* rather than that some number is present — a badge that
   * summed the two would still show a number, and would still be wrong.
   */
  test("the badge takes the waiting count and hands it back", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const { code, host, participant } = await hostInside(browser);
    try {
      const badge = participant.page.getByRole("button", { name: /^Participants/ });
      await wakeControls(participant.page);

      // One person in the room, nobody waiting: the roster count.
      await expect(badge).toHaveAccessibleName("Participants");
      await expect(participant.page.locator("button[aria-label='Participants'] span"))
        .toHaveText("1");

      await queue(request, code, "Kwabena Osei");

      /*
       * The accessible name carries the change too. §9's floor is that nothing
       * depends on a visual distinction alone, and a badge that silently swaps
       * what it counts is exactly that — the fill tells a sighted host, and the
       * name has to tell everybody else.
       */
      await expect(badge).toHaveAccessibleName("Participants, 1 waiting to join", {
        timeout: 20_000,
      });

      const shown = await participant.page
        .locator("button[aria-label^='Participants'] span")
        .textContent();
      expect(
        shown,
        "the badge summed the roster and the queue — three present and two waiting is not five",
      ).toBe("1");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * One toast, whatever the queue length.
   *
   * A2: "ten people waiting produces **one** toast saying how many, never ten
   * toasts." A rule about the host's attention, so the assertion counts the
   * toasts rather than checking that a toast appeared.
   */
  test("three arrivals produce one toast, not three", async ({ browser, request }) => {
    test.setTimeout(180_000);
    const { code, host, participant } = await hostInside(browser);
    try {
      await wakeControls(participant.page);

      /**
       * Watch, rather than sample — the toast is transient by design.
       *
       * Two earlier versions failed for two different reasons and neither was
       * the product. The first waited on `getByText(/waiting to join/i)` and
       * matched the queue section's own heading, which exists in the closed
       * panel and is hidden (`CLAUDE.md`: scope by role or test id, never by
       * visible text). The second scoped correctly but *sampled*: three
       * sequential queue posts take several seconds, sonner dismisses after
       * four, and the toast had come and gone before the first assertion ran.
       *
       * A `MutationObserver` installed before anybody queues counts every toast
       * that is ever added, which states A2's rule more exactly than a snapshot
       * could: not "one is on screen now" but **one was ever raised**. Ten
       * arrivals producing ten toasts that each dismissed would pass a snapshot
       * and is precisely what the rule forbids.
       */
      await participant.page.evaluate(() => {
        const w = window as unknown as { __toasts?: string[] };
        w.__toasts = [];
        new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (!(node instanceof HTMLElement)) continue;
              const toast = node.matches("[data-sonner-toast]")
                ? node
                : node.querySelector("[data-sonner-toast]");
              if (toast) w.__toasts!.push(toast.textContent ?? "");
            }
          }
        }).observe(document.body, { childList: true, subtree: true });
      });

      for (const name of ["Kwabena Osei", "Adwoa Mensimah", "Kofi Mensah"]) {
        await queue(request, code, name);
      }

      // Long enough for every arrival to have been polled and announced.
      await expect
        .poll(
          () =>
            participant.page.evaluate(
              () => (window as unknown as { __toasts?: string[] }).__toasts?.length ?? 0,
            ),
          { timeout: 20_000 },
        )
        .toBeGreaterThan(0);
      await participant.page.waitForTimeout(POLL_SETTLE_MS);

      const raised = await participant.page.evaluate(
        () => (window as unknown as { __toasts?: string[] }).__toasts ?? [],
      );

      expect(
        raised.length,
        `each arrival raised its own toast, which is a denial of the host's attention — saw ${raised.length}: ${raised.join(" | ")}`,
      ).toBe(1);
      expect(
        raised[0],
        "the one toast did not say how many were waiting",
      ).toContain("waiting to join");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The section, its two answers, and C1's distinction between them.
   *
   * The verified line is the load-bearing part: "a guest can type your name and
   * sit in the roster looking like you", so a queue that does not say which is
   * which implies an attestation the product cannot make.
   */
  test("shows who is waiting, marked as typed, and Allow lets them in", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const { code, host, participant } = await hostInside(browser);
    try {
      await queue(request, code, "Kwabena Osei");

      await wakeControls(participant.page);
      await participant.page.getByRole("button", { name: /^Participants/ }).click();

      const section = participant.page.getByRole("region", { name: "Waiting to join" });
      await expect(section).toBeVisible({ timeout: 20_000 });
      await expect(section).toContainText("Kwabena Osei");
      await expect(
        section,
        "a typed name was presented as an attestation the product cannot make",
      ).toContainText("Guest · name entered");

      // Both answers are present and neither is hidden behind anything.
      await expect(section.getByRole("button", { name: /^Allow/ })).toBeVisible();
      await expect(section.getByRole("button", { name: /^Deny/ })).toBeVisible();

      await section.getByRole("button", { name: /^Allow/ }).click();

      // The row goes, and the badge hands back to the roster count.
      await expect(section).toHaveCount(0, { timeout: 20_000 });
      await expect(
        participant.page.getByRole("button", { name: /^Participants/ }),
      ).toHaveAccessibleName("Participants", { timeout: 20_000 });

      // And the decision reached the door: that person can now get a token.
      const admitted = await request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });
      expect(admitted.status(), "Allow did not actually admit anybody").toBe(200);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * Deny, from the interface, all the way to the block.
   *
   * The endpoint case in `door.spec` proves the block; this proves the button
   * is wired to it, which is the half a route test cannot see.
   */
  test("Deny turns them away and blocks them", async ({ browser, request }) => {
    test.setTimeout(180_000);
    const { code, host, participant } = await hostInside(browser);
    try {
      await queue(request, code, "Kwabena Osei");

      await wakeControls(participant.page);
      await participant.page.getByRole("button", { name: /^Participants/ }).click();
      const section = participant.page.getByRole("region", { name: "Waiting to join" });
      await expect(section).toBeVisible({ timeout: 20_000 });
      await section.getByRole("button", { name: /^Deny/ }).click();
      await expect(section).toHaveCount(0, { timeout: 20_000 });

      const refused = await request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });
      expect(refused.status()).toBe(403);
      expect(
        (await refused.json()).error,
        "Deny did not write the block, so the person simply re-queues",
      ).toBe("denied");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * A guest sees no queue at all.
   *
   * The route already refuses them, so this is about the interface not implying
   * a power that does not exist — §3.8's asymmetry, which the suite has
   * historically only checked from the side that cannot use it.
   */
  test("a participant who is not the host sees no queue section", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const { code, host, participant } = await hostInside(browser);
    /*
     * Signed in, and not the host — which is the only kind of non-host who can
     * *be* in a gated meeting without being admitted first.
     *
     * The first version used a plain guest and hung for the full timeout, which
     * is the product being right: with the waiting room on, a guest is held at
     * the door, so `joinAs` waited for a room they were never let into. §3.2's
     * second gate, working, and a test that had not thought about it.
     */
    const member = await createFixtureHost();
    try {
      const guest = await joinAs(browser, "Adwoa Mensimah", {
        code,
        withMedia: false,
        asHost: member.email,
      });
      open.push(guest);
      void participant;
      await queue(request, code, "Kwabena Osei");

      await wakeControls(guest.page);
      await guest.page.getByRole("button", { name: /^Participants/ }).click();
      await expect(
        guest.page.getByRole("region", { name: "Waiting to join" }),
        "a guest was shown the door's controls",
      ).toHaveCount(0);
    } finally {
      await deleteFixtureHost(member.id);
      await deleteFixtureHost(host.id);
    }
  });
});
