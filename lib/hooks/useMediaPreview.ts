"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { acquireStream } from "@/lib/media/acquire";
import {
  forgetStoredDevices,
  readDevices,
  writeDevices,
} from "@/lib/media/devices";
import {
  classifyMediaError,
  type PermissionHint,
  type PermissionState,
} from "@/lib/media/classify";

/**
 * Camera and microphone preview, on `navigator.mediaDevices` alone.
 *
 * No LiveKit here, deliberately — rule 8 and §10. Pre-join needs a preview and
 * a device list, both of which the platform provides, and pulling
 * `livekit-client` in for them would put the largest dependency in the product
 * on its most bandwidth-sensitive route.
 *
 * The six permission states in §3.3 are the reason this is a hook rather than
 * a few lines in a component. Each has to be told apart from the others, and
 * `getUserMedia` reports several of them through the same error name.
 */

export type { PermissionState };

export type MediaDeviceOption = { deviceId: string; label: string };

export type MediaPreview = {
  state: PermissionState;
  stream: MediaStream | null;
  cameras: MediaDeviceOption[];
  microphones: MediaDeviceOption[];
  speakers: MediaDeviceOption[];
  cameraId: string | null;
  microphoneId: string | null;
  speakerId: string | null;
  cameraOn: boolean;
  micOn: boolean;
  /** Whether a working track of that kind was actually acquired. */
  hasCamera: boolean;
  hasMicrophone: boolean;
  /** 0–1, smoothed. Drives the input meter. */
  level: number;
  request: () => Promise<void>;
  setCamera: (deviceId: string) => void;
  setMicrophone: (deviceId: string) => void;
  setSpeaker: (deviceId: string) => void;
  toggleCamera: () => void;
  toggleMic: () => void;
  stop: () => void;
};

/**
 * Asks the Permissions API which reading of `NotAllowedError` applies, then
 * hands both to the shared classifier. Firefox has no `camera` descriptor and
 * Safari has neither, so a null hint is normal rather than exceptional — see
 * `classifyMediaError` for what stands in for it.
 */
async function classifyError(
  error: unknown,
  previous: PermissionState | null,
): Promise<PermissionState> {
  let hint: PermissionHint = null;
  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    hint = status.state as PermissionHint;
  } catch {
    hint = null;
  }
  return classifyMediaError(error, hint, previous);
}

