import { test, expect } from "@playwright/test";

import { emptyRoom } from "./livekit-admin";
import {
  LIVE_CODE,
  expectParticipants,
  joinAs,
  wakeControls,
  type Participant,
} from "./room.helpers";

/**
 * §3.5 and §3.6, between two real browsers over the real data channel.
 *
 * The 500ms acceptance criterion is what makes this worth automating: it is a
 * claim about a round trip through the SFU, and nothing measured in one tab
 * can tell you whether it holds.
 */

test.beforeEach(async () => {
  await emptyRoom(LIVE_CODE);
});

async function openChat(p: Participant) {
  await wakeControls(p.page);
  await p.page.getByRole("button", { name: "Open chat" }).click();
  await expect(p.page.getByRole("complementary", { name: "Meeting chat" })).toBeVisible();
}

/**
 * Count reactions as they arrive, rather than sampling how many are on screen.
 *
 * A reaction lives 2400ms and then removes itself, so `toHaveCount(1)` is a
 * race against its own lifetime — it passed, then flaked, which is worse than
 * failing. An observer counts arrivals, which is the thing the assertions are
 * actually about: how many crossed the channel, not how many happen to be
 * painted at the instant Playwright looked.
 */
async function countReactions(p: Participant) {
  await p.page.evaluate(() => {
    const w = window as unknown as { __reactions?: number };
    w.__reactions = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains("parley-reaction")) {
            w.__reactions = (w.__reactions ?? 0) + 1;
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

const reactionsSeen = (p: Participant) =>
  p.page.evaluate(() => (window as unknown as { __reactions?: number }).__reactions ?? 0);

async function say(p: Participant, body: string) {
  await p.page.getByLabel("Message").fill(body);
  await p.page.getByLabel("Message").press("Enter");
}

test.describe("chat", () => {
  let ama: Participant;
  let kwabena: Participant;

  test.afterEach(async () => {
    for (const p of [ama, kwabena]) await p?.context.close().catch(() => {});
  });

  test("crosses between clients well inside 500ms", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { withMedia: false });

    await openChat(ama);
    await openChat(kwabena);

    // Measured from the keypress to the text appearing in the other browser.
    const started = Date.now();
    await say(ama, "Shall we start?");
    await expect(kwabena.page.getByText("Shall we start?")).toBeVisible();
    const elapsed = Date.now() - started;

    // Generous against the 500ms target: Playwright's own round trips are in
    // the measurement, so this is an upper bound on the upper bound. It still
    // fails loudly if the data channel is not actually delivering.
    expect(elapsed, `${elapsed}ms end to end`).toBeLessThan(3000);
    console.log(`  chat end to end: ${elapsed}ms (target < 500ms, plus harness overhead)`);

    // The sender sees their own message too — publishData does not echo, so
    // this only appears if the local copy is being added.
    await expect(ama.page.getByText("Shall we start?")).toBeVisible();

    // Attribution, scoped to the panel. A name also appears on its owner's
    // tile, so an unscoped query matches both and says nothing about either.
    const amaPanel = ama.page.getByRole("complementary", { name: "Meeting chat" });
    const kwabenaPanel = kwabena.page.getByRole("complementary", { name: "Meeting chat" });
    await expect(amaPanel.getByText("You", { exact: true })).toBeVisible();
    await expect(kwabenaPanel.getByText("Ama Serwaa", { exact: true })).toBeVisible();
  });

  test("renders a message as text, never as markup", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { withMedia: false });
    await openChat(ama);
    await openChat(kwabena);

    const hostile = '<img src=x onerror="window.__pwned=1"> and <b>bold</b>';
    await say(ama, hostile);

    // Rule 6. The whole string arrives as text — the tags are visible
    // characters, not elements.
    await expect(kwabena.page.getByText(hostile)).toBeVisible();
    expect(
      await kwabena.page.evaluate(() => "__pwned" in window),
      "an onerror handler ran",
    ).toBe(false);
    expect(
      await kwabena.page.locator("aside b").count(),
      "a <b> element was created from message text",
    ).toBe(0);
  });

  test("autolinks http(s) and leaves javascript: as text", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { withMedia: false });
    await openChat(ama);
    await openChat(kwabena);

    await say(ama, "notes at https://example.com/notes and javascript:alert(1)");

    const link = kwabena.page.locator('aside a[href="https://example.com/notes"]');
    await expect(link).toHaveCount(1);
    // Rule 6 and §8, asserted on the rendered attribute rather than the source.
    await expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    await expect(link).toHaveAttribute("target", "_blank");

    // Nothing else became a link — most of all not the javascript: URL.
    await expect(kwabena.page.locator("aside a")).toHaveCount(1);
    await expect(kwabena.page.getByText("javascript:alert(1)")).toBeVisible();
  });

  test("unread dot appears only while the panel is closed", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { withMedia: false });
    await openChat(ama);

    // Kwabena's panel is shut.
    const chatButton = kwabena.page.getByRole("button", { name: "Open chat" });
    await wakeControls(kwabena.page);
    await expect(chatButton).toHaveAttribute("aria-expanded", "false");

    await say(ama, "Are you there?");
    await expect(chatButton.locator("span")).toHaveCount(1);
    // §9: the sender and the fact of a message, never the body.
    const announcer = kwabena.page.locator('[role="status"][aria-live="polite"]');
    await expect(announcer).toContainText("Ama Serwaa sent a message");
    await expect(announcer).not.toContainText("Are you there?");

    // Opening clears it.
    await openChat(kwabena);
    await expect(kwabena.page.getByRole("button", { name: "Close chat" }).locator("span"))
      .toHaveCount(0);
  });

  test("groups a run of messages under one header, and breaks on a new sender", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { withMedia: false });
    await openChat(ama);
    await openChat(kwabena);

    await say(ama, "one");
    await say(ama, "two");
    await say(ama, "three");
    await expect(kwabena.page.getByText("three")).toBeVisible();

    // §3.5: consecutive messages from the same sender within 60s group under
    // one header. Three messages, one name.
    const headers = kwabena.page
      .getByRole("complementary", { name: "Meeting chat" })
      .getByText("Ama Serwaa", { exact: true });
    await expect(headers).toHaveCount(1);

    await say(kwabena, "hello");
    await expect(ama.page.getByText("hello")).toBeVisible();
    // A different sender always starts a new group.
    await expect(
      ama.page.getByRole("complementary", { name: "Meeting chat" })
        .getByText("You", { exact: true }),
    ).toHaveCount(1);
  });

  test("opening the panel reflows the grid instead of covering it", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    // The letterbox only applies at one participant, so the count is the
    // premise of every measurement below rather than an incidental detail.
    await expectParticipants(ama.page, 1);

    const geometry = () =>
      ama.page.evaluate(() => {
        const grid = document.querySelector<HTMLElement>(".grid");
        const panel = document.querySelector<HTMLElement>('aside[aria-label="Meeting chat"]');
        if (!grid) return null;
        const g = grid.getBoundingClientRect();
        const p = panel?.getBoundingClientRect();
        return {
          ratio: +(g.width / g.height).toFixed(2),
          right: Math.round(g.right),
          panelLeft: p && p.width > 0 ? Math.round(p.left) : null,
          panelWidth: p ? Math.round(p.width) : 0,
        };
      });

    // §3.4: one participant letterboxes to 16:9. Asserted on the *measured*
    // box, not on the computed `aspect-ratio` property — the first version of
    // this declared 16/9 correctly and still rendered 1956px wide inside a
    // 1337px area, because nothing capped the derived dimension.
    const closed = await geometry();
    expect(closed!.ratio, `letterbox ratio with the panel closed`).toBeCloseTo(1.78, 1);

    await openChat(ama);
    const open = await geometry();
    // §3.5: 360px on desktop.
    expect(open!.panelWidth, "panel width").toBe(360);
    // The grid gets narrower and still keeps its shape…
    expect(open!.ratio, "letterbox ratio with the panel open").toBeCloseTo(1.78, 1);
    // …and stops before the panel starts, rather than running underneath it.
    expect(
      open!.right,
      `grid right edge ${open!.right} vs panel left ${open!.panelLeft}`,
    ).toBeLessThanOrEqual(open!.panelLeft!);
  });

  /**
   * §3.5's send half: "the send side disables the input on a brief cooldown."
   *
   * What this test cannot show, and it is worth being exact about it: the
   * *receive* half is what §3.5 calls "the only real enforcement", and no test
   * driven through this UI can distinguish it from the send half. A
   * well-behaved client never sends the sixth message, so the receiver never
   * gets one to drop — deleting the receive-side gate leaves this test passing,
   * which is how the overclaim in its first name was found.
   *
   * Exercising the receive half needs a client that ignores its own limit,
   * which is the threat it exists for and not something reachable from the
   * product's own controls. `npm run check:chat` covers `WindowLimit` directly
   * instead, including that a refusal does not extend the window and that one
   * flooder cannot silence anyone else.
   */
  test("a flood disables the sender's input and reaches nobody as a flood", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { withMedia: false });
    await expectParticipants(ama.page, 2);
    await expectParticipants(kwabena.page, 2);
    await openChat(ama);
    await openChat(kwabena);

    // Eight sent as fast as the input allows; it disables partway through.
    const composer = ama.page.getByLabel("Message");
    for (let i = 1; i <= 8; i++) {
      if (await composer.isEnabled()) {
        await composer.fill(`flood ${i}`);
        await composer.press("Enter");
      }
    }

    // The sender is told why, rather than typing into a void.
    await expect(composer).toBeDisabled();
    await expect(composer).toHaveAttribute("placeholder", /send again in \d+s/);

    // §3.5: five per ten seconds. At the far end, no more than five arrive.
    const kwabenaPanel = kwabena.page.getByRole("complementary", { name: "Meeting chat" });
    await expect(kwabenaPanel.getByText(/^flood 1$/)).toBeVisible();
    await ama.page.waitForTimeout(1500);
    const delivered = await kwabenaPanel.getByText(/^flood \d$/).count();
    expect(delivered, `${delivered} of 8 flood messages rendered`).toBeLessThanOrEqual(5);
    expect(delivered, "nothing got through at all").toBeGreaterThan(0);

    // The cooldown ends by itself; nobody has to reload.
    await expect(composer).toBeEnabled({ timeout: 15_000 });
  });

  test("Escape closes the panel and returns focus to the control", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    await openChat(ama);

    await ama.page.keyboard.press("Escape");
    await expect(
      ama.page.getByRole("complementary", { name: "Meeting chat" }),
    ).toBeHidden();
    // Measured, not inferred from the attribute: `hidden` only hides if a rule
    // says so, and for a `display: flex` element that rule has to be important.
    expect(
      await ama.page.evaluate(() => {
        const panel = document.querySelector('aside[aria-label="Meeting chat"]');
        return panel ? getComputedStyle(panel).display : null;
      }),
    ).toBe("none");
    // A panel that can be opened from the keyboard and not closed from it is a
    // trap; one that closes and drops focus to the body is nearly as bad.
    await expect(ama.page.getByRole("button", { name: "Open chat" })).toBeFocused();
  });
});

