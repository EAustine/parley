/**
 * What pre-join chose, remembered for the room and the next meeting.
 *
 * `localStorage`, deliberately unlike the display-name handoff in
 * `lib/prejoin-handoff.ts`: which camera you use is a standing preference, not
 * a fact about one visit. The name is the opposite case and lives in
 * `sessionStorage` for exactly that reason.
 *
 * Shared rather than duplicated because both ends have to agree on the key. A
 * second copy of `"parley:devices"` is the kind of thing that drifts silently:
 * the preview would honour a choice the room ignored, and nothing would look
 * broken from either side.
 */

const STORAGE_KEY = "parley:devices";

export type StoredDevices = {
  cameraId?: string;
  microphoneId?: string;
  speakerId?: string;
  cameraOn?: boolean;
  micOn?: boolean;
};

export function readDevices(): StoredDevices {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Private mode, storage disabled, or something else wrote nonsense here.
    return {};
  }
}

export function writeDevices(patch: StoredDevices) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...readDevices(), ...patch }),
    );
  } catch {
    // The preview still works; the choice simply will not be remembered.
  }
}

/**
 * Drop remembered device ids, keeping the on/off preferences.
 *
 * A stored `deviceId` is a *hard* constraint, and hardware goes away: a headset
 * is unplugged, a camera is switched off in Screen Time, the meeting is joined
 * from a docking station that isn't there today. Without this, one remembered
 * choice locks someone out of their own preview permanently — every attempt
 * fails the same way, and "Try again" can never succeed because the dead id is
 * asked for again each time.
 */
export function forgetStoredDevices() {
  const { cameraOn, micOn, speakerId } = readDevices();
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cameraOn, micOn, speakerId }),
    );
  } catch {
    // Not being able to forget is survivable.
  }
}
