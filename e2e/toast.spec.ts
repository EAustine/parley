import { expect, test } from "./fixtures";

import { signIn } from "./auth";
import { createFixtureHost, createMeeting, deleteFixtureHost } from "./meeting-admin";

/**
 * v1.2 E2: "Toast | 150 in / 100 out".
 *
 * The one piece of motion in the product that came from a dependency's
 * defaults rather than from the spec. Sonner transitions at 400ms on `ease` —
 * measured, not assumed — which is more than twice the table's figure.
 *
 * Asserted as a *consequence* rather than as a duration. Reading
 * `getComputedTiming().duration === 150` would test the stylesheet against
 * itself, which is the trap Track C's panel test fell into: it is one step from
 * reading back the declaration. Seeking the real transition to 150ms and asking
 * where the toast actually is separates 150 from 400, because at 150ms into a
 * 400ms transition it is nowhere near arrived.
 */
test("a toast arrives in 150ms, not the dependency's 400", async ({ page }) => {
  const host = await createFixtureHost();
  try {
    await createMeeting({ host: host.id, title: "Toast timing" });
    await signIn(page, host.email, "/dashboard");
    await expect(page.getByRole("heading", { name: "Meetings" })).toBeVisible();

    await page.getByRole("button", { name: /copy link/i }).first().click();

    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeAttached({ timeout: 10_000 });
    /*
     * Deliberately not asserting *which* toast. The clipboard is unavailable in
     * this browser context, so `CopyLinkButton` correctly raises its "your
     * browser blocked the clipboard" error toast instead of "Link copied" —
     * and this test is about how fast a toast arrives, not which one. Pinning
     * the copy here would make a timing test fail for a clipboard permission,
     * and CLAUDE.md's "the same action keeps its name through the flow" is a
     * different claim that belongs with the copy, not with the motion.
     */

    const settled = await toast.evaluate((el) => {
      const opacity = el
        .getAnimations()
        .find((a) => (a as CSSTransition).transitionProperty === "opacity");
      if (!opacity) {
        // Already finished: at 150ms it may well have, which is itself the
        // property under test — a 400ms transition would still be running.
        return { finishedAlready: true, opacityAt150: getComputedStyle(el).opacity };
      }
      opacity.pause();
      opacity.currentTime = 150;
      return { finishedAlready: false, opacityAt150: getComputedStyle(el).opacity };
    });

    expect(
      Number(settled.opacityAt150),
      `toast opacity at 150ms was ${settled.opacityAt150} (finished already: ${settled.finishedAlready})`,
    ).toBeGreaterThan(0.95);
  } finally {
    await deleteFixtureHost(host.id);
  }
});
