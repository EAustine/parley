import { expect, test } from "./fixtures";

import { signIn } from "./auth";
import { createFixtureHost, createMeeting, deleteFixtureHost } from "./meeting-admin";
import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * The block, and the way out of it — BUILD-PLAN v1.5 B1 and B2.
 *
 * B2's whole argument is an asymmetry: "removing the wrong person and being
 * unable to fix it for ten minutes is a worse outcome than the one the block
 * exists to prevent, and it is the more likely of the two." So the undo is the
 * feature, and the block is what it undoes.
 *
 * **These need `20260906170000_removal_reason.sql` and
 * `20260906190000_block_undo.sql`.** Without them the door has no `attempted_at`
 * to bump and removal has no `removed_at` to write, and every case here fails on
 * a missing column rather than on anything it is about.
 */
test.describe("blocked, and let back in", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  async function hostInside(browser: Parameters<typeof joinAs>[0], gated = true) {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: gated });
    const participant = await joinAs(browser, "Abena Poku", {
      code,
      withMedia: false,
      asHost: host.email,
    });
    open.push(participant);
    return { code, host, participant };
  }

  /**
   * The gap this pass found: **removal was writing no block at all.**
   *
   * B1 says "denied and removed people stay out for ten minutes" and only the
   * deny path did it, so a removed person could rejoin instantly with the link
   * they still had — and A3's "The host removed you from the meeting" screen
   * was unreachable, because nothing ever wrote that reason.
   *
   * Asserted by the *reason*, not just by the refusal. Denied and removed carry
   * the same block, so a test checking only that the door said no would pass
   * with the wrong one written and A3 showing the wrong screen.
   */
  test("removing a signed-in participant blocks them, and says removed", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);
    // Not gated: this is about removal, and a door in the way would mean the
    // participant never got in to be removed from.
    const { code, host, participant } = await hostInside(browser, false);
    const member = await createFixtureHost();
    const guest = await joinAs(browser, "Kwabena Osei", {
      code,
      withMedia: false,
      asHost: member.email,
    });
    open.push(guest);

    try {
      await wakeControls(participant.page);
      await participant.page.getByRole("button", { name: /^Participants/ }).click();
      await participant.page
        .getByRole("button", { name: /^Actions for Kwabena/ })
        .click();
      await participant.page
        .getByRole("menuitem", { name: /Remove from the meeting/ })
        .click();
      await participant.page
        .getByRole("dialog")
        .getByRole("button", { name: "Remove" })
        .click();

      /*
       * Asserted by the *reason*. Denied and removed carry the same refusal, so
       * a case checking only that the door said no would pass with the wrong
       * one written and A3 showing the wrong screen to the person it happened
       * to.
       */
      await signIn(page, member.email, "/dashboard");
      await expect
        .poll(
          async () => {
            const response = await page.request.post("/api/livekit/token", {
              data: { code, displayName: "Kwabena Osei" },
            });
            if (response.status() !== 403) return `status ${response.status()}`;
            return (await response.json()).error;
          },
          { timeout: 30_000 },
        )
        .toBe("removed");
    } finally {
      await deleteFixtureHost(member.id);
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * **Removing a guest keeps them out** — the half of B1 that did not work.
   *
   * This was `test.fixme` for one run, with the reason written where a run would
   * show it. The removal route blocks by LiveKit identity, and a guest's is
   * `guest_<nanoid>` — minted fresh for every connection, so the block was
   * written against a string that would never be presented again and a removed
   * guest could rejoin immediately. For the population B1 is most about,
   * removal did nothing at all.
   *
   * `meeting_identities` closes it: the token endpoint is the only place that
   * sees both the identity it mints and the device cookie behind it, so it
   * records the pair and removal reads it.
   *
   * **The guest here keeps one browser context throughout**, which is the whole
   * point — the device cookie is what carries across their reconnection, and a
   * fresh `request` context would have a different one and prove nothing. That
   * is also the limit, stated in §8 and unchanged: a private window defeats it.
   */
  test("removing a guest keeps them out, by device rather than identity", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const { code, host, participant } = await hostInside(browser, false);
    const guest = await joinAs(browser, "Kwabena Osei", { code, withMedia: false });
    open.push(guest);

    try {
      await wakeControls(participant.page);
      await participant.page.getByRole("button", { name: /^Participants/ }).click();
      await participant.page
        .getByRole("button", { name: /^Actions for Kwabena/ })
        .click();
      await participant.page
        .getByRole("menuitem", { name: /Remove from the meeting/ })
        .click();
      await participant.page
        .getByRole("dialog")
        .getByRole("button", { name: "Remove" })
        .click();

      /*
       * Asked from the guest's own context, so the device cookie rides along —
       * the same browser coming back, which is the case the block is for.
       */
      await expect
        .poll(
          async () => {
            const response = await guest.page.request.post("/api/livekit/token", {
              data: { code, displayName: "Kwabena Osei" },
            });
            if (response.status() !== 403) return `status ${response.status()}`;
            return (await response.json()).error;
          },
          { timeout: 30_000 },
        )
        .toBe("removed");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * B2's undo, end to end from the panel.
   *
   * The block is written by a refusal and cleared by a host, and the door
   * re-reads it — so "let back in" needs no other machinery than deleting the
   * row.
   */
  test("Let back in clears the block and the door opens again", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const { code, host, participant } = await hostInside(browser);
    try {
      await request.post(`/api/meetings/${code}/waiting`, {
        data: { displayName: "Kwabena Osei" },
      });

      await wakeControls(participant.page);
      await participant.page.getByRole("button", { name: /^Participants/ }).click();
      const queue = participant.page.getByRole("region", { name: "Waiting to join" });
      await expect(queue).toBeVisible({ timeout: 20_000 });
      await queue.getByRole("button", { name: /^Deny/ }).click();

      // They are shut out, and the host can see who and why.
      const blockedList = participant.page.getByRole("region", { name: "Blocked" });
      await expect(blockedList).toBeVisible({ timeout: 20_000 });
      await expect(blockedList).toContainText("Kwabena Osei");
      await expect(
        blockedList,
        "the host was not told which of the two things happened",
      ).toContainText("Denied entry");

      const refused = await request.post("/api/livekit/token", {
        data: { code, displayName: "Kwabena Osei" },
      });
      expect(refused.status()).toBe(403);

      // The undo.
      await blockedList.getByRole("button", { name: /^Let Kwabena/ }).click();
      await expect(blockedList).toHaveCount(0, { timeout: 20_000 });

      /*
       * And the door opens. They rejoin the *queue* rather than the room, which
       * is right: clearing a block undoes the refusal, not the waiting room —
       * §3.2's second gate is still there and the host still admits them.
       */
      await expect
        .poll(
          async () => {
            const response = await request.post("/api/livekit/token", {
              data: { code, displayName: "Kwabena Osei" },
            });
            return (await response.json()).error ?? "admitted";
          },
          { timeout: 30_000 },
        )
        .toBe("waiting_for_admission");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * B2: "a blocked person who tries to return surfaces to the host **once**, not
   * once per attempt. A stream of notices for one person hammering reload is a
   * denial of the host's attention."
   *
   * Counted with a `MutationObserver` for the same reason A2's toast case is:
   * the toast dismisses itself, so a snapshot would pass against ten that had
   * each come and gone — which is precisely the behaviour forbidden here.
   */
  test("somebody hammering reload surfaces once, not once per attempt", async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const { code, host, participant } = await hostInside(browser);
    try {
      await request.post(`/api/meetings/${code}/waiting`, {
        data: { displayName: "Kwabena Osei" },
      });
      await wakeControls(participant.page);
      await participant.page.getByRole("button", { name: /^Participants/ }).click();
      const queue = participant.page.getByRole("region", { name: "Waiting to join" });
      await expect(queue).toBeVisible({ timeout: 20_000 });
      await queue.getByRole("button", { name: /^Deny/ }).click();
      await expect(
        participant.page.getByRole("region", { name: "Blocked" }),
      ).toBeVisible({ timeout: 20_000 });

      // Watch before they start knocking.
      await participant.page.evaluate(() => {
        const w = window as unknown as { __rejoin?: string[] };
        w.__rejoin = [];
        new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (!(node instanceof HTMLElement)) continue;
              const toast = node.matches("[data-sonner-toast]")
                ? node
                : node.querySelector("[data-sonner-toast]");
              const text = toast?.textContent ?? "";
              if (/tried to rejoin/.test(text)) w.__rejoin!.push(text);
            }
          }
        }).observe(document.body, { childList: true, subtree: true });
      });

      // Five attempts, spaced past the poll so each is genuinely seen.
      for (let i = 0; i < 5; i++) {
        await request.post("/api/livekit/token", {
          data: { code, displayName: "Kwabena Osei" },
        });
        await participant.page.waitForTimeout(1_200);
      }
      await participant.page.waitForTimeout(6_000);

      const raised = await participant.page.evaluate(
        () => (window as unknown as { __rejoin?: string[] }).__rejoin ?? [],
      );
      expect(
        raised.length,
        `five attempts raised ${raised.length} notices — a stream for one person is a denial of the host's attention`,
      ).toBe(1);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });
});
