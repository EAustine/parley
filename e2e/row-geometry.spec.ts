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
      const chip = row.getByText(/^(Unstable|Reconnecting)$/);
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
 * **Identity survives the chip** — the defect this file was written to find.
 *
 * B1's own comment claims "identity is still the flexible zone… status is two
 * icons and **a short chip**". The chip was 132px, four times the identity zone
 * it displaced, and on the 360px desktop rail the name rendered at **32px** —
 * two characters and an ellipsis. The row held one line by erasing the name,
 * which is exactly what B1 was reported for.
 *
 * Fixed by shortening the row's copy rather than the layout: `ROW_COPY` drops
 * the word "connection", which the row's own context already supplies. Measured
 * after: **98px** for poor, **70px** for reconnecting.
 *
 * **The floor is 64px and it is a judgement, stated as one.** It is the point
 * below which fewer than about eight characters survive, which is roughly where
 * two people in a meeting stop being distinguishable. It is deliberately not
 * fitted to what the code now does — a threshold derived from the current value
 * asserts nothing, which is the mistake the one-line bound in this same file
 * made when it was inherited at 72px against a 70px bug.
 *
 * Both widths are asserted, because the two states have different lengths and
 * "Reconnecting" is the tighter of them by 28px. Testing only the roomier one
 * would leave the real worst case uncovered.
 */
for (const label of ["poor, actions", "lost, actions"] as const) {
  test(`the name stays readable beside the ${label.split(",")[0]} chip`, async ({
    page,
  }) => {
    // The 360px rail, which is narrower than a 375px phone and so the worst case.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dev/rows");
    const row = page.locator(`[data-case="${label}"]`).locator("li").first();
    await expect(row).toBeVisible();

    // The chip is up — otherwise this measures the undegraded row.
    await expect(row.getByText(/^(Unstable|Reconnecting)$/)).toBeVisible();

    const nameBox = await row.getByText(/Nana Yaa/).boundingBox();
    expect(
      Math.round(nameBox?.width ?? 0),
      `${label}: the chip has squeezed identity to ${Math.round(nameBox?.width ?? 0)}px — ` +
        "the row is holding one line by erasing the name",
    ).toBeGreaterThanOrEqual(64);
  });
}
