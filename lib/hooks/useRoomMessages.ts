"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel, useRoomContext } from "@livekit/components-react";
import { RoomEvent, type Participant } from "livekit-client";

import { displayNameOf } from "@/lib/room/participant";
import {
  MESSAGE_TOPIC,
  REACTION_NAMES,
  decode,
  encode,
  sanitiseChatBody,
  type Reaction,
} from "@/lib/room/messages";
import {
  REACTION_ANNOUNCE_MS,
  REACTION_INTERVAL_MS,
  Throttle,
  nextLane,
} from "@/lib/room/reaction-limit";
import {
  appendBounded,
  type LogEntry,
  type ReactionEvent,
} from "@/lib/room/chat";

/**
 * Chat and reactions, over the one data channel.
 *
 * The receiving half is deliberately as suspicious as a route handler. There
 * is no server on this path at all — packets go participant to participant
 * through the SFU — so anyone who can join a meeting can craft one, and
 * `decode` is the only thing standing between that and the render tree.
 *
 * The sender of every packet comes from LiveKit's `from`, never from the
 * payload. §3.6's rate limit is applied on both sides for the same reason the
 * token endpoint derives identity server-side: a client that has been patched
 * is exactly the case the receiving half exists for.
 */

/** §3.6: reactions live 2400ms, then they are gone. */
const REACTION_LIFETIME_MS = 2400;

export type RoomMessages = {
  log: LogEntry[];
  reactions: ReactionEvent[];
  unread: number;
  /** The last thing worth announcing. Read by one polite live region. */
  announcement: string;
  sendChat: (body: string) => void;
  sendReaction: (emoji: Reaction) => void;
  markRead: () => void;
};

export function useRoomMessages({ panelOpen }: { panelOpen: boolean }): RoomMessages {
  const room = useRoomContext();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  // Read inside callbacks that must not be rebuilt when it changes — a new
  // handler identity would tear down and re-establish the subscription.
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  const counter = useRef(0);
  const nextId = () => `m${++counter.current}`;

  // Two gates, two windows. §3.6 limits what is rendered to one a second;
  // §9 limits what is *announced* to one per participant per two seconds,
  // because a screen reader reading six reactions is worse than silence.
  const renderGate = useRef(new Throttle(REACTION_INTERVAL_MS));
  const announceGate = useRef(new Throttle(REACTION_ANNOUNCE_MS));

  const addReaction = useCallback(
    (identity: string, name: string, emoji: Reaction) => {
      const now = Date.now();
      if (!renderGate.current.take(identity, now)) return;

      const id = nextId();
      setReactions((current) => [
        ...current,
        { id, identity, name, emoji, at: now, lane: nextLane(current.length) },
      ]);
      // Removed on a timer rather than by the animation's end event: an
      // animation that never runs — a backgrounded tab, reduced motion — would
      // otherwise leave the reaction on screen forever.
      setTimeout(() => {
        setReactions((current) => current.filter((r) => r.id !== id));
      }, REACTION_LIFETIME_MS);

      if (announceGate.current.take(identity, now)) {
        setAnnouncement(`${name} reacted with ${REACTION_NAMES[emoji]}`);
      }
    },
    [],
  );

  const addChat = useCallback(
    (entry: Omit<Extract<LogEntry, { type: "chat" }>, "type" | "id">) => {
      setLog((current) => appendBounded(current, { type: "chat", id: nextId(), ...entry }));
      if (entry.mine) return;
      if (!panelOpenRef.current) {
        setUnread((n) => n + 1);
        // §9: the sender and the fact of a message, never the body. The body
        // is in the panel, which is where someone chooses to read it.
        setAnnouncement(`${entry.name} sent a message`);
      }
    },
    [],
  );

  // --- receiving -----------------------------------------------------------

  const onMessage = useRef<(payload: Uint8Array, from?: Participant) => void>(
    () => {},
  );
  onMessage.current = (payload, from) => {
    const envelope = decode(payload);
    // Dropped in silence. A malformed packet from one participant must not be
    // able to interrupt the room for everyone else.
    if (!envelope || !from) return;

    const name = displayNameOf(from);
    if (envelope.kind === "chat") {
      addChat({
        identity: from.identity,
        name,
        body: envelope.body,
        at: Date.now(),
        mine: false,
      });
    } else {
      addReaction(from.identity, name, envelope.emoji);
    }
  };

  const { send } = useDataChannel(MESSAGE_TOPIC, (message) => {
    onMessage.current(message.payload, message.from);
  });

  // --- sending -------------------------------------------------------------

  const sendChat = useCallback(
    (raw: string) => {
      const body = sanitiseChatBody(raw);
      if (!body) return;

      // `publishData` does not echo to the sender, so the local copy is added
      // here rather than waiting for a round trip that will not come.
      addChat({
        identity: room.localParticipant.identity,
        name: displayNameOf(room.localParticipant),
        body,
        at: Date.now(),
        mine: true,
      });
      // Reliable: a chat message that quietly did not arrive is the failure
      // §3.5 is measured on.
      void send(encode({ v: 1, kind: "chat", body }), { reliable: true }).catch(
        () => {
          // Nothing useful to say. The message is already on the sender's own
          // screen, and Phase 8 owns what a broken connection looks like.
        },
      );
    },
    [addChat, room, send],
  );

  const sendReaction = useCallback(
    (emoji: Reaction) => {
      const identity = room.localParticipant.identity;
      // The send-side half of §3.6. Checked before anything is drawn, so a
      // dropped press does nothing at all rather than showing locally and
      // arriving nowhere.
      if (!renderGate.current.take(identity, Date.now())) return;

      const id = nextId();
      setReactions((current) => [
        ...current,
        {
          id,
          identity,
          name: displayNameOf(room.localParticipant),
          emoji,
          at: Date.now(),
          lane: nextLane(current.length),
        },
      ]);
      setTimeout(() => {
        setReactions((current) => current.filter((r) => r.id !== id));
      }, REACTION_LIFETIME_MS);

      // Lossy on purpose. A reaction that arrives late is worse than one that
      // does not arrive: it lands after the moment it was reacting to, on top
      // of whatever is happening instead.
      void send(encode({ v: 1, kind: "reaction", emoji }), {
        reliable: false,
      }).catch(() => {});
    },
    [room, send],
  );

  // --- who is here ---------------------------------------------------------

  useEffect(() => {
    const joined = (participant: Participant) => {
      setLog((current) =>
        appendBounded(current, {
          type: "system",
          id: nextId(),
          kind: "joined",
          name: displayNameOf(participant),
          at: Date.now(),
        }),
      );
    };
    const left = (participant: Participant) => {
      // Someone who has gone cannot be rate-limited, and leaving their entry
      // in the map keeps it growing for the length of the meeting.
      renderGate.current.forget(participant.identity);
      announceGate.current.forget(participant.identity);
      setLog((current) =>
        appendBounded(current, {
          type: "system",
          id: nextId(),
          kind: "left",
          name: displayNameOf(participant),
          at: Date.now(),
        }),
      );
    };

    room.on(RoomEvent.ParticipantConnected, joined);
    room.on(RoomEvent.ParticipantDisconnected, left);
    return () => {
      room.off(RoomEvent.ParticipantConnected, joined);
      room.off(RoomEvent.ParticipantDisconnected, left);
    };
  }, [room]);

  const markRead = useCallback(() => setUnread(0), []);

  return { log, reactions, unread, announcement, sendChat, sendReaction, markRead };
}
