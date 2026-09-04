import { expect, test } from "./fixtures";

import { signIn } from "./auth";
import { generateMeetingCode } from "@/lib/meetings/code";

/**
 * `/`, in its two states — v1.3 E3, and `PRD.md` §3.10a.
 *
 * The page had one state and it was the signed-out one, shown to everybody:
 * "Sign in to start a meeting" is meaningless to someone already signed in, and
 * the hierarchy is upside down for them.
 */
test.describe("the landing page", () => {
  test("signed out: the tagline is the heading, and joining leads", async ({
    page,
  }) => {
    await page.goto("/");

    /**
     * E3: "The tagline is the heading, not the wordmark."
     *
     * The wordmark is still in the header, where it belongs — so this asserts
     * what the *heading* is rather than that the word "Parley" is absent, which
     * would fail on the site header and say nothing about the page.
     */
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText("A link is all anyone needs.");

    // §3.10a's two entry points, in the signed-out order.
    await expect(page.getByLabel("Meeting code")).toBeVisible();
    await expect(page.getByRole("link", { name: /Sign in/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start a meeting" }),
      "a signed-out visitor is offered an action that needs an account",
    ).toHaveCount(0);
  });

  /**
   * E3: "The code field validates before enabling Join — `xxx-xxxx-xxx` against
   * the real alphabet. A permanently grey button that does nothing when pressed
   * is worse than no button."
   *
   * The button used to enable on the first keystroke, so it was pressable
   * through nine of the ten characters and answered every press with the same
   * error.
   */
  test("Join enables only for a well-formed code", async ({ page }) => {
    await page.goto("/");
    const field = page.getByLabel("Meeting code");
    const join = page.getByRole("button", { name: "Join meeting" });

    await expect(join, "Join is enabled with an empty field").toBeDisabled();

    /**
     * Generated, never typed. `CLAUDE.md`'s conventions: a hand-written code
     * containing `0` or `1` is rejected as malformed before any lookup, so a
     * test using one would pass for the wrong reason — and here the *point* is
     * which characters the alphabet contains.
     */
    const code = generateMeetingCode();

    await field.fill(code.slice(0, -1));
    await expect(join, "Join is enabled one character short").toBeDisabled();

    await field.fill(code);
    await expect(join, "Join is disabled for a valid code").toBeEnabled();

    /**
     * And a character outside the alphabet is refused at full length, which is
     * the half a length check alone would miss. `o` is excluded deliberately —
     * it is the one people say aloud for zero.
     */
    await field.fill(`${code.slice(0, -1)}o`);
    await expect(join, "Join accepts a letter outside the alphabet").toBeDisabled();

    /**
     * And it says why.
     *
     * A disabled button with no explanation is silent: ten characters
     * containing an `o` look finished and are not. Incomplete input gets no
     * hint — that is a person still typing, not an error.
     */
    await expect(page.getByText(/no o, i, l, 0 or 1/)).toBeVisible();
    await field.fill(code.slice(0, 4));
    await expect(
      page.getByText(/no o, i, l, 0 or 1/),
      "an incomplete code is reported as malformed",
    ).toHaveCount(0);
  });

  /**
   * The half the enabled/disabled assertions never reach.
   *
   * `submit()` was invoked by no test in the repository: the spec asserted the
   * button's *attribute* and never pressed it, so the navigation — the only
   * thing the form exists to do — was unverified. An adversarial review of this
   * file found it, and it is the shape `CLAUDE.md` warns about: an assertion
   * adjacent to the claim and cheaper to reach.
   */
  test("a valid code navigates to that meeting", async ({ page, meetingCode }) => {
    await page.goto("/");
    await page.getByLabel("Meeting code").fill(meetingCode);
    await page.getByRole("button", { name: "Join meeting" }).click();

    // The real meeting from the fixture, so this lands on pre-join rather than
    // on the unknown-code dead end — which would also be a URL match.
    await page.waitForURL(`**/j/${meetingCode}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  /**
   * Codes are read aloud, so the alphabet was chosen for it — and
   * `normaliseMeetingCode` accepts what that implies. This pins the *choice* of
   * validator: a bare `xxx-xxxx-xxx` pattern test would reject every one of
   * these, so the paragraph in the component justifying `normaliseMeetingCode`
   * is now load-bearing rather than decorative.
   */
  test("spaces, capitals and missing hyphens are all the same code", async ({
    page,
    meetingCode,
  }) => {
    const bare = meetingCode.replace(/-/g, "");
    for (const typed of [bare, bare.toUpperCase(), meetingCode.toUpperCase()]) {
      await page.goto("/");
      const join = page.getByRole("button", { name: "Join meeting" });
      await page.getByLabel("Meeting code").fill(typed);
      await expect(join, `"${typed}" was rejected`).toBeEnabled();
    }
  });

  test("signed in: the hierarchy inverts, and there is no redirect", async ({
    page,
    hostEmail,
  }) => {
    test.setTimeout(120_000);

    // Land on `/` itself, which is the whole point of the state.
    await signIn(page, hostEmail, "/");

    /**
     * E3: "Do not redirect a signed-in visitor to `/dashboard`. They typed the
     * domain or followed a bookmark … without that decision the signed-in state
     * is unreachable and the work is wasted."
     *
     * Asserted first, because every assertion below is vacuous if the page
     * being measured is the dashboard.
     */
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A link is all anyone needs.",
    );

    // Primary is Start a meeting; joining by code drops to secondary.
    await expect(page.getByRole("button", { name: "Start a meeting" })).toBeVisible();
    await expect(page.getByLabel("Meeting code")).toBeVisible();

    // Sign-in is gone — it is meaningless here.
    await expect(
      page.getByRole("link", { name: /Sign in/ }),
      "a signed-in visitor is still offered sign-in",
    ).toHaveCount(0);

    /**
     * The account is named. E3: "someone with two Google accounts should know
     * which one they are in *before* they create a meeting under it."
     */
    await expect(page.getByText(hostEmail)).toBeVisible();

    // And the quiet way through to what they scheduled.
    await expect(page.getByRole("link", { name: /Your meetings/ })).toBeVisible();
  });

  /**
   * The fills, measured rather than read off a class name.
   *
   * "Primary" and "secondary" are the whole of E3's inversion, and a class list
   * is not what a person sees. Signed out, Join is the filled button; signed in,
   * Start a meeting is, and Join is not.
   */
  test("the primary fill moves from Join to Start a meeting", async ({
    page,
    hostEmail,
  }) => {
    test.setTimeout(120_000);

    const filled = () =>
      page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim();
        document.body.appendChild(probe);
        const primary = getComputedStyle(probe).color;
        probe.remove();
        return [...document.querySelectorAll<HTMLElement>("button, a")]
          .filter((el) => el.checkVisibility())
          .filter((el) => getComputedStyle(el).backgroundColor === primary)
          .map((el) => el.textContent?.trim().slice(0, 20) ?? "");
      });

    await page.goto("/");
    expect(await filled(), "signed out, Join is not the filled button").toEqual([
      "Join meeting",
    ]);

    await signIn(page, hostEmail, "/");
    expect(
      await filled(),
      "signed in, Start a meeting is not the only filled button",
    ).toEqual(["Start a meeting"]);
  });
});