test.describe("reactions", () => {
  let ama: Participant;
  let kwabena: Participant;

  test.afterEach(async () => {
    for (const p of [ama, kwabena]) await p?.context.close().catch(() => {});
  });

  test("cross between clients, and rapid pressing yields one a second", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { withMedia: false });
    await expectParticipants(ama.page, 2);
    await expectParticipants(kwabena.page, 2);
    await countReactions(kwabena);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Send a reaction" }).click();
    const applause = ama.page.getByRole("button", { name: "React with applause" });
    await expect(applause).toBeVisible();

    // It arrives at the other end at all.
    await applause.click();
    await expect.poll(() => reactionsSeen(kwabena)).toBe(1);
    // §9: named, not read as an emoji.
    await expect(
      kwabena.page.locator('[role="status"][aria-live="polite"]'),
    ).toContainText("Ama Serwaa reacted with applause");

    // §3.6: "rapid clicking does not queue; extra presses are dropped, not
    // buffered." Twelve presses inside about a second must not become twelve
    // reactions now — and must not become twelve reactions later either, which
    // is what a queue would do.
    const before = await reactionsSeen(kwabena);
    for (let i = 0; i < 12; i++) await applause.click({ delay: 20 });
    await ama.page.waitForTimeout(1200);
    const soonAfter = (await reactionsSeen(kwabena)) - before;
    expect(soonAfter, `${soonAfter} reactions arrived from 12 rapid presses`)
      .toBeLessThanOrEqual(2);

    // Nothing was buffered for release afterwards.
    await ama.page.waitForTimeout(3000);
    const later = (await reactionsSeen(kwabena)) - before;
    expect(later, `${later} arrived in total — extras were queued, not dropped`)
      .toBe(soonAfter);

    // And the screen clears itself.
    await expect(kwabena.page.locator(".parley-reaction")).toHaveCount(0);
  });

  test("never occlude the name label, and disappear on their own", async ({ browser }) => {
    ama = await joinAs(browser, "Ama Serwaa", { withMedia: false });
    kwabena = await joinAs(browser, "Kwabena Osei", { withMedia: false });

    // Both ends have to know about each other before one can react at the
    // other; a reaction sent into a room the receiver has not joined yet is
    // simply lost, and lossy delivery is the design.
    await expectParticipants(ama.page, 2);
    await expectParticipants(kwabena.page, 2);

    await wakeControls(ama.page);
    await ama.page.getByRole("button", { name: "Send a reaction" }).click();
    await ama.page.getByRole("button", { name: "React with a heart" }).click();

    const reaction = kwabena.page.locator(".parley-reaction").first();
    await expect(reaction).toBeVisible();

    // §3.6 acceptance: reactions never occlude the name label. Measured, not
    // assumed — the reaction starts above the label strip and only rises.
    const overlap = await kwabena.page.evaluate(() => {
      const emoji = document.querySelector<HTMLElement>(".parley-reaction");
      const label = document.querySelector<HTMLElement>('[data-participant] span');
      if (!emoji || !label) return null;
      const a = emoji.getBoundingClientRect();
      const b = label.getBoundingClientRect();
      const intersects =
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return { intersects, emojiBottom: Math.round(a.bottom), labelTop: Math.round(b.top) };
    });
    expect(overlap, "no tile label found to compare against").not.toBeNull();
    expect(overlap!.intersects, JSON.stringify(overlap)).toBe(false);

    // §3.6: 2400ms and gone, without anyone dismissing it.
    await expect(kwabena.page.locator(".parley-reaction")).toHaveCount(0, {
      timeout: 6000,
    });
  });
});
