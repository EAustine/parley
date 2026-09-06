import { devices, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { signIn } from "./auth";


export type Participant = { context: BrowserContext; page: Page; name: string };

/**
 * One guest, from the join screen to a connected room.
 *
 * Deliberately the whole flow rather than a shortcut into `/room/[code]`. The
 * display-name handoff between the two screens is a thing that has broken
 * before, and a test that skipped pre-join would not have caught it.
 */
/**
 * A distinct client address per participant.
 *
 * §7 rate-limits the token endpoint per IP, and `clientIp` falls back to the
 * literal `"unknown"` when no proxy headers are present — which behind
 * `next start` on localhost is every request. So every browser context in every
 * worker shared one 60/min bucket, and the suite was quietly spending a budget
 * meant for one network.
 *
 * It finally bit: `grid.spec`'s seventeen-participant sweep, running beside
 * three other workers, exhausted the bucket and the pre-join screen did exactly
 * what §7 asks — held, and retried with backoff — for ten minutes, until the
 * test timed out with the Join button correctly disabled.
 *
 * Giving each participant its own address is not weakening the guard; it is
 * making the harness resemble production, where seventeen people joining from
 * seventeen laptops are seventeen addresses. The limiter still runs, per IP,
 * unchanged. The one test that is *about* the 429 path intercepts the route
 * itself (`media.spec.ts`) and is unaffected by any of this.
 */
let clientSeq = 0;
function nextClientIp(): string {
  clientSeq += 1;
  // Worker-unique via the pid, participant-unique via the counter.
  const worker = process.pid % 251;
  return `10.${worker}.${Math.floor(clientSeq / 254)}.${(clientSeq % 254) + 1}`;
}

/**
 * Let every running animation finish before measuring geometry.
 *
 * `getBoundingClientRect` returns the **transformed** box, while container
 * query units resolve against the **untransformed layout box**. A tile caught
 * mid-FLIP therefore reports a rect that disagrees with its own `cqmin`: the
 * avatar test measured a 596px tile holding a 123px avatar, which is 28% of
 * 439 — the tile's real layout box while the inverse transform still showed
 * its old size. It passed alone and failed in a full run, which is the shape
 * `CLAUDE.md` says must be made deterministic rather than tolerated.
 *
 * The probe that established this caught a tile at `scale: 0.998998` reporting
 * rect 619.36 against layout 620 — the same disagreement, three orders of
 * magnitude smaller because the animation was nearly done.
 *
 * `.finished` is exact where a fixed sleep is a guess; the catch is for
 * animations cancelled by an element unmounting mid-wait.
 */
export async function settleAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

export async function joinAs(
  browser: Browser,
  name: string,
  options: {
    /**
     * The meeting to join. Required, and supplied by the `meetingCode` fixture
     * rather than a shared constant — a test that does not own its room cannot
     * assert what is in it, which is why the suite used to need `workers: 1`.
     */
    code: string;
    withMedia?: boolean;
    viewport?: { width: number; height: number };
    /**
     * Emulate an Android phone — touch, no hover, mobile user agent.
     *
     * v1.3 C5: the suite could not have caught the screen-share bug, because
     * it only ever set a *viewport*. A narrow window on a laptop still reports
     * `(hover: hover)`, so the rule that hid Present on touch devices was
     * green at 375px for the whole of v1.2. "Phone-sized" and "a phone" are
     * different machines, and only one of them is the one people use.
     */
    android?: boolean;
    /**
     * Sign in as this account before joining, so the participant is the
     * meeting's host rather than a guest.
     *
     * §7 derives identity and role from the session, so host-only surfaces —
     * the host badge, "Ask to mute", "Remove" — are unreachable without one.
     * Nothing in the suite had ever been the host of the meeting it was
     * looking at, which is why §3.8's asymmetry was covered only from the side
     * that cannot use it.
     */
    asHost?: string;
    /**
     * Emulate `prefers-reduced-motion`, which `MANUAL.md` recorded as needing a
     * human with System Settings open. Playwright emulates the query directly,
     * and the claim it gates — "travel is removed" — is observable rather than
     * felt: `useGridFlip` skips `el.animate()` entirely, so the reflow either
     * creates animations or it does not.
     */
    reducedMotion?: "reduce" | "no-preference";
  },
): Promise<Participant> {
  const context = await browser.newContext({
    // Spread first, so an explicit `viewport` below still wins.
    ...(options.android ? devices["Pixel 5"] : {}),
    permissions: ["camera", "microphone"],
    extraHTTPHeaders: { "x-real-ip": nextClientIp() },
    // Phase 10 checks the room at phone width. Set on the context rather than
    // resized afterwards, so the first paint is the one being measured — the
    // control bar's overflow was a first-paint problem.
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {}),
  });

  // Joining with camera and microphone off is a thing people do, and it is what
  // the device store already records. Seeding it is how a crowd is assembled
  // for the breakpoint sweep without sixteen video decoders per tab — the grid
  // is what that test is about, and the video path has its own.
  if (options.withMedia === false) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem(
          "parley:devices",
          JSON.stringify({ cameraOn: false, micOn: false }),
        );
      } catch {
        // Storage refused; the participant joins with media on. Heavier, but
        // not wrong.
      }
    });
  }

  const page = await context.newPage();

  if (options.asHost) {
    await signIn(page, options.asHost, `/j/${options.code}`);
  } else {
    await page.goto(`/j/${options.code}`);
  }
  /**
   * Grant, explicitly, the way a person does — v1.4 A1.
   *
   * This step did not exist, and the suite did not need it: the room used to
   * read `stored.cameraOn !== false` from `localStorage`, and `undefined` is
   * not `false`, so every participant published whether or not anybody had
   * granted anything. Chrome's `--use-fake-ui-for-media-stream` then
   * auto-accepted the prompt the room fired, and it all looked fine.
   *
   * **So the entire room suite was resting on the A1 defect for its media.**
   * With consent now binding, a participant who never presses this joins with
   * both off — correctly — and `media.spec`'s two-way video, the speaking ring
   * and the share tests would all fail for the right reason. §3.3 forbids
   * firing the prompt on load, so this press is the only thing that grants.
   *
   * `withMedia: false` skips it deliberately: that path wants a participant
   * with nothing published, which is now reached by not granting rather than
   * by a stored preference the room no longer consults.
   */
  if (options.withMedia !== false) {
    const allow = page.getByRole("button", { name: "Allow camera and microphone" });
    if (await allow.count()) {
      await allow.click();
      // Wait for the grant to land, so the join carries it. `useMediaPreview`
      // sets `granted` after an `enumerateDevices` round trip, and a Join
      // pressed before that would hand over a decision made too early.
      await expect(
        page.getByRole("button", { name: /Turn (off|on) microphone/ }),
      ).toBeVisible({ timeout: 20_000 });
    }
  }

  // A signed-in host is not asked to name themselves — §3.3.
  const nameField = page.getByLabel("Your name");
  if (await nameField.count()) await nameField.fill(name);
  await page.getByRole("button", { name: /^Join/ }).click();

  await page.waitForURL(`**/room/${options.code}`);
  // Generous: this is a real signalling round trip to a cloud SFU, and the
  // first one of a run is the slowest.
  await expect(
    page.getByRole("heading", { name: /Meeting, \d+ participant/ }),
  ).toBeAttached({ timeout: 60_000 });

  return { context, page, name };
}

