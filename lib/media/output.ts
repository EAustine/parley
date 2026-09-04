/**
 * Whether this browser lets a page choose which speaker it plays through.
 *
 * v1.3 B2: "Speaker selection needs `HTMLMediaElement.setSinkId`, unsupported in
 * Safari. Feature-detect and hide rather than showing a control that does
 * nothing."
 *
 * It is the same rule §3.7 now takes for screen share, and the same reasoning:
 * a control that cannot work on this device is not a control, and one that
 * silently does nothing is worse than one that is absent — the person concludes
 * the audio routing is broken rather than that the browser has no such feature.
 *
 * **Detected, not inferred from a user agent.** `setSinkId` has moved: Safari
 * has never had it, Firefox shipped it behind a flag and then on by default in
 * 116. A version table would be wrong within a release; the prototype is not.
 *
 * `RoomStage` already calls `switchActiveDevice("audiooutput", …)` and catches
 * the rejection, so the *room* has always degraded correctly. What it could not
 * do is stop pre-join offering the choice in the first place.
 */
export function canChooseSpeaker(): boolean {
  if (typeof HTMLMediaElement === "undefined") return false;
  return "setSinkId" in HTMLMediaElement.prototype;
}
