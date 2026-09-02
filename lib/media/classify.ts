/**
 * Which of §3.3's six states a `getUserMedia` failure actually is.
 *
 * Extracted from the preview hook so it can be tested without a camera. The
 * states are not producible on demand in a test environment — you cannot
 * unplug a webcam from a script — but the mapping that chooses between them
 * can be checked exactly, and the mapping is where the mistakes live.
 *
 * `getUserMedia` reports several distinct situations through one error name,
 * which is the whole problem this solves.
 */

export type PermissionState =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "dismissed"
  | "no-device"
  | "in-use"
  | "insecure"
  | "unsupported";

/** What the Permissions API said, or null when it could not be asked. */
export type PermissionHint = "granted" | "denied" | "prompt" | null;

export function errorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error
    ? String((error as { name: unknown }).name)
    : "";
}

/**
 * `hint` separates the two readings of `NotAllowedError` that need different
 * copy: a refusal the browser will remember, and a prompt someone closed.
 *
 * Telling a person to go and change a browser setting when they merely clicked
 * away is the worse of the two mistakes — it sends them somewhere confusing to
 * fix something that is not broken. So an unknown hint resolves to "dismissed",
 * which offers a retry that will actually work.
 */
export function classifyMediaError(
  error: unknown,
  hint: PermissionHint = null,
): PermissionState {
  switch (errorName(error)) {
    case "NotFoundError":
    case "OverconstrainedError":
      return "no-device";

    case "NotReadableError":
    case "AbortError":
      return "in-use";

    case "SecurityError":
      return "insecure";

    case "NotAllowedError":
    case "PermissionDeniedError":
      return hint === "denied" ? "denied" : "dismissed";

    default:
      return "denied";
  }
}
