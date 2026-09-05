import { devices } from "@playwright/test";

import { expect, test } from "./fixtures";
import { signIn } from "./auth";
import { createFixtureHost, createMeeting, deleteFixtureHost } from "./meeting-admin";

/**
 * The schedule form and the meeting page — BUILD-PLAN v1.3 D3 and D4.
 *
 * Done together because they are one component tree: `MeetingSchedule` renders
 * `ScheduleForm` in edit mode, so the form *is* part of the meeting page. The
 * section-heading treatment and the two-zone preview had to be settled once for
 * both, and the stuck-after-edit bug below lives exactly on the seam.
 *
 * **Nothing exercised any of this before.** Not one test touched the detail
 * page's controls — not Copy, not the calendar chips, not Edit, not Cancel.
 * That is how a permanently stuck edit mode and a silently swallowed clipboard
 * failure both shipped.
 *
 * This spec owns its fixtures.
 */

const WEEK = 7 * 86_400_000;

async function scheduled(title = "Quarterly planning") {
  const host = await createFixtureHost();
  const start = new Date(Date.now() + WEEK);
  const code = await createMeeting({
    host: host.id,
    status: "scheduled",
    title,
    scheduledStart: start,
    scheduledEnd: new Date(start.getTime() + 30 * 60_000),
    timezone: "America/New_York",
  });
  return { host, code };
}

