import type { Metadata } from "next";

import { RoomEntry } from "@/components/room/RoomEntry";
import { normaliseMeetingCode } from "@/lib/meetings/code";

type Params = { params: Promise<{ code: string }> };

export const metadata: Metadata = {
  title: "Meeting",
  robots: { index: false, follow: false },
};

/**
 * The room, as far as Phase 3 takes it.
 *
 * Deliberately does not import `livekit-client`. Rule 8 keeps it off every
 * bundle but the room's, and Phase 4 adds it behind a dynamic import — pulling
 * it in now would put ~200 kB into this phase's numbers before anything uses
 * it, and make the Phase 4 measurement meaningless.
 *
 * What this does do is ask `/api/livekit/token` for a token from a real
 * browser, with whatever session the viewer has. That exercises the most
 * security-sensitive surface in the product — server-side meeting validation,
 * server-derived identity, narrow grants, rate limiting — and every failure the
 * contract can return gets a designed state rather than a crash.
 */
export default async function RoomPage({ params }: Params) {
  const { code } = await params;
  return <RoomEntry code={normaliseMeetingCode(code) ?? code} />;
}
