"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";

import { canChooseSpeaker } from "@/lib/media/output";
import { writeDevices } from "@/lib/media/devices";

/**
 * Choosing a camera, microphone or speaker **during** a meeting — v1.3 B2.
 *
 * §3.3 specified device selectors on pre-join and nothing after, so the only
 * moment you could change a device was before you were in the position to
 * discover it was the wrong one. B2: "Field issues 2 and 5 are one feature."
 *
 * The switching itself is `room.switchActiveDevice`, which republishes the
 * track and tells every subscriber — rather than `getUserMedia` plus a manual
 * unpublish/publish, which is the same thing done worse and drops a frame
 * everyone else can see.
 *
 * Reads follow rule 3's habit: the *active* device comes back from
 * `room.getActiveDevice`, not from a React value set when the select changed.
 * A switch that fails leaves the select showing the device still in use, which
 * is the true answer.
 */

export type DeviceOption = { deviceId: string; label: string };

export type NewDevice = {
  /** What to offer switching to, per kind, keyed by `MediaDeviceKind`. */
  byKind: Partial<Record<MediaDeviceKind, string>>;
  label: string;
};

const KINDS = ["videoinput", "audioinput", "audiooutput"] as const;

/** `writeDevices` keys, by device kind. */
const STORAGE_KEY = {
  videoinput: "cameraId",
  audioinput: "microphoneId",
  audiooutput: "speakerId",
} as const;

export function useDevices() {
  const room = useRoomContext();

  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<DeviceOption[]>([]);
  const [speakers, setSpeakers] = useState<DeviceOption[]>([]);
  const [active, setActive] = useState<Partial<Record<MediaDeviceKind, string>>>({});
  const [newDevice, setNewDevice] = useState<NewDevice | null>(null);

  /**
   * B2: "Speaker selection needs `HTMLMediaElement.setSinkId`, unsupported in
   * Safari. Feature-detect and hide rather than showing a control that does
   * nothing."
   *
   * Held in state rather than read during render, because the answer depends on
   * `HTMLMediaElement` and the server has none — reading it while rendering
   * would make the first client paint disagree with the server's.
   */
  const [speakerChoosable, setSpeakerChoosable] = useState(false);
  useEffect(() => setSpeakerChoosable(canChooseSpeaker()), []);

  /** The ids seen last time, so "new" means new rather than merely present. */
  const seen = useRef<Set<string> | null>(null);

  const read = useCallback(
    async (announceNew: boolean) => {
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const byKind = (kind: MediaDeviceKind) =>
        devices
          .filter((d) => d.kind === kind && d.deviceId)
          .map((d, i) => ({
            deviceId: d.deviceId,
            // Labels are empty until permission is granted. In the room it
            // always has been, so this is a floor rather than the usual case.
            label: d.label || `${kind} ${i + 1}`,
          }));

      setCameras(byKind("videoinput"));
      setMicrophones(byKind("audioinput"));
      setSpeakers(byKind("audiooutput"));

      const next: Partial<Record<MediaDeviceKind, string>> = {};
      for (const kind of KINDS) next[kind] = room.getActiveDevice(kind);
      setActive(next);

      /**
       * What arrived since last time.
       *
       * `default` and `communications` are aliases Chrome reports alongside the
       * real device, and they change identity when the underlying default
       * changes — so they look new every time something is plugged in and would
       * prompt about a device nobody added.
       */
      const ids = new Set(
        devices.filter((d) => d.deviceId && !["default", "communications"].includes(d.deviceId))
          .map((d) => `${d.kind}:${d.deviceId}`),
      );
      const previous = seen.current;
      seen.current = ids;
      if (!announceNew || !previous) return;

      const arrived = devices.filter(
        (d) =>
          d.deviceId &&
          !["default", "communications"].includes(d.deviceId) &&
          !previous.has(`${d.kind}:${d.deviceId}`),
      );
      if (arrived.length === 0) return;

      /**
       * One prompt for one piece of hardware.
       *
       * A headset is an `audioinput` and an `audiooutput` with the same label,
       * and asking twice about AirPods is asking about a thing that arrived
       * once. Grouping by label is what makes "Switch" move both.
       */
      const label = arrived[0].label || "A new device";
      const grouped: Partial<Record<MediaDeviceKind, string>> = {};
      for (const device of arrived) {
        if (device.label !== arrived[0].label) continue;
        if (device.kind === "audiooutput" && !canChooseSpeaker()) continue;
        grouped[device.kind] ??= device.deviceId;
      }
      if (Object.keys(grouped).length === 0) return;
      setNewDevice({ byKind: grouped, label });
    },
    [room],
  );

  const switchTo = useCallback(
    async (kind: MediaDeviceKind, deviceId: string) => {
      await room.switchActiveDevice(kind, deviceId).catch(() => {});
      // Remembered for the next meeting, the same store pre-join writes — one
      // key, so a choice made here is the choice the preview shows next time.
      writeDevices({ [STORAGE_KEY[kind]]: deviceId });
      await read(false);
    },
    [room, read],
  );

  /**
   * Hot-plug. B2: "**Do not switch silently.** … Silently moving someone's
   * audio to a device they did not choose is how a private conversation comes
   * out of a laptop speaker in an open office."
   *
   * The reverse is just as true and is why the prompt is not a modal: someone
   * plugging in headphones mid-sentence should not have a dialog thrown over
   * the person talking. It asks, and it can be ignored.
   */
  useEffect(() => {
    void read(false);
    const onChange = () => void read(true);
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, [read]);

  const acceptNewDevice = useCallback(async () => {
    const device = newDevice;
    setNewDevice(null);
    if (!device) return;
    for (const [kind, deviceId] of Object.entries(device.byKind)) {
      await switchTo(kind as MediaDeviceKind, deviceId);
    }
  }, [newDevice, switchTo]);

  return {
    cameras,
    microphones,
    speakers,
    active,
    speakerChoosable,
    switchTo,
    newDevice,
    acceptNewDevice,
    dismissNewDevice: useCallback(() => setNewDevice(null), []),
  };
}
