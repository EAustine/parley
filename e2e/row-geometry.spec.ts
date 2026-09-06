import { expect, test } from "@playwright/test";

/**
 * The connection chip's geometry — the half of v1.4 B1 that was never pinned.
 *
 * `participant-row.spec.ts` measures the one-line claim for the identity and
 * actions zones and says plainly what it cannot reach:
 *
 * > "The connection chip is the other thing that used to wrap the row, and it
 * > renders only when quality is not good — which it never is in a local test
 * > against a healthy SFU."
 *
 * That was true while the row fetched its own quality. Quality is the server's
 * verdict over the signalling socket, and `check:connection` records the
 * consequence: `Poor` "is not reachable by any local test… killing the network
 * produces no updates rather than a bad one." Throttling does not help — it
 * produces silence, not a bad reading.
 *
 * Lifting `quality` to a prop moved the boundary, and the unreachable half
 * shrank to one link: whether a genuinely poor connection reports `poor`. That
 * link is a mapping, and `check:connection` pins every value of it. **The
 * geometry is not a mapping, and it does not need a degraded network to be
 * true or false** — it needs the chip on screen next to a long name, which is
 * now just props.
 *
 * Measured at 375px and at desktop, because the collision B1 fixed was reported
 * at phone width.
 */
const CASES = ["poor, actions", "lost, actions", "poor, seen by a guest"] as const;

const WIDTHS = [
  { name: "a phone", width: 375, height: 812 },
  { name: "a desktop panel", width: 1280, height: 800 },
];

for (const viewport of WIDTHS) {
  test(`the row stays one line with a chip and a long name on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/dev/rows");

    for (const label of CASES) {
      const list = page.locator(`[data-case="${label}"]`);
      const row = list.locator("li").first();
      await expect(row, `${label}: no row rendered`).toBeVisible();

      // The chip is actually there — otherwise this measures the old case.
      const chip = row.getByText(/Unstable connection|Reconnecting…/);
      await expect(chip, `${label}: no chip, so nothing new is being measured`).toBeVisible();

      /*
       * **64px, and the number is the assertion.**
       *
       * This started at `< 72`, carried over from `participant-row.spec.ts`,
       * and it could not fail. Measured here: a one-line row is 52–60px and a
       * row with the chip wrapped below the name — the exact v1.4 B1 bug — is
       * **70px**. The inherited threshold missed the defect it was named for by
       * two pixels, because that spec's rows carry a 44px actions control and
       * these do not. A number copied from a neighbouring test is a number
       * measured against a different box.
       */
      const box = await row.boundingBox();
      expect(
        Math.round(box!.height),
        `${label} at ${viewport.width}px: the row wrapped to more than one line — ` +
          "the chip is back in the flow that pushed it into the device icons",
      ).toBeLessThan(64);

      /*
       * The chip does not run into the device icons.
       *
       * **A backstop, not coverage**, and labelled so deliberately: the chip and
       * the icons are siblings in one flex row, which cannot overlap its own
       * children, so no mutation inside this structure makes it fail. It is kept
       * because it is free and would catch the chip being positioned out of
       * flow — not because a green run here proves anything.
       */
      const chipBox = await chip.boundingBox();
      const micBox = await row.getByLabel(/microphone is/).boundingBox();
      expect(
        Math.round(chipBox!.x + chipBox!.width),
        `${label} at ${viewport.width}px: the chip overlaps the microphone icon`,
      ).toBeLessThanOrEqual(Math.round(micBox!.x));
    }
  });
}

/**
 * **Identity under the chip — currently failing, and left failing on purpose.**
 *
 * The one-line claim above holds. This is B1's *other* promise, from its own
 * comment in `ParticipantsPanel`:
 *
 * > "Identity is still the flexible zone; what changed is how much the other
 * > two cost. Status is two icons and **a short chip**."
 *
 * Measured with the chip present and the panel at its shipped width, the chip
 * is 132px and the identity zone is what pays for it:
 *
 * | Surface | Identity | Chip |
 * |---|---|---|
 * | desktop rail (360px) | **32px** | 132px |
 * | phone (375px) | **47px** | 132px |
 *
 * At 15px body type that is two to four characters and an ellipsis. The row
 * holds one line, so `participant-row.spec.ts` stays green — but B1's actual
 * report was never about height. It was that "the row you were about to remove
 * someone from stopped saying who they were", and with the chip up, it does
 * that again.
 *
 * `test.fixme` rather than a lowered threshold, following the precedent set for
 * the guest block: **the reason is written where a run will show it**, and the
 * fix is a design decision — shorten the copy, drop the label below some width,
 * or let the chip truncate before identity does — which `CLAUDE.md` rule 10
 * says is discussed before it is coded, not chosen here by whoever writes the
 * assertion.
 *
 * The 96px floor is the number to argue about. It is roughly twelve characters,
 * enough to tell two people in a meeting apart, and it is deliberately not
 * derived from the current value — a threshold fitted to what the code does
 * today asserts nothing.
 */
test.fixme("the name stays readable when the chip is up", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dev/rows");
  const row = page.locator('[data-case="poor, actions"]').locator("li").first();
  await expect(row).toBeVisible();

  const nameBox = await row.getByText(/Nana Yaa/).boundingBox();
  expect(
    Math.round(nameBox?.width ?? 0),
    "the chip has squeezed identity below what anyone could read",
  ).toBeGreaterThanOrEqual(96);
});
