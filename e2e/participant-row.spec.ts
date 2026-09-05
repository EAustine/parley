import { expect, test } from "./fixtures";

import {
  expectParticipants,
  joinAs,
  leave,
  wakeControls,
  type Participant,
} from "./room.helpers";

/**
 * The participant row — BUILD-PLAN v1.4 B1, and §3.8's anatomy under it.
 *
 * > "Hovering a row replaced the participant's name with the action buttons, so
 * > the row you were about to remove someone from stopped saying who they were."
 *
 * **It was never hover.** There is no hover logic in `ParticipantsPanel`, and
 * looking for some was the first hour of this. The row was a `min-w-0 flex-1`
 * identity block beside `shrink-0` text buttons, and flex does exactly what that
 * asks: the fixed-width actions win every pixel they need and the name truncates
 * toward nothing. It looked like hover because the buttons are only rendered for
 * a host, so the only people who ever saw the squeeze were the people about to
 * act on the row.
 *
 * That distinction matters for the fix. A hover bug is fixed by changing a
 * hover rule; this is fixed by making the other two zones cost less — one `⋮`
 * instead of two text buttons, and a chip instead of a wrapping second line.
 */
test.describe("the participant row", () => {
  const open: Participant[] = [];

  test.afterEach(async () => {
    while (open.length) {
      const p = open.pop()!;
      await leave(p).catch(() => {});
      await p.context.close().catch(() => {});
    }
  });

  /** Two people, the second signed in as the host, with the panel open. */
  async function hostViewing(browser: Parameters<typeof joinAs>[0], meeting: { code: string; email: string }) {
    const host = await joinAs(browser, "Ama Serwaa", {
      code: meeting.code,
      withMedia: false,
      asHost: meeting.email,
    });
    const guest = await joinAs(browser, "Kwabena Osei-Bonsu", {
      code: meeting.code,
      withMedia: false,
    });
    open.push(host, guest);
    await expectParticipants(host.page, 2);

    await wakeControls(host.page);
    await host.page.getByRole("button", { name: "Participants" }).click();
    return { host, guest };
  }

  /**
   * The defect itself, measured: the name keeps its width with the actions
   * beside it.
   *
   * Asserted as **rendered geometry**, not as a class — the whole failure was a
   * flex negotiation, and every class involved was individually correct. A long
   * name is used on purpose, because a short one fits either way and would pass
   * against the broken row.
   */
  test("identity is not displaced by the host's actions", async ({
    browser,
    hostedMeeting,
  }) => {
    test.setTimeout(180_000);
    const { host } = await hostViewing(browser, hostedMeeting);

    const panel = host.page.getByRole("tabpanel", { name: "People" });
    const name = panel.getByText("Kwabena Osei-Bonsu", { exact: true });
    await expect(name).toBeVisible();

    const box = await name.boundingBox();
    expect(box, "the guest's name rendered no box").not.toBeNull();
    // Not a magic number: it is "enough of the name to identify somebody",
    // and the old row squeezed this toward zero. A name at 15px needs well
    // over 100px to be more than an ellipsis.
    expect(
      Math.round(box!.width),
      "the name is squeezed by the row's actions",
    ).toBeGreaterThan(100);

    /*
     * Proven by mutation: widening the actions zone to 220px fails this case at
     * the `toBeVisible` above rather than at the width bound — the name is not
     * squeezed, it is **gone**, which is the report word for word. The bound
     * still earns its place for a partial squeeze, where the element stays
     * visible and stops being a name.
     */

    // And the row is one line — the other half of the same claim.
    const row = panel.locator("li").filter({ hasText: "Kwabena Osei-Bonsu" });
    const rowBox = await row.boundingBox();
    expect(
      Math.round(rowBox!.height),
      "the row wrapped to more than one line",
    ).toBeLessThan(72);

    /*
     * **What this does not cover, stated rather than implied.** The connection
     * chip is the other thing that used to wrap the row, and it renders only
     * when quality is not good — which it never is in a local test against a
     * healthy SFU. So the one-line claim is exercised here for the identity and
     * actions zones and *not* for the chip. `check:connection` pins the chip's
     * treatment mapping directly; its geometry under a degraded connection is
     * on the manual list, not covered by a green run here.
     */
  });

  /**
   * §3.4 refused two adjacent controls with one destructive, on a *48px* bar.
   * These were smaller. One control now, and the destructive item asks.
   */
  test("the host's powers sit behind one control, and Remove confirms", async ({
    browser,
    hostedMeeting,
  }) => {
    test.setTimeout(180_000);
    const { host, guest } = await hostViewing(browser, hostedMeeting);
    const panel = host.page.getByRole("tabpanel", { name: "People" });

    /*
     * Unmute the guest first, and that is the product being right rather than
     * the fixture being fussy — the same note `mute-request.spec` carries.
     * "Ask to mute" is not offered for somebody already muted (§3.8: a host can
     * silence, never activate), and `withMedia: false` arrives muted. Without
     * this the menu correctly holds one item and the test waits for a second
     * the interface is right not to show.
     */
    await wakeControls(guest.page);
    await guest.page.getByRole("button", { name: "Unmute" }).click();
    await expect(guest.page.getByRole("button", { name: "Mute" })).toBeVisible();

    // Nothing destructive is reachable in the row itself.
    await expect(panel.getByRole("button", { name: /Remove/ })).toHaveCount(0);

    const actions = panel.getByRole("button", { name: /^Actions for Kwabena/ });
    await expect(actions).toBeVisible();
    await actions.click();

    await expect(
      host.page.getByRole("menuitem", { name: /Ask to mute/ }),
    ).toBeVisible();
    await host.page.getByRole("menuitem", { name: /Remove from the meeting/ }).click();

    // It asks rather than acting — the leave menu's shape, reusing its dialog.
    const dialog = host.page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Remove Kwabena Osei-Bonsu from the meeting?");

    // Dismissing changes nothing, which is what makes it a confirmation.
    await dialog.getByRole("button", { name: /Keep|Cancel/ }).first().click();
    await expect(dialog).toBeHidden();
    await expectParticipants(host.page, 2);
  });

  /**
   * The menu is not clipped by the list it lives in.
   *
   * Reported from the deployed app: the row menu's second item was cut off
   * mid-sentence — "They are disconnected straight". The panel body and the
   * participant `<ul>` are both `overflow-y-auto`, and an absolutely positioned
   * menu inside a scroll container is clipped by it. Same class as B2's menu off
   * the left edge, different axis and a different clipper: there it was the
   * viewport, here it is an ancestor.
   *
   * **Asserted by hit-testing, not by comparing rectangles.** A clipped element
   * keeps its box — `getBoundingClientRect` reports the full menu whether or not
   * any of it is painted, which is the same blind spot that let a menu sit at
   * x = -41.8 with every size check green. `elementFromPoint` asks the browser
   * what is actually at that spot, which is the question.
   */
  test("the row menu is not clipped by the panel's scroll container", async ({
    browser,
    hostedMeeting,
  }) => {
    test.setTimeout(180_000);
    /*
     * A phone, and a third person — the conditions the report was made under.
     *
     * At desktop width with two people this passes against the broken build:
     * the drawer is full height, the list is short, and a menu opening below
     * row two has room. The sheet is capped at 55dvh on a phone, so the same
     * menu opens below a row that is already near the bottom. Reproducing the
     * geometry is the test; a viewport that cannot show the bug is a test that
     * reports the fix either way.
     */
    const host = await joinAs(browser, "Ama Serwaa", {
      code: hostedMeeting.code,
      withMedia: false,
      asHost: hostedMeeting.email,
      viewport: { width: 375, height: 667 },
    });
    const guest = await joinAs(browser, "Kwabena Osei-Bonsu", {
      code: hostedMeeting.code,
      withMedia: false,
    });
    const third = await joinAs(browser, "Adwoa Mensimah", {
      code: hostedMeeting.code,
      withMedia: false,
    });
    open.push(host, guest, third);
    await expectParticipants(host.page, 3);

    /*
     * Unmute the guest, which is what makes the menu two items tall.
     *
     * Measured, after three attempts that passed against the broken build: with
     * `withMedia: false` the guest is muted, "Ask to mute" is correctly not
     * offered (§3.8), and the menu is **76px** — one item, which fits with its
     * bottom edge at exactly the list's bottom (563 and 563). The screenshot in
     * the report shows both items, because that guest was unmuted. A second item
     * is what pushes it past the edge, and a muted fixture is a test that cannot
     * see the bug it is named for.
     */
    await wakeControls(guest.page);
    await guest.page.getByRole("button", { name: "Unmute" }).click();
    await expect(guest.page.getByRole("button", { name: "Mute" })).toBeVisible();

    await wakeControls(host.page);
    await host.page.getByRole("button", { name: "Participants" }).click();
    const panel = host.page.getByRole("tabpanel", { name: "People" });
    await expect(
      host.page.getByRole("button", { name: /^Actions for Kwabena/ }),
    ).toBeVisible();
    await panel.getByRole("button", { name: /^Actions for Kwabena/ }).click();
    const menu = host.page.getByRole("menu", { name: /^Actions for / });
    await expect(menu).toBeVisible();

    const hit = await host.page.evaluate(() => {
      /*
       * The *open* one. `PopupMenu` puts `hidden` on the popup wrapper, not on
       * the `role="menu"` element, so every row contributes a menu node to the
       * document and `querySelector` takes the first — which is closed, and
       * measures 0×0. The first version of this probe did exactly that and
       * reported "menu bottom 0", which reads like a clipped menu and was a
       * broken selector.
       */
      /*
       * The *open* one, found by its wrapper rather than by `offsetParent`.
       *
       * `PopupMenu` puts `hidden` on the popup wrapper, not on the `role="menu"`
       * element, so every row contributes a menu node and `querySelector` takes
       * the first — which is closed and measures 0x0. The first version did
       * that and reported "menu bottom 0", which reads like a clipped menu and
       * was a broken selector.
       *
       * The second version used `offsetParent !== null`, which broke on the fix
       * itself: `offsetParent` is **null for a `position: fixed` element**, so
       * every menu looked closed. Asking whether an ancestor carries `hidden`
       * is the question that survives how the thing is positioned.
       */
      const el = [
        ...document.querySelectorAll<HTMLElement>('[role="menu"][aria-label^="Actions for"]'),
      ].find((m) => !m.closest("[hidden]"));
      if (!el) return { found: false as const };
      const box = el.getBoundingClientRect();
      // A point just inside the bottom edge, horizontally centred — the part
      // the screenshot showed sheared off.
      const x = Math.round(box.left + box.width / 2);
      const y = Math.round(box.bottom - 4);
      const at = document.elementFromPoint(x, y);
      return {
        found: true as const,
        insideMenu: !!at && el.contains(at),
        landedOn: at ? `${at.tagName.toLowerCase()}.${(at.className || "").toString().slice(0, 40)}` : "nothing",
        bottom: Math.round(box.bottom),
        viewport: window.innerHeight,
      };
    });

    expect(hit.found, "the row menu rendered nothing to hit-test").toBe(true);
    expect(
      hit.insideMenu,
      `the menu's bottom edge is not painted — clipped. At that point the browser ` +
        `found ${hit.landedOn} (menu bottom ${hit.bottom}, viewport ${hit.viewport}).`,
    ).toBe(true);
  });

  /**
   * B1: "The `⋮` renders always. Hover-reveal is invisible to touch and
   * invisible to keyboard until focus arrives; the host on a phone had no route
   * to Remove."
   *
   * Read on an Android context with no hover at all, which is the device the
   * claim is about — a narrow viewport on a laptop still reports
   * `(hover: hover)`, and that is how C5's share rule stayed green at 375px for
   * a whole version.
   */
  test("the actions control exists on a touch device, and clears the 44px floor", async ({
    browser,
    hostedMeeting,
  }) => {
    test.setTimeout(180_000);
    const host = await joinAs(browser, "Ama Serwaa", {
      code: hostedMeeting.code,
      withMedia: false,
      asHost: hostedMeeting.email,
      android: true,
    });
    const guest = await joinAs(browser, "Kwabena Osei-Bonsu", {
      code: hostedMeeting.code,
      withMedia: false,
    });
    open.push(host, guest);
    await expectParticipants(host.page, 2);

    expect(
      await host.page.evaluate(() => window.matchMedia("(hover: hover)").matches),
      "this context reports hover, so it cannot test the touch case",
    ).toBe(false);

    await wakeControls(host.page);
    await host.page.getByRole("button", { name: "Participants" }).click();
    const actions = host.page.getByRole("button", { name: /^Actions for Kwabena/ });
    await expect(actions).toBeVisible();

    /*
     * The floor, measured rather than resolved from classes — B1 flags this
     * directly: "A 40px `⋮` would be the fourth time the room floor has been
     * undercut by a component that looked fine." `check:targets` walks a state
     * list that never opens this panel with a host in it.
     */
    const box = await actions.boundingBox();
    expect(Math.round(box!.width), "the ⋮ is under the 44px floor").toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.height), "the ⋮ is under the 44px floor").toBeGreaterThanOrEqual(44);
  });

  /**
   * B1's second undiagnosed item: "The mic icon appears unstruck on hover and
   * struck otherwise on the same participant in the same state. If the hover
   * branch renders a different icon, that is a mute-state truth failure in the
   * room's second-most-authoritative surface."
   *
   * There is no hover branch — so this pins the thing that claim was really
   * about, which is rule 3: the row's icon follows the *track*, hovered or not.
   * Read before and during a hover, in both mute states, from the same element.
   */
  test("the mic icon follows the track, hovered or not", async ({
    browser,
    hostedMeeting,
  }) => {
    test.setTimeout(180_000);
    const { host, guest } = await hostViewing(browser, hostedMeeting);
    const panel = host.page.getByRole("tabpanel", { name: "People" });
    const row = panel.locator("li").filter({ hasText: "Kwabena Osei-Bonsu" });

    const micLabel = () =>
      row.locator("[aria-label*='microphone is']").first().getAttribute("aria-label");

    // Muted, at rest and under the pointer.
    await expect.poll(micLabel).toContain("microphone is off");
    await row.hover();
    expect(await micLabel(), "hovering changed what the row says about the mic").toContain(
      "microphone is off",
    );

    // Now unmute them for real, and read the same element again.
    await wakeControls(guest.page);
    await guest.page.getByRole("button", { name: "Unmute" }).click();
    await expect(guest.page.getByRole("button", { name: "Mute" })).toBeVisible();

    await expect.poll(micLabel, { timeout: 20_000 }).toContain("microphone is on");
    await row.hover();
    expect(await micLabel(), "hovering changed what the row says about the mic").toContain(
      "microphone is on",
    );
  });
});
