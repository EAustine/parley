"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { RoomEvent } from "livekit-client";

import {
  announcementFor,
  phaseFor,
  type Quality,
  type RoomPhase,
  type RoomState,
} from "@/lib/room/connection";
import type { RetryCounter } from "@/lib/room/retry-counter";

/**
 * Everything §3.11 needs to render, derived rather than mirrored.
 *
 * Rule 3 is written about mute state, and its reasoning is general: a parallel
 * boolean is a second source of truth that can disagree with the first, and
 * the disagreement is invisible. Connection state has exactly that shape — a
 * `useState<boolean>` set from `RoomEvent.Reconnecting` would go stale the
 * moment a reconnection resolved through a path that does not emit it.
 *
 * So state comes from `useConnectionState`, quality from
 * `useConnectionQualityIndicator`, and whether audio can play from
 * `room.canPlaybackAudio` — each read from the library, each re-read when the
 * library says it changed.
 *
 * **One value is genuinely held here, and it is the honest exception:** the
 * retry attempt number. It has no home in any publication or getter — see
 * `lib/room/retry-counter.ts` for why — so it is recorded outside React and
 * read through `useSyncExternalStore`. This is the same shape as
 * `useScreenShare`'s `takingOver` ref: state recording something the library
 * cannot be asked for, documented here so the next reader does not take it for
 * a rule-3 violation and "fix" it.
 */

export type RoomConnection = {
  phase: RoomPhase;
  /** Failed attempts so far. Only meaningful while reconnecting. */
  attempts: number;
  /** §12: the browser refused to play remote audio until someone asks. */
  audioBlocked: boolean;
  allowAudio: () => void;
  /**
   * §12: the tab came back and the connection did not survive being hidden.
   * Distinct from a network drop — nothing is retrying, and the person has to
   * ask for it.
   */
  resumeNeeded: boolean;
  resume: () => void;
};

export function useRoomConnection(
  retry: RetryCounter,
  /** Supplied by `RoomStage`, which owns the server url and the token. */
  reconnect: () => void,
  /** The room's shared announcer — see `lib/hooks/useAnnouncer.ts`. */
  announce: (text: string) => void,
): RoomConnection {
  const room = useRoomContext();
  const state = useConnectionState(room) as RoomState;
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({
    participant: localParticipant,
  });

  const phase = phaseFor(state, quality as Quality);

  const attempts = useSyncExternalStore(
    retry.subscribe,
    retry.getAttempts,
    // Server snapshot. The room never renders on the server, but the hook is
    // in a client component inside a route that does, and a missing third
    // argument throws during hydration rather than at a convenient moment.
    () => 0,
  );

  /**
   * §9: "announced once per change, never per retry."
   *
   * The comparison is against what was last *announced*, not against the last
   * phase seen, and the ref is written in the same pass that produces the
   * string. Deriving it from a previous-render value instead would announce
   * again on any re-render that happened to arrive between two phases.
   */
  const announced = useRef<RoomPhase | null>(null);
  const announceRef = useRef(announce);
  announceRef.current = announce;

  useEffect(() => {
    const next = announcementFor(phase, announced.current);
    announced.current = phase;
    if (next) announceRef.current(next);
  }, [phase]);

  // A recovered connection starts its next outage from attempt one.
  useEffect(() => {
    if (state === "connected") retry.reset();
  }, [state, retry]);

  /**
   * §12's autoplay fallback.
   *
   * `canPlaybackAudio` is the truth and the event is only the invalidation
   * signal — reading the getter on each notification rather than trusting the
   * event's payload means a state set before we subscribed is still seen on
   * the first snapshot.
   */
  const audioBlocked = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        room.on(RoomEvent.AudioPlaybackStatusChanged, onChange);
        return () => {
          room.off(RoomEvent.AudioPlaybackStatusChanged, onChange);
        };
      },
      [room],
    ),
    () => !room.canPlaybackAudio,
    () => false,
  );

  const allowAudio = useCallback(() => {
    // Called from a click, which is the gesture the policy was waiting for.
    void room.startAudio().catch(() => {});
  }, [room]);

  /**
   * §12, and the iOS Safari row in the risk table.
   *
   * `disconnectOnPageLeave` is off (see `RoomStage`), so an ordinary tab
   * switch no longer tears the room down. What that option does not cover is a
   * real bfcache `freeze`, which the SDK listens for outside its guard — so
   * the connection can still be gone when someone comes back, and this is the
   * state that says so rather than leaving a dead room on screen.
   *
   * Resuming is a button, not automatic. Coming back to a tab is not consent
   * to switch the camera on, and Safari sometimes requires the gesture anyway.
   */
  const [resumeNeeded, setResumeNeeded] = useState(false);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (room.state === "disconnected") setResumeNeeded(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [room]);

  useEffect(() => {
    if (state === "connected" && resumeNeeded) setResumeNeeded(false);
  }, [state, resumeNeeded]);

  const resume = useCallback(() => {
    setResumeNeeded(false);
    // Reconnecting needs the server url and the token, which belong to
    // `RoomStage` — it fetched them and it owns their lifetime. Rebuilding
    // them here from `room` is not possible and guessing at them would be the
    // kind of thing that works until a token expires.
    reconnect();
  }, [reconnect]);

  return {
    phase,
    attempts,
    audioBlocked,
    allowAudio,
    resumeNeeded,
    resume,
  };
}
