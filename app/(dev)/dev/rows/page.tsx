import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { RowGallery } from "./RowGallery";

export const metadata: Metadata = {
  title: "Participant rows",
  robots: { index: false, follow: false },
};

/**
 * The participant row, held still — the states a live room will not produce.
 *
 * `ParticipantsPanel` used to fetch its own connection quality, and quality is
 * the server's verdict: `check:connection` records that
 * `ConnectionQuality.Poor` "is not reachable by any local test… killing the
 * network produces no updates rather than a bad one." The chip therefore never
 * rendered under test, and its geometry — the thing that once pushed the row to
 * three lines and into the device icons — went unpinned.
 *
 * Now that the row receives `quality` as a prop, the degraded cases are just
 * props. This page renders them so `participant-row.spec.ts` can measure the
 * one-line claim with the chip actually present.
 *
 * **Gated on an explicit flag rather than `NODE_ENV`, and the difference is not
 * cosmetic.** `/dev/tokens` uses `NODE_ENV !== "production"`, and the suite runs
 * against `next build && next start` — so that gate would 404 this page for the
 * one caller that needs it, which is exactly what the first run reported. An
 * opt-in flag is set by `playwright.config.ts` and by nothing else: Vercel never
 * sets it, so production *and* preview both 404, which `NODE_ENV` alone would
 * not have given us on preview either.
 *
 * It is a consumer of the component like any other. The component itself carries
 * no test branch and no seam — that is the point of having moved the boundary
 * rather than punched a hole in it.
 */
export default function DevRowsPage() {
  if (process.env.PARLEY_DEV_SURFACES !== "1") notFound();
  return <RowGallery />;
}
