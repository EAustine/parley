import "server-only";

import { cookies } from "next/headers";

import type { Subject } from "@/lib/meetings/waiting";

/**
 * Who a guest is, for the ten-minute block — BUILD-PLAN v1.5 B1.
 *
 * ## Why not a signature
 *
 * B1 words this as a "signed `httpOnly` device token", and a signature is not
 * what the guarantee needs. The property required is *unforgeable*: somebody
 * who was blocked must not be able to present a different identity by editing a
 * cookie. A 128-bit random value delivers that on its own — you cannot guess
 * what you cannot guess — and a signature would add a key to manage, an
 * environment variable to set in two places, and a verify path to get right,
 * for a guarantee already held.
 *
 * The cookie is therefore an opaque id and means nothing by itself. It is only
 * ever a lookup key against `meeting_blocks`, so possessing it grants nothing
 * and forging one lands on no row.
 *
 * ## What this honestly holds against, stated as a limit
 *
 * §8 gets a sentence about this and B1 asks for it plainly: **a private window
 * defeats it.** So does clearing cookies, and so does a second device. What it
 * holds against is reloads, new tabs, and a different browser profile on the
 * same machine.
 *
 * That is worth having and it is not a wall. It raises the cost of coming back
 * from nothing to knowing to open a private window, which stops the ordinary
 * case — somebody who was removed pressing the link again. B1's own guardrail:
 * "do not overstate the block… the moment the documents describe it as a wall
 * someone will build on the claim."
 *
 * ## Scoped to nothing, on purpose
 *
 * One id per browser rather than one per meeting. A per-meeting cookie would
 * mean a fresh identity for every link, so a blocked person could return by
 * being invited to the same meeting twice — and it would put a cookie per
 * meeting in the jar. The *block* is scoped to the meeting, which is where the
 * scoping belongs.
 */
const COOKIE = "parley_device";

/** A year. The block lasts ten minutes; the identity outliving it is the point. */
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function mint(): string {
  // 16 bytes, hex. `crypto` is the platform's, available in the Node and edge
  // runtimes alike, so this needs no dependency.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A well-formed id, so a hand-edited cookie cannot become a lookup key. */
function looksMinted(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

/**
 * Read the device id, issuing one if this browser has none.
 *
 * Returns the id and whether it was just created, because a route handler has
 * to set the cookie on its *own* response — `cookies()` is readable anywhere
 * and only writable from a route handler or a server action, and a silent
 * failure to persist would mean a new identity on every request and a block
 * that never bites.
 */
export async function readDeviceId(): Promise<{ id: string; minted: boolean }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (looksMinted(existing)) return { id: existing, minted: false };
  return { id: mint(), minted: true };
}

/** The attributes a fresh id is written with. Named so the two callers agree. */
export function deviceCookie(id: string) {
  return {
    name: COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/**
 * How the door refers to whoever is asking.
 *
 * A signed-in person is their account, which is the stronger identity and the
 * one that survives a private window. Everyone else is their device.
 */
export function subjectFor(
  userId: string | null | undefined,
  deviceId: string,
): Subject {
  return userId
    ? { subject: `user_${userId}`, subjectType: "user" }
    : { subject: deviceId, subjectType: "device" };
}
