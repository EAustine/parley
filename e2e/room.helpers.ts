import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

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
  },
): Promise<Participant> {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
    extraHTTPHeaders: { "x-real-ip": nextClientIp() },
    // Phase 10 checks the room at phone width. Set on the context rather than
    // resized afterwards, so the first paint is the one being measured — the
    // control bar's overflow was a first-paint problem.
    ...(options.viewport ? { viewport: options.viewport } : {}),
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
  // A signed-in host is not asked to name themselves — §3.3.
  const nameField = page.getByLabel("Your name");
  if (await nameField.count()) await nameField.fill(name);
  await page.getByRole("button", { name: "Join meeting" }).click();

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
