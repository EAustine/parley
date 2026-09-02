"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalParticipant, useTracks } from "@livekit/components-react";
import { Track, type Participant } from "livekit-client";

import { displayNameOf } from "@/lib/room/participant";

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
  /**
   * Set when starting would replace someone else's share — §3.7. The dialog
   * goes to the person about to act, never to the one being replaced: waiting
   * on someone else's confirmation means a presenter who has stepped away
   * blocks everyone behind them, with no way forward.
   */
  replacing: Participant | null;
  confirmReplace: () => Promise<void>;
  cancelReplace: () => void;
  /** Set for the person who was replaced — a notice, not a question. */
  replacedBy: string | null;
  dismissReplaced: () => void;
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
  const [replacing, setReplacing] = useState<Participant | null>(null);
  const [replacedBy, setReplacedBy] = useState<string | null>(null);
  /**
   * Set while this participant is deliberately taking over.
   *
   * Without it both sides yield. The rule below — "I am sharing and someone
   * else's share exists, so I stop" — is true for the incoming presenter too
   * during the moment both tracks are live, so a straight reading of it hands
   * the room to nobody. The first version of this shipped with that bug and a
   * comment calling it a rare race; it was the normal path, and the test found
   * it on the first run.
   *
   * This is the ordering the rule needed: the person who just confirmed does
   * not yield to the person they confirmed over.
   */
  const takingOver = useRef(false);

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

  const begin = useCallback(async () => {
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

  /**
   * §3.7: "One share at a time." Starting while someone else presents asks
   * first — of the person starting, who is the one whose action has the
   * consequence and the only one who can act without waiting.
   */
  const start = useCallback(async () => {
    if (presenter && !presenter.isLocal) {
      setReplacing(presenter);
      return;
    }
    await begin();
  }, [begin, presenter]);

  const confirmReplace = useCallback(async () => {
    setReplacing(null);
    takingOver.current = true;
    await begin();
  }, [begin]);

  const cancelReplace = useCallback(() => setReplacing(null), []);

  const stop = useCallback(async () => {
    try {
      await localParticipant.setScreenShareEnabled(false);
    } catch {
      // Already stopped — usually because the browser's own control got there
      // first, which is exactly the case below.
    }
  }, [localParticipant]);

  /**
   * Yielding, when someone else takes over.
   *
   * No message is sent for this. The replacement *is* the new track appearing:
   * whoever was already sharing sees a second share and stops. What tells the
   * two apart is `takingOver` — set by the person who just confirmed, so the
   * rule applies to the one being replaced and not to both.
   *
   * The flag clears when the other share goes, which is the acknowledgement
   * that the handover finished. Nothing here depends on clocks agreeing.
   */
  useEffect(() => {
    const other = shares.find((s) => !s.participant.isLocal);

    if (!other) {
      // Nobody else is presenting: the handover is complete, or never began.
      takingOver.current = false;
      return;
    }
    if (!isScreenShareEnabled || takingOver.current) return;

    setReplacedBy(displayNameOf(other.participant));
    void localParticipant.setScreenShareEnabled(false).catch(() => {});
  }, [isScreenShareEnabled, shares, localParticipant]);

  return {
    supported,
    sharing: isScreenShareEnabled,
    replacing,
    confirmReplace,
    cancelReplace,
    replacedBy,
    dismissReplaced: useCallback(() => setReplacedBy(null), []),
    presenter,
    remoteTrack,
    start,
    stop,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
