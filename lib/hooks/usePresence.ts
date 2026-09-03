"use client";

import { useEffect, useRef } from "react";
import { useParticipants, useRoomContext } from "@livekit/components-react";
import { RoomEvent, type Participant } from "livekit-client";

import { displayNameOf } from "@/lib/room/participant";
import { BATCH_WINDOW_MS, PresenceBatcher } from "@/lib/room/presence";
import type { RoomPhase } from "@/lib/room/connection";

/**
 * Join and leave, announced the way §9 asks.
 *
 * Its own subscription rather than a branch inside `useRoomMessages`: that
 * hook's handlers write chat-log rows, which is a different rule with
 * different timing — every arrival gets a log row, and only some get
 * announced. Merging them would put two policies in one handler.
 *
 * **Suppressed entirely while the connection is not healthy**, which no
 * document asks for and every reconnection requires. LiveKit unwinds the room
 * on a reconnect: `ParticipantDisconnected` for every remote participant, then
 * `ParticipantConnected` for every one again. In a nine-person room that is
 * sixteen events from one blip, arriving on top of "Connection restored." —
 * §9's flooding, at the worst possible moment, in the phase written to prevent
 * it.
 *
 * The participant-count threshold does not save it: the SDK's map drains as
 * the unwind runs, so the count falls past any threshold mid-burst.
 *
 * The settle delay after `healthy` returns is because the re-add burst arrives
 * *after* the state flips back, not before.
 */
export const PRESENCE_SETTLE_MS = 3_000;

export function usePresence({
  phase,
  announce,
}: {
  phase: RoomPhase;
  announce: (text: string) => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();

  const batcher = useRef<PresenceBatcher>(undefined as unknown as PresenceBatcher);
  if (!batcher.current) batcher.current = new PresenceBatcher();

  // Read inside handlers that must not be rebuilt when they change — a new
  // handler identity would tear down and re-establish the subscription, and
  // re-subscribing mid-burst is how events get counted twice.
  const healthyRef = useRef(false);
  const sizeRef = useRef(participants.length);
  sizeRef.current = participants.length;
  const announceRef = useRef(announce);
  announceRef.current = announce;

  /**
   * `healthy` is delayed on the way up and immediate on the way down.
   *
   * Dropping events the instant anything goes wrong is right; resuming the
   * instant it comes back is not, because that is precisely when the re-add
   * burst lands.
   */
  useEffect(() => {
    if (phase !== "healthy") {
      healthyRef.current = false;
      batcher.current.discard();
      return;
    }
    const timer = window.setTimeout(() => {
      // Anything that arrived during the settle window is unwind noise.
      batcher.current.discard();
      healthyRef.current = true;
    }, PRESENCE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const say = (text: string | null) => {
      if (text) announceRef.current(text);
    };

    const joined = (participant: Participant) => {
      if (!healthyRef.current) return;
      say(batcher.current.add(
        { kind: "joined", name: displayNameOf(participant) },
        Date.now(),
        sizeRef.current,
      ));
    };
    const left = (participant: Participant) => {
      if (!healthyRef.current) return;
      say(batcher.current.add(
        { kind: "left", name: displayNameOf(participant) },
        Date.now(),
        sizeRef.current,
      ));
    };

    room.on(RoomEvent.ParticipantConnected, joined);
    room.on(RoomEvent.ParticipantDisconnected, left);
    return () => {
      room.off(RoomEvent.ParticipantConnected, joined);
      room.off(RoomEvent.ParticipantDisconnected, left);
    };
  }, [room]);

  /**
   * Closing the window needs a clock of its own: the last event of a burst is
   * the one with nothing after it to trigger a flush, and that is exactly the
   * event whose batch would otherwise never be spoken.
   */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (!batcher.current.due(now)) return;
      for (const text of batcher.current.flush(now, sizeRef.current)) {
        announceRef.current(text);
      }
    }, Math.min(1_000, BATCH_WINDOW_MS / 2));
    return () => window.clearInterval(timer);
  }, []);
}