test.describe("the meeting page", () => {
  /**
   * The bug this spec was written for.
   *
   * `ScheduleForm` finished a save with `router.push("/schedule/" + code)` —
   * the URL it was already on. A no-op navigation, so `editing` never flipped
   * back: the page stayed in the form with its submit disabled and reading
   * "Saving…", permanently, with no way out but a reload. The save had worked.
   * Nothing threw, nothing was logged, and no test looked.
   */
  test("finishing an edit returns to the meeting, with the change on it", async ({ page }) => {
    const { host, code } = await scheduled();
    try {
      await signIn(page, host.email, `/schedule/${code}`);
      await page.getByRole("button", { name: "Edit" }).click();

      const title = page.getByLabel("Title");
      await expect(title).toHaveValue("Quarterly planning");
      await title.fill("Quarterly planning, moved");
      await page.getByRole("button", { name: "Save changes" }).click();

      // Back on the meeting, not stuck in the form.
      await expect(page.getByRole("heading", { name: "Meeting link" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Quarterly planning, moved" })).toBeVisible();
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /** And leaving without saving gets back too, changing nothing. */
  test("cancelling an edit returns to the meeting unchanged", async ({ page }) => {
    const { host, code } = await scheduled();
    try {
      await signIn(page, host.email, `/schedule/${code}`);
      await page.getByRole("button", { name: "Edit" }).click();
      await page.getByLabel("Title").fill("Not saved");
      await page.getByRole("button", { name: "Cancel", exact: true }).click();

      await expect(page.getByRole("heading", { name: "Meeting link" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Quarterly planning" })).toBeVisible();
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D4: "'Email an invite' — a `mailto:` with subject and body pre-filled."
   *
   * **No recipient**, which is what makes "no provider, no deliverability, no
   * bounce handling" true: the product never learns who was invited. And the
   * body carries the zone label, because §3.9's trap is worse in an email than
   * on a screen — the reader has no form to check it against, and the message
   * outlives the page.
   */
  test("Email an invite is a mailto with no recipient, a subject and a dated body", async ({ page }) => {
    const { host, code } = await scheduled("Design review");
    try {
      await signIn(page, host.email, `/schedule/${code}`);
      const href = await page
        .getByRole("link", { name: "Email an invite" })
        .getAttribute("href");

      expect(href, "the invite should be a mailto").toMatch(/^mailto:\?/);
      // Nothing between the scheme and the query — no To.
      expect(href!.slice("mailto:".length, "mailto:".length + 1)).toBe("?");

      const params = new URLSearchParams(href!.slice("mailto:?".length));
      expect(params.get("subject")).toBe("Invitation: Design review");
      const body = params.get("body")!;
      expect(body).toContain("Design review");
      expect(body).toContain(`/j/${code}`);
      // The zone label, spelled, on the line a reader will act from.
      expect(body, "the body must carry a zone label").toMatch(
        /\d{2}:\d{2} – \d{2}:\d{2} [A-Z]{2,5}|\d{2}:\d{2} – \d{2}:\d{2} GMT/,
      );
      expect(body).toContain("They don't need an account.");
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D4 puts the four invite routes together, and the email leads.
   *
   * `.ics` is a real navigation to a route that sets `Content-Disposition`, not
   * a fetch — asserted as a `download` attribute rather than by clicking it,
   * because a download in a test context proves the harness works.
   */
  test("the invite section holds four routes, email first", async ({ page }) => {
    const { host, code } = await scheduled();
    try {
      await signIn(page, host.email, `/schedule/${code}`);
      const section = page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Invite people" }) });
      const names = await section.getByRole("link").allTextContents();
      expect(names.map((n) => n.trim())).toEqual([
        "Email an invite",
        "Download .ics",
        "Google Calendar",
        "Outlook",
      ]);
      await expect(section.getByRole("link", { name: "Download .ics" })).toHaveAttribute(
        "download",
        `${code}.ics`,
      );
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D4 + Austine's call: cancelling asks first.
   *
   * There is no un-cancel path in the API, so a misclick was unrecoverable from
   * the UI — and the room's equivalent has confirmed since B1. Asserted as a
   * *modal*: `showModal()` is what makes the page behind it inert, and a
   * `<dialog>` opened with `show()` looks identical and traps nothing.
   */
  test("cancelling asks first, and dismissing it changes nothing", async ({ page }) => {
    const { host, code } = await scheduled();
    try {
      await signIn(page, host.email, `/schedule/${code}`);
      await page.getByRole("button", { name: "Cancel meeting" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Quarterly planning");
      expect(
        await dialog.evaluate((el) => (el as HTMLDialogElement).matches(":modal")),
        "a confirm that does not trap is not a confirm",
      ).toBe(true);

      // The way out is not called "Cancel" — two buttons a word apart, one
      // cancelling the meeting and one cancelling the cancelling.
      await expect(dialog.getByRole("button", { name: "Keep it" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      await page.reload();
      await expect(page.getByText("This meeting was cancelled")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Cancel meeting" })).toBeVisible();
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  test("and confirming cancels it", async ({ page }) => {
    const { host, code } = await scheduled();
    try {
      await signIn(page, host.email, `/schedule/${code}`);
      await page.getByRole("button", { name: "Cancel meeting" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel meeting" }).click();

      await expect(page.getByText("This meeting was cancelled")).toBeVisible({
        timeout: 20_000,
      });
      // Edit and Cancel are gone: there is nothing left to do to it.
      await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Cancel meeting" })).toHaveCount(0);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });
});

test.describe("the schedule form", () => {
  /**
   * D3: three questions rather than a flat stack of six fields.
   *
   * Asserted as headings in order, because the sections *are* the structure —
   * a screen reader's outline is how someone skips between them, and a styled
   * `<p>` would look identical and be absent from it.
   */
  test("is three sections, and they are real headings", async ({ page }) => {
    const host = await createFixtureHost();
    try {
      await signIn(page, host.email, "/schedule");
      await expect(page.getByLabel("Title")).toBeVisible();
      expect(
        await page.getByRole("heading", { level: 2 }).allTextContents(),
      ).toEqual(["What it is", "When it is", "Check it"]);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D3's preview, computed from the form.
   *
   * The title fallback matters for the reason D3 gives — "so the card does not
   * jump while typing" — and the card degrading rather than vanishing matters
   * because the section headed "Check it" being empty at the moment there is
   * something to check is the state that used to ship.
   */
  test("the preview is computed, and survives an unfinished form", async ({ page }) => {
    const host = await createFixtureHost();
    try {
      await signIn(page, host.email, "/schedule");
      const card = page.getByRole("status");
      await expect(card).toContainText("Untitled meeting");

      await page.getByLabel("Title").fill("Design review");
      await expect(card).toContainText("Design review");
      await expect(card).not.toContainText("Untitled meeting");

      // Day spelled out, both ends of the slot, and the zone label.
      await expect(card).toContainText(
        /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} [A-Z][a-z]+, \d{2}:\d{2} – \d{2}:\d{2}/,
      );
      await expect(card).toContainText("30 minutes");

      // The end moves with the duration — it is derived, not typed.
      await page.getByLabel("Duration").selectOption("90");
      await expect(card).toContainText("90 minutes");

      // Clearing the date leaves the card in place saying what is missing,
      // rather than removing the thing the section is named for.
      await page.getByLabel("Date").fill("");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Design review");
      await expect(card).toContainText(/Pick a date/);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D3's second zone line, and the one case it exists for.
   *
   * A viewer in Berlin scheduling for New York: 22:00 in New York is 04:00 the
   * **next day** in Berlin, and a line reading "04:00 where you are" under
   * "Friday" describes a meeting on the wrong Friday. §3.9's trap, inside the
   * card built to catch it.
   *
   * And no UTC line: two zones is the maximum that can be relevant — the
   * meeting's and the viewer's — which is a deliberate departure from D3's
   * text, whose example was written from Accra, where UTC and "where you are"
   * happen to be the same line.
   */
  test("the second zone line carries the day when the day differs", async ({ browser }) => {
    const host = await createFixtureHost();
    const context = await browser.newContext({ timezoneId: "Europe/Berlin" });
    const page = await context.newPage();
    try {
      await signIn(page, host.email, "/schedule");
      await page.getByLabel("Title").fill("Late call");
      await page.getByLabel("Timezone").selectOption("America/New_York");
      const card = page.getByRole("status");

      // Same day in both: no date on the second line, and no UTC anywhere.
      await page.getByLabel("Start time").selectOption("10:00");
      await expect(card).toContainText(/\d{2}:\d{2} – \d{2}:\d{2} .* where you are/);
      await expect(card).not.toContainText("UTC");

      // Across midnight: the day appears, because the number alone is wrong.
      await page.getByLabel("Start time").selectOption("22:00");
      await expect(card).toContainText(
        /(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2} – \d{2}:\d{2} .* where you are/,
      );
    } finally {
      await context.close();
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * D3: "a 15-minute select on desktop, native `<input type="time">` on mobile
   * for the OS wheel."
   *
   * Chosen by `(pointer: coarse)`, so this is a device and not a viewport —
   * C5's lesson, which D1 restated and which a width-based test of a
   * pointer-based rule would not have caught.
   */
  test("start time is a select where the pointer is fine", async ({ page }) => {
    const host = await createFixtureHost();
    try {
      await signIn(page, host.email, "/schedule");
      const start = page.getByLabel("Start time");
      await expect(start).toBeVisible();
      expect(await start.evaluate((el) => el.tagName)).toBe("SELECT");
      // Quarter hours, and every one of them.
      expect(await start.locator("option").count()).toBe(96);
      await expect(page.getByText("15-minute steps. Type to jump.")).toBeVisible();
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  test("and the native control where it is coarse", async ({ browser }) => {
    const host = await createFixtureHost();
    const context = await browser.newContext({ ...devices["Pixel 5"] });
    const page = await context.newPage();
    try {
      await signIn(page, host.email, "/schedule");
      const start = page.getByLabel("Start time");
      await expect(start).toBeVisible();
      expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        "a phone should report a coarse pointer",
      ).toBe(true);
      expect(await start.evaluate((el) => el.tagName)).toBe("INPUT");
      expect(await start.getAttribute("type")).toBe("time");
    } finally {
      await context.close();
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * The zone list grew from seventeen to seventy-five and gained groups.
   *
   * Seventeen covered the places this was built from and nowhere else — no
   * Paris, no Toronto, no Shanghai, no Auckland. A zone missing from a
   * scheduling form is a meeting scheduled in the wrong one.
   */
  test("the timezone list is grouped and covers more than one continent", async ({ page }) => {
    const host = await createFixtureHost();
    try {
      await signIn(page, host.email, "/schedule");
      const zones = page.getByLabel("Timezone");
      const groups = await zones.locator("optgroup").evaluateAll((els) =>
        els.map((e) => (e as HTMLOptGroupElement).label),
      );
      expect(groups).toContain("Europe");
      expect(groups).toContain("Americas");
      expect(groups).toContain("Asia");
      expect(await zones.locator("option").count()).toBeGreaterThan(60);

      // Selectable, and labelled with the abbreviation for the date in the form
      // — not a hardcoded offset, which is right in one season and wrong in the
      // other.
      await zones.selectOption("Europe/Paris");
      await expect(zones).toHaveValue("Europe/Paris");
      await expect(
        zones.locator("option[value='Europe/Paris']"),
      ).toHaveText(/Europe\/Paris — (CET|CEST|GMT\+[12])/);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });
});
