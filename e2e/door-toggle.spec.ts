import { expect, test } from "./fixtures";

import { signIn } from "./auth";
import { createFixtureHost, createMeeting, deleteFixtureHost } from "./meeting-admin";
import { joinAs, leave, wakeControls, type Participant } from "./room.helpers";

/**
 * The waiting-room switch, in its three homes — v1.5 A1, §3.2.
 *
 * The door and the queue shipped before any way to open or close it did. The
 * create route picked a default and the token endpoint enforced it, so §3.2's
 * "reversible in both directions" was reversible in neither: a scheduled
 * meeting was gated forever and an instant one never could be, short of SQL.
 *
 * These cover the mechanism and the one case with a security consequence. The
 * form field itself is ordinary React state and is left to the schedule form's
 * own coverage.
 */
test.describe("the waiting-room switch", () => {
  /**
   * **An instant meeting can be gated, which `PATCH` used to refuse outright.**
   *
   * The guard was `if (!existing.scheduled_start) return fail("not_scheduled")`,
   * correct for the edit form — title and times are scheduling fields — and
   * wrong for the one field every meeting has. Instant meetings are exactly the
   * case that needs it: they are created with the door *open*.
   */
  test("an instant meeting's door can be closed and opened again", async ({
    page,
  }) => {
    const host = await createFixtureHost();
    // No `scheduledStart` — an instant meeting, the shape PATCH used to refuse.
    const code = await createMeeting({ host: host.id, waitingRoom: false });
    try {
      await signIn(page, host.email, "/dashboard");

      const close = await page.request.patch(`/api/meetings/${code}`, {
        data: { waitingRoom: true },
      });
      expect(
        close.status(),
        "PATCH still refuses an instant meeting, so the door cannot be closed on the meetings that start open",
      ).toBe(200);
      expect((await close.json()).waiting_room).toBe(true);

      const open = await page.request.patch(`/api/meetings/${code}`, {
        data: { waitingRoom: false },
      });
      expect(open.status()).toBe(200);
      expect(
        (await open.json()).waiting_room,
        "§3.2 promises reversible in both directions",
      ).toBe(false);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * **Toggling the door does not bump the calendar sequence.**
   *
   * §3.9 increments `SEQUENCE` when a scheduled meeting is edited, so clients
   * re-read the event. Nothing about the waiting room appears in the `.ics`, so
   * bumping it here would announce a revision of an event that did not change
   * and re-notify every attendee about a setting they cannot see.
   */
  test("the door is not a calendar revision", async ({ page }) => {
    const host = await createFixtureHost();
    const start = new Date(Date.now() + 86_400_000);
    const code = await createMeeting({
      host: host.id,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 1_800_000),
    });
    try {
      await signIn(page, host.email, "/dashboard");

      const first = await page.request.patch(`/api/meetings/${code}`, {
        data: { waitingRoom: true },
      });
      const before = (await first.json()).sequence;

      const second = await page.request.patch(`/api/meetings/${code}`, {
        data: { waitingRoom: false },
      });
      expect(
        (await second.json()).sequence,
        "toggling the door revised the calendar event",
      ).toBe(before);

      // The control: a real edit still counts as a revision.
      const edited = await page.request.patch(`/api/meetings/${code}`, {
        data: { title: "Renamed" },
      });
      expect(
        (await edited.json()).sequence,
        "a genuine edit stopped incrementing, so the assertion above proves nothing",
      ).toBeGreaterThan(before);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * **The switch is on pre-join for the host and absent for everyone else.**
   *
   * This is the one with a consequence. `/j/[code]` is public, and the control
   * writes a security setting — a guest who could see it could try to send the
   * `PATCH`. The page decides host-ness with RLS rather than by widening
   * `get_meeting_by_code`, which §6 keeps narrow precisely so an anonymous
   * caller learns nothing about who owns a meeting.
   */
  test("pre-join shows the door to the host and not to a guest", async ({
    page,
    browser,
  }) => {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: false });
    try {
      await signIn(page, host.email, `/j/${code}`);
      await expect(
        page.getByLabel("Waiting room", { exact: true }),
        "the host cannot reach their own door from the screen before the room",
      ).toBeVisible({ timeout: 20_000 });

      // A guest, in a context that has never signed in.
      const guestContext = await browser.newContext();
      const guest = await guestContext.newPage();
      try {
        await guest.goto(`/j/${code}`);
        await expect(guest.getByRole("button", { name: /^Join/ })).toBeVisible({
          timeout: 20_000,
        });
        await expect(
          guest.getByLabel("Waiting room", { exact: true }),
          "a guest is being shown the host's door control",
        ).toHaveCount(0);
      } finally {
        await guestContext.close();
      }
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * And the server refuses it even when the control is not on screen — the
   * assertion the one above cannot make, because hiding a control is not a
   * permission check.
   */
  test("a guest cannot set the door by asking directly", async ({
    request,
  }) => {
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: false });
    try {
      const response = await request.patch(`/api/meetings/${code}`, {
        data: { waitingRoom: true },
      });
      expect(
        response.status(),
        "an unauthenticated caller changed a meeting's door",
      ).not.toBe(200);
    } finally {
      await deleteFixtureHost(host.id);
    }
  });

  /**
   * **In the room, the door is in the overflow menu.**
   *
   * It was first put above the queue in People. The better argument moved it:
   * the panel's other host sections are decisions — someone is waiting, someone
   * is blocked — and a setting among them reads as one more thing to answer.
   *
   * The item **names the action and changes with it**, per `CLAUDE.md`'s rule
   * for state toggles, which is also why it is a plain `menuitem` and carries no
   * `aria-pressed`.
   */
  test("the room's door lives in the overflow menu, for the host only", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const open: Participant[] = [];
    const host = await createFixtureHost();
    const code = await createMeeting({ host: host.id, waitingRoom: false });
    try {
      const asHost = await joinAs(browser, "Abena Poku", {
        code,
        withMedia: false,
        asHost: host.email,
      });
      open.push(asHost);

      await wakeControls(asHost.page);
      await asHost.page.getByRole("button", { name: "More options" }).click();
      // Created with the door open, so the action offered is to close it.
      await expect(
        asHost.page.getByRole("menuitem", { name: /Turn on waiting room/ }),
        "the host cannot reach the door from the room",
      ).toBeVisible({ timeout: 20_000 });

      // It is not in People any more — where it started, and where it does not belong.
      await asHost.page.keyboard.press("Escape");
      await asHost.page.getByRole("button", { name: /^Participants/ }).click();
      await expect(
        asHost.page.getByLabel("Waiting room", { exact: true }),
        "the door is still in the People panel as well as the menu",
      ).toHaveCount(0);

      // And a guest in the same room is offered nothing.
      const guest = await joinAs(browser, "Kwabena Osei", {
        code,
        withMedia: false,
      });
      open.push(guest);
      await wakeControls(guest.page);
      await guest.page.getByRole("button", { name: "More options" }).click();
      await expect(
        guest.page.getByRole("menuitem", { name: /waiting room/i }),
        "a guest is being offered the host's door",
      ).toHaveCount(0);
    } finally {
      while (open.length) {
        const p = open.pop()!;
        await leave(p).catch(() => {});
        await p.context.close().catch(() => {});
      }
      await deleteFixtureHost(host.id);
    }
  });
});