/**
 * Wake the control bar before touching it.
 *
 * §3.4 hides the controls after 4s of pointer inactivity, and hidden controls
 * are deliberately inert — an invisible button that still acts is worse than
 * one that needs a nudge, most of all for Leave, where a stray click in dead
 * space would drop someone out of a meeting.
 *
 * A person with a mouse never notices this, because moving to a button *is* the
 * pointer movement that brings the bar back. Playwright clicks without moving,
 * so it has to do deliberately what a hand does incidentally. This is the test
 * matching the product, not the product bending for the test.
 */
export async function wakeControls(page: Page) {
  await page.mouse.move(400, 300);
  await page.evaluate(() =>
    window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true })),
  );
  await expect(page.getByRole("button", { name: "Leave" })).toBeEnabled();
}

export async function leave(participant: Participant) {
  await wakeControls(participant.page);
  await participant.page.getByRole("button", { name: "Leave" }).click();
  await expect(
    participant.page.getByRole("heading", { name: "You left the meeting" }),
  ).toBeVisible();
}

/**
 * Wait until the room agrees on how many people are in it.
 *
 * Several assertions depend on the participant count — the letterbox at one,
 * the side-by-side at two — and the SFU takes a moment to tell everyone about
 * a join, while a context closed by a previous test takes a moment to be
 * reaped. Tests that assumed the count instead of waiting for it passed alone
 * and failed in a full run, which is the worst way for this to be wrong.
 */
export async function expectParticipants(page: Page, count: number) {
  await expect(
    page.getByRole("heading", {
      name: `Meeting, ${count} participant${count === 1 ? "" : "s"}`,
    }),
  ).toBeAttached({ timeout: 30_000 });
}

/** The grid's actual computed shape — read from CSS, not from our own layout code. */
export async function gridShape(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>("main .grid, .grid");
    if (!grid) throw new Error("no grid");
    const style = getComputedStyle(grid);
    return {
      columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      rows: style.gridTemplateRows.split(" ").filter(Boolean).length,
      cells: grid.children.length,
      aspectRatio: style.aspectRatio,
    };
  });
}

/**
 * Is this tile showing moving video, or a black rectangle?
 *
 * Two frames, ~250ms apart, sampled through a canvas. Variance within one frame
 * catches a black or flat-grey rectangle; difference between frames catches a
 * single stuck frame, which is what a subscribed-but-not-flowing track looks
 * like and is the more interesting failure.
 */
export async function videoLiveness(page: Page, index = 0) {
  return page.evaluate(async (i) => {
    const video = document.querySelectorAll<HTMLVideoElement>("video")[i];
    if (!video) return { present: false, spread: 0, motion: 0, width: 0 };

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 36;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;

    const sample = () => {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };

    const first = Uint8ClampedArray.from(sample());
    await new Promise((r) => setTimeout(r, 250));
    const second = sample();

    let min = 255, max = 0, diff = 0;
    for (let p = 0; p < first.length; p += 4) {
      const luma = 0.299 * first[p] + 0.587 * first[p + 1] + 0.114 * first[p + 2];
      if (luma < min) min = luma;
      if (luma > max) max = luma;
      diff += Math.abs(first[p] - second[p]);
    }
    return {
      present: true,
      spread: max - min,                       // flat rectangle → 0
      motion: diff / (first.length / 4),       // frozen frame → 0
      width: video.videoWidth,
    };
  }, index);
}

/** The border a tile is actually painting — §3.4's speaking encoding. */
export async function tileBorders(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".grid > div")].map((tile) => {
      const style = getComputedStyle(tile);
      return {
        label: tile.getAttribute("aria-label") ?? "",
        width: style.outlineWidth,
        colour: style.outlineColor,
      };
    }),
  );
}