export function useMediaPreview(): MediaPreview {
  const [state, setState] = useState<PermissionState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceOption[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceOption[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [microphoneId, setMicrophoneId] = useState<string | null>(null);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [hasCamera, setHasCamera] = useState(false);
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<{ context: AudioContext; frame: number } | null>(null);
  // Read inside `request` without making it a dependency: the classifier needs
  // to know what the screen was showing, and re-creating the callback on every
  // state change would restart the effects that depend on it.
  const stateRef = useRef<PermissionState>("idle");
  stateRef.current = state;

  // Restore remembered choices before anything is requested, so the first
  // getUserMedia asks for the right devices rather than the defaults.
  useEffect(() => {
    const stored = readDevices();
    if (stored.cameraId) setCameraId(stored.cameraId);
    if (stored.microphoneId) setMicrophoneId(stored.microphoneId);
    if (stored.speakerId) setSpeakerId(stored.speakerId);
    if (stored.cameraOn === false) setCameraOn(false);
    if (stored.micOn === false) setMicOn(false);
  }, []);

  const stopMeter = useCallback(() => {
    if (!audioRef.current) return;
    cancelAnimationFrame(audioRef.current.frame);
    void audioRef.current.context.close();
    audioRef.current = null;
    setLevel(0);
  }, []);

  /**
   * The input meter. §3.3 asks for a response within 200ms, so this reads the
   * analyser on every animation frame rather than on a timer, and smooths
   * asymmetrically: it rises immediately and falls slowly. A meter that decays
   * as fast as it rises reads as flicker rather than as speech.
   */
  const startMeter = useCallback(
    (source: MediaStream) => {
      stopMeter();
      const track = source.getAudioTracks()[0];
      if (!track) return;

      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.1;
      context.createMediaStreamSource(source).connect(analyser);

      const samples = new Float32Array(analyser.fftSize);
      let smoothed = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        // Speech sits well below full scale; ×4 puts normal talking in the
        // upper half of the meter instead of a permanent sliver.
        const scaled = Math.min(1, rms * 4);
        smoothed = scaled > smoothed ? scaled : smoothed * 0.85 + scaled * 0.15;
        setLevel(smoothed);
        const frame = requestAnimationFrame(tick);
        if (audioRef.current) audioRef.current.frame = frame;
      };

      audioRef.current = { context, frame: requestAnimationFrame(tick) };
    },
    [stopMeter],
  );

  const stop = useCallback(() => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, [stopMeter]);

  /**
   * Ask for devices. Called from a click, never on mount — §3.3 is explicit
   * that the browser prompt must not fire on page load, because a prompt with
   * no explanation in front of it is one people dismiss.
   *
   * What to ask for, and what to ask for next when that fails, is
   * `acquireStream` — see there for why one request can take three attempts.
   */
  const request = useCallback(
    async (overrides?: { cameraId?: string; microphoneId?: string }) => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState(window.isSecureContext === false ? "insecure" : "unsupported");
        return;
      }

      const previous = stateRef.current;
      setState("requesting");

      const { stream: next, error, forgotDevices } = await acquireStream(
        (constraints) => navigator.mediaDevices.getUserMedia(constraints),
        {
          cameraId: overrides?.cameraId ?? cameraId,
          microphoneId: overrides?.microphoneId ?? microphoneId,
        },
      );

      if (forgotDevices) {
        forgetStoredDevices();
        setCameraId(null);
        setMicrophoneId(null);
      }

      if (!next) {
        setState(await classifyError(error, previous));
        return;
      }

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = next;
      setStream(next);
      setState("granted");

      // Labels are empty strings until permission is granted, which is why
      // the list is only read after, never before.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const byKind = (kind: MediaDeviceKind) =>
        devices
          .filter((d) => d.kind === kind && d.deviceId)
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `${kind} ${i + 1}`,
          }));

      setCameras(byKind("videoinput"));
      setMicrophones(byKind("audioinput"));
      setSpeakers(byKind("audiooutput"));

      const videoTracks = next.getVideoTracks();
      const audioTracks = next.getAudioTracks();
      setHasCamera(videoTracks.length > 0);
      setHasMicrophone(audioTracks.length > 0);

      const activeCamera = videoTracks[0]?.getSettings().deviceId;
      const activeMic = audioTracks[0]?.getSettings().deviceId;
      if (activeCamera) setCameraId(activeCamera);
      if (activeMic) setMicrophoneId(activeMic);

      // Apply the remembered on/off state to the real tracks. Rule 3: the UI
      // reads track state, so the track is what gets set. A device that isn't
      // there reads as off — but the stored preference is left alone, so it
      // comes back on its own when the hardware does.
      videoTracks.forEach((t) => (t.enabled = cameraOn));
      audioTracks.forEach((t) => (t.enabled = micOn));
      const cameraLive = videoTracks.some((t) => t.enabled);
      const micLive = audioTracks.some((t) => t.enabled);
      setCameraOn(cameraLive);
      setMicOn(micLive);

      if (micLive) startMeter(next);
      else stopMeter();
    },
    [cameraId, microphoneId, cameraOn, micOn, startMeter, stopMeter],
  );

  const setCamera = useCallback(
    (deviceId: string) => {
      setCameraId(deviceId);
      writeDevices({ cameraId: deviceId });
      // Re-acquire so the preview changes without a reload, per §3.3.
      void request({ cameraId: deviceId });
    },
    [request],
  );

  const setMicrophone = useCallback(
    (deviceId: string) => {
      setMicrophoneId(deviceId);
      writeDevices({ microphoneId: deviceId });
      void request({ microphoneId: deviceId });
    },
    [request],
  );

  const setSpeaker = useCallback((deviceId: string) => {
    setSpeakerId(deviceId);
    writeDevices({ speakerId: deviceId });
  }, []);

  /**
   * Toggles set `track.enabled` and then read it back, rather than flipping a
   * React boolean and hoping. Rule 3 is about the room, but the habit starts
   * here: if the track refuses, the UI must show what the track actually is.
   * With no track at all there is nothing to turn on, so the state holds.
   */
  const toggleCamera = useCallback(() => {
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    if (streamRef.current && tracks.length === 0) return;
    const next = !cameraOn;
    tracks.forEach((t) => (t.enabled = next));
    const actual = tracks.length > 0 ? tracks.some((t) => t.enabled) : next;
    setCameraOn(actual);
    writeDevices({ cameraOn: actual });
  }, [cameraOn]);

  const toggleMic = useCallback(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (streamRef.current && tracks.length === 0) return;
    const next = !micOn;
    tracks.forEach((t) => (t.enabled = next));
    const actual = tracks.length > 0 ? tracks.some((t) => t.enabled) : next;
    setMicOn(actual);
    writeDevices({ micOn: actual });
    if (actual && streamRef.current) startMeter(streamRef.current);
    else stopMeter();
  }, [micOn, startMeter, stopMeter]);

  // A camera unplugged mid-preview is a state, not a surprise.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    const onChange = async () => {
      if (state !== "granted") return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `camera ${i + 1}` })));
      setMicrophones(devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `microphone ${i + 1}` })));
      setSpeakers(devices.filter((d) => d.kind === "audiooutput" && d.deviceId).map((d, i) => ({ deviceId: d.deviceId, label: d.label || `speaker ${i + 1}` })));
      // The stream is the truth about what is still live — a track whose
      // device has gone ends, and an ended track is not a camera.
      const live = (kind: "video" | "audio") =>
        (kind === "video"
          ? streamRef.current?.getVideoTracks()
          : streamRef.current?.getAudioTracks()
        )?.some((t) => t.readyState === "live") ?? false;
      setHasCamera(live("video"));
      setHasMicrophone(live("audio"));
    };
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [state]);

  // Releasing the camera on unmount is not tidiness — the indicator light
  // stays on otherwise, which people reasonably read as still being watched.
  useEffect(() => stop, [stop]);

  return {
    state,
    stream,
    cameras,
    microphones,
    speakers,
    cameraId,
    microphoneId,
    speakerId,
    cameraOn,
    micOn,
    hasCamera,
    hasMicrophone,
    level,
    request: () => request(),
    setCamera,
    setMicrophone,
    setSpeaker,
    toggleCamera,
    toggleMic,
    stop,
  };
}
