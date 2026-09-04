import { expect, test } from "./fixtures";

import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * Leave, and "End meeting for everyone" — v1.3 B1.
 *
 * `CLAUDE.md`'s vocabulary has always said these are different actions that are
 * never conflated, and until now only one of them existed. The tests that
 * matter here are the ones about the *difference*: that a guest is never
 * offered the destructive one, that reaching it takes a deliberate second step,
 * and that everyone lands somewhere that tells them what happened rather than
 * blaming their connection.
 */
test.describe("leaving, and ending", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    for (const p of open.splice(0)) {
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  const join = async (...args: Parameters<typeof joinAs>) => {
    const p = await joinAs(...args);
    open.push(p);
    return p;
  };

  const leaveButton = (p: Participant) =>
    p.page.getByRole("button", { name: "Leave", exact: true });

  test("a guest is offered no menu, and leaves in one press", async ({
    browser,
    meetingCode,
  }) => {
    const guest = await join(browser, "Kojo Antwi", { code: meetingCode });
    await wakeControls(guest.page);

    /**
     * B1: "A guest has no second option, so for them the button leaves
     * directly and renders no chevron."
     *
     * `aria-haspopup` is the assertion rather than the chevron's presence,
     * because that attribute is the promise — a control that announces a popup
     * and then acts is worse than one that never claimed to have one.
     */
    await expect(leaveButton(guest)).not.toHaveAttribute("aria-haspopup");
    await expect(leaveButton(guest)).not.toHaveAttribute("aria-expanded");

    await leaveButton(guest).click();
    await expect(guest.page.getByRole("heading", { name: "You left the meeting" })).toBeVisible();
    // Leaving is reversible, so this one keeps its way back.
    await expect(guest.page.getByRole("link", { name: "Rejoin" })).toBeVisible();
  });

  test("a host's whole Leave button opens a menu, not a split target", async ({
    browser,
    hostedMeeting,
  }) => {
    const host = await join(browser, "Abena Poku", {
      code: hostedMeeting.code,
      asHost: hostedMeeting.email,
    });
    await wakeControls(host.page);

    await expect(leaveButton(host)).toHaveAttribute("aria-haspopup", "menu");
    await expect(leaveButton(host)).toHaveAttribute("aria-expanded", "false");

    /**
     * The whole button, and this is the point of the test.
     *
     * B1 rejects a split button because "on a 40px mobile bar the target
     * separating 'leave' from 'end this for everyone' is about 30px wide. That
     * is a mis-click costing other people their meeting." Clicking the button's
     * own centre must therefore *open* rather than leave — a split would have
     * left the meeting from here.
     */
    await leaveButton(host).click();
    await expect(leaveButton(host)).toHaveAttribute("aria-expanded", "true");
    await expect(host.page.getByRole("menu", { name: "Leave options" })).toBeVisible();
    await expect(
      host.page.getByRole("menuitem", { name: /Leave the meeting/ }),
    ).toBeVisible();
    await expect(
      host.page.getByRole("menuitem", { name: /End meeting for everyone/ }),
    ).toBeVisible();

    // Still in the meeting: opening the menu is not an action.
    await expect(host.page.getByRole("heading", { name: /Meeting, \d+ participant/ })).toBeAttached();
  });

  test("the destructive item carries hue, on an opaque surface", async ({
    browser,
    hostedMeeting,
  }) => {
    const host = await join(browser, "Abena Poku", {
      code: hostedMeeting.code,
      asHost: hostedMeeting.email,
    });
    await wakeControls(host.page);
    await leaveButton(host).click();

    /**
     * Rule 5 says hue is spent on destructive actions, and rule 4 says a hued
     * indicator sits on an opaque chip rather than the scrim — `--state-critical`
     * over video is 2.53:1.
     *
     * Measured, not read back from a class. The menu is positioned over the
     * room, so "is its backdrop opaque" is a real question about a real
     * rendering, and the answer is what `check:scrim` would otherwise have to
     * catch after the fact.
     */
    const measured = await host.page.evaluate(() => {
      const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (el) => /End meeting for everyone/.test(el.textContent ?? ""),
      )!;
      /**
       * Read the tokens **from the item**, not from `:root`.
       *
       * Rule 8b forces `.dark` on a wrapper inside the room route rather than
       * on `<html>`, so `:root` still carries the light palette. Reading
       * `--state-critical` there returns `#C62B31` and compares it against the
       * `#F26669` the room actually paints — a failure that says the colour is
       * wrong when both are right. Custom properties inherit, so the element's
       * own computed style is the one that resolves them the way it is drawn.
       */
      const scope = getComputedStyle(item);
      const alphaOf = (c: string) => {
        const m = c.match(/^rgba?\(([^)]+)\)$/);
        if (!m) return 1;
        const parts = m[1].split(",").map((p) => Number(p.trim()));
        return parts.length < 4 ? 1 : parts[3];
      };
      // The nearest painted backdrop, the same walk `e2e/scrim.ts` does.
      let node: HTMLElement | null = item;
      let backdrop = "";
      while (node) {
        const s = getComputedStyle(node);
        if (alphaOf(s.backgroundColor) === 1) {
          backdrop = s.backgroundColor;
          break;
        }
        node = node.parentElement;
      }
      const asRgb = (hex: string) => {
        const probe = document.createElement("span");
        probe.style.color = hex.trim();
        document.body.appendChild(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      return {
        colour: getComputedStyle(item).color,
        critical: asRgb(scope.getPropertyValue("--state-critical")),
        backdrop,
        popover: asRgb(scope.getPropertyValue("--popover")),
      };
    });

    expect(measured.colour, "the destructive item is not --state-critical").toBe(
      measured.critical,
    );
    expect(
      measured.backdrop,
      "the menu is not on an opaque --popover — hue over video is 2.53:1",
    ).toBe(measured.popover);
  });

  /**
   * The native dialog actually paints its backdrop.
   *
   * `::backdrop` is the one place in this change where a token could silently
   * fail to resolve: it inherits from its originating element in current
   * browsers and did not always, and a `var()` that resolves to nothing gives
   * a *transparent* backdrop rather than an error. The modal would still trap
   * focus and still be dismissible, so nothing else in the suite would notice
   * — the room would simply stay fully lit behind the most destructive
   * confirmation in the product.
   */
  test("the confirmation dims the room behind it", async ({
    browser,
    hostedMeeting,
  }) => {
    const host = await join(browser, "Abena Poku", {
      code: hostedMeeting.code,
      asHost: hostedMeeting.email,
    });
    await wakeControls(host.page);
    await leaveButton(host).click();
    await host.page.getByRole("menuitem", { name: /End meeting for everyone/ }).click();
    await expect(host.page.getByRole("dialog")).toBeVisible();

    const backdrop = await host.page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]")!;
      return getComputedStyle(dialog, "::backdrop").backgroundColor;
    });

    // Any of the ways "nothing was painted" comes back.
    expect(
      ["", "transparent", "rgba(0, 0, 0, 0)"].includes(backdrop),
      `::backdrop resolved to "${backdrop}" — var(--scrim) did not reach it`,
    ).toBe(false);

    /**
     * Dismiss before the teardown, and the reason is worth keeping.
     *
     * `afterEach` leaves by clicking Leave, and a modal `<dialog>` makes
     * everything behind it inert — so the click never lands and the hook times
     * out. That is the native trap working exactly as B1 wanted it to, on the
     * first test that left it open. Escape is the dismissal a person has too.
     */
    await host.page.keyboard.press("Escape");
    await expect(host.page.getByRole("dialog")).toHaveCount(0);
  });

  test("Escape closes the menu and puts focus back on Leave", async ({
    browser,
    hostedMeeting,
  }) => {
    const host = await join(browser, "Abena Poku", {
      code: hostedMeeting.code,
      asHost: hostedMeeting.email,
    });
    await wakeControls(host.page);
    await leaveButton(host).click();

    // Focus moves into the menu on open, which is what makes it usable by
    // keyboard and what gives Escape somewhere to return from.
    await expect(host.page.getByRole("menuitem", { name: /Leave the meeting/ })).toBeFocused();

    await host.page.keyboard.press("ArrowDown");
    await expect(
      host.page.getByRole("menuitem", { name: /End meeting for everyone/ }),
    ).toBeFocused();

    await host.page.keyboard.press("Escape");
    await expect(leaveButton(host)).toHaveAttribute("aria-expanded", "false");
    await expect(leaveButton(host)).toBeFocused();
  });

  test("ending disconnects everyone, and says who did it", async ({
    browser,
    hostedMeeting,
  }) => {
    test.setTimeout(120_000);

    const host = await join(browser, "Abena Poku", {
      code: hostedMeeting.code,
      asHost: hostedMeeting.email,
    });
    const guest = await join(browser, "Kojo Antwi", { code: hostedMeeting.code });

    await expect(
      guest.page.getByRole("heading", { name: /Meeting, 2 participants/ }),
    ).toBeAttached();

    await wakeControls(host.page);
    await leaveButton(host).click();
    await host.page.getByRole("menuitem", { name: /End meeting for everyone/ }).click();

    // The menu is a choice; the dialog is the commitment.
    const dialog = host.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "End this meeting for everyone?" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "End meeting" }).click();

    /**
     * Everyone else is told what happened — not that their connection dropped.
     *
     * This is the assertion the `ROOM_DELETED` branch exists for: without it
     * the guest gets `useRoomConnection`'s "Parley kept trying and the
     * connection didn't come back", which is false and blames their network for
     * someone else's decision.
     */
    await expect(
      guest.page.getByRole("heading", { name: "The host ended the meeting" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      host.page.getByRole("heading", { name: "You ended the meeting" }),
    ).toBeVisible({ timeout: 30_000 });

    // No Rejoin, on either. The token endpoint refuses an ended meeting, so the
    // button would exist only to fail.
    await expect(guest.page.getByRole("link", { name: "Rejoin" })).toHaveCount(0);
    await expect(host.page.getByRole("link", { name: "Rejoin" })).toHaveCount(0);
  });

  test("and the link stops working", async ({ browser, hostedMeeting }) => {
    test.setTimeout(120_000);

    const host = await join(browser, "Abena Poku", {
      code: hostedMeeting.code,
      asHost: hostedMeeting.email,
    });

    await wakeControls(host.page);
    await leaveButton(host).click();
    await host.page.getByRole("menuitem", { name: /End meeting for everyone/ }).click();
    await host.page.getByRole("dialog").getByRole("button", { name: "End meeting" }).click();
    await expect(
      host.page.getByRole("heading", { name: "You ended the meeting" }),
    ).toBeVisible({ timeout: 30_000 });

    /**
     * B1: "Everyone is disconnected and the link stops working." The menu item
     * says so, so it has to be true — and it is true because the row is now
     * `ended` and the token endpoint already refuses that, which is the point
     * of ending on the server rather than only disconnecting people.
     *
     * A fresh context, because this is about the link rather than about the
     * person who was in the meeting.
     */
    const stranger = await browser.newContext();
    const page = await stranger.newPage();
    await page.goto(`/j/${hostedMeeting.code}`);
    await expect(
      page.getByRole("heading", { name: /ended/i }),
    ).toBeVisible({ timeout: 30_000 });
    await stranger.close();
  });
});
