// Relative, not aliased: this module and `classify.ts` are compiled together
// and run outside Next by `npm run check:permissions`, which has no bundler to
// resolve `@/`. Being testable in isolation is the point of both files.
import { errorName } from "./classify";

/**
 * Getting a stream, when the hardware may not be what was remembered.
 *
 * Extracted from the preview hook for the same reason `classify.ts` was: the
 * conditions cannot be produced from a script — you cannot unplug a webcam or
 * switch one off in Screen Time from a test — but the *ladder* that decides
 * what to ask for next can be driven with a fake `getUserMedia` and checked
 * exactly. Both failures this handles were invisible until the ladder was
 * written down.
 *
 * One request, up to three attempts:
 *
 * 1. Exactly what was remembered.
 * 2. If a remembered device is gone, without the constraint. A stored
 *    `deviceId` is a *hard* constraint, and hardware leaves — a headset is
 *    unplugged, a camera is switched off, today's desk isn't yesterday's dock.
 *    Asking for a dead id forever means the preview never recovers and the
 *    "Try again" button can never succeed, because each attempt asks for the
 *    same missing device. The stored ids are dropped so the next visit starts
 *    clean.
 * 3. Each device on its own. A camera and a microphone asked for together
 *    succeed or fail together, so a laptop whose camera is switched off in
 *    Screen Time throws `NotFoundError` and takes the working microphone down
 *    with it — no preview, no level meter, no device list, and copy offering
 *    to join with audio only above a screen that found no audio either.
 *
 * Permission failures are not retried. `NotAllowedError` means the answer was
 * no, and asking twice more only spends the browser's patience — Chrome
 * embargoes a permission after repeated prompting.
 */

export type GetUserMedia = (
  constraints: MediaStreamConstraints,
) => Promise<MediaStream>;

export type Acquisition = {
  stream: MediaStream | null;
  /** The last failure, when nothing could be acquired. */
  error: unknown;
  /** Whether the remembered device ids were dropped as unusable. */
  forgotDevices: boolean;
  /** Every constraint set tried, in order. The ladder, for inspection. */
  attempts: MediaStreamConstraints[];
};

/** A failure worth retrying with looser constraints rather than reporting. */
export function isDeviceMiss(error: unknown): boolean {
  const name = errorName(error);
  return name === "NotFoundError" || name === "OverconstrainedError";
}

export async function acquireStream(
  gum: GetUserMedia,
  wanted: { cameraId?: string | null; microphoneId?: string | null } = {},
): Promise<Acquisition> {
  const attempts: MediaStreamConstraints[] = [];
  let forgotDevices = false;

  const tryGet = async (constraints: MediaStreamConstraints) => {
    attempts.push(constraints);
    try {
      return { stream: await gum(constraints), error: null as unknown };
    } catch (error) {
      return { stream: null, error };
    }
  };

  let video: MediaStreamConstraints["video"] = wanted.cameraId
    ? { deviceId: { exact: wanted.cameraId } }
    : true;
  let audio: MediaStreamConstraints["audio"] = wanted.microphoneId
    ? { deviceId: { exact: wanted.microphoneId } }
    : true;

  let { stream, error } = await tryGet({ video, audio });

  // 2. A remembered device that is no longer here.
  if (!stream && isDeviceMiss(error) && (wanted.cameraId || wanted.microphoneId)) {
    video = true;
    audio = true;
    const retry = await tryGet({ video, audio });
    // Whether the remembered ids were actually the problem is only knowable
    // now. Chrome evaluates an exact `deviceId` *before* it checks permission
    // — measured, not assumed — so someone who clicked Block and has a device
    // remembered also arrives here with `OverconstrainedError`. Forgetting on
    // the way past would throw away a perfectly good choice as a side effect
    // of a permission answer, and they would find it gone after allowing.
    forgotDevices = Boolean(retry.stream) || isDeviceMiss(retry.error);
    stream = retry.stream;
    error = retry.error;
  }

  // 3. One missing device must not cost the other.
  if (!stream && isDeviceMiss(error)) {
    const audioOnly = await tryGet({ video: false, audio });
    if (audioOnly.stream) {
      stream = audioOnly.stream;
      error = null;
    } else {
      const videoOnly = await tryGet({ video, audio: false });
      if (videoOnly.stream) {
        stream = videoOnly.stream;
        error = null;
      }
      // Report the failure of the pair, not of the last lonely attempt: if
      // both are missing, "no camera found" is the honest answer and the
      // audio-only refusal is an implementation detail.
    }
  }

  return { stream, error, forgotDevices, attempts };
}
