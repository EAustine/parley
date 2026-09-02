"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocalParticipant, useTracks } from "@livekit/components-react";
import { Track, type Participant } from "livekit-client";

/**
 * §3.7. One share at a time, desktop only, and stoppable from either end.
 *
 * §3.7 singles out the browser's own "Stop sharing" bar: someone who uses it
 * has genuinely stopped, and a UI that keeps the control lit is confidently
 * wrong about something the person can see is finished.
 *
 * **The SDK already handles that, and this hook does not.** An earlier version
 * listened for `ended` on the underlying MediaStreamTrack and unpublished; a
 * mutation check found the listener could be deleted with no test failing,
 * which sent me to the source. `LocalParticipant.handleTrackEnded` unpublishes
 * whenever an ended track's source is `ScreenShare` — its own log line reads
 * "unpublishing local track due to TrackEnded". Our listener was downstream of
 * that and never did anything.
 *
 * It is gone rather than kept as a backstop. A guard that cannot fire cannot
 * be tested, and one carrying a comment claiming it is the mechanism is worse
 * than none — that is exactly what CLAUDE.md's first testing rule is about.
 * The behaviour is pinned by an end-to-end test instead, which holds whoever
 * provides it: if LiveKit ever stops doing this, that test goes red and the
 * listener comes back with evidence behind it.
 *
 * LiveKit republishes on `setScreenShareEnabled`, so the local publication is
 * the source of truth for whether *we* are sharing — rule 3's reasoning, one
 * surface along.
 */

export type ScreenShareState = {
  /** Available at all — §3.7 is desktop only. */
  supported: boolean;
  /** This participant is sharing. Derived from the publication, not a boolean. */
  sharing: boolean;
  /** Whoever is sharing, local or remote, or null. */
  presenter: Participant | null;
  /** The track to render in the main area. Null when the presenter is us. */
  remoteTrack: Track | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Set when a share failed for a reason worth showing. */
  error: string | null;
  clearError: () => void;
};

export function useScreenShare(): ScreenShareState {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  // §3.7: desktop only. Decided by whether the API exists and whether the
  // device has a pointer — iOS Safari exposes `getDisplayMedia` on iPad and
  // then refuses, so presence alone is not the question.
  useEffect(() => {
    const hasApi =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getDisplayMedia === "function";
    setSupported(hasApi && window.matchMedia("(hover: hover)").matches);
  }, []);

  const shares = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const share = shares[0];
  const presenter = share?.participant ?? null;
  const remoteTrack =
    presenter && !presenter.isLocal ? (share?.publication?.track ?? null) : null;

  const start = useCallback(async () => {
    setError(null);
    try {
      await localParticipant.setScreenShareEnabled(true, {
        // §3.7: "Audio share, where supported, is passed through." Chrome
        // offers it for a tab; Firefox and Safari ignore the request rather
        // than failing, so asking costs nothing where it is not available.
        audio: true,
      });
    } catch (cause) {
      // Cancelling the picker is not a failure. It is the commonest outcome of
      // pressing the button — people open it to see what is on offer — and an
      // error state for it would be noise.
      const name = cause instanceof Error ? cause.name : "";
      if (name === "NotAllowedError" || name === "AbortError") return;
      setError("Couldn't start sharing. Try again, or pick a different window.");
    }
  }, [localParticipant]);

  const stop = useCallback(async () => {
    try {
      await localParticipant.setScreenShareEnabled(false);
    } catch {
      // Already stopped — usually because the browser's own control got there
      // first, which is exactly the case below.
    }
  }, [localParticipant]);

  return {
    supported,
    sharing: isScreenShareEnabled,
    presenter,
    remoteTrack,
    start,
    stop,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
