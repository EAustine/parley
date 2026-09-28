"use client";

import { useEffect, useRef } from "react";
import {
  useConnectionQualityIndicator,
  useParticipants,
} from "@livekit/components-react";
import { type Participant } from "livekit-client";

import { siteUrl } from "@/lib/site";
import { ParticipantRow } from "@/components/room/ParticipantRow";
import { CopyLinkButton } from "@/components/meetings/CopyLinkButton";
import { type Quality } from "@/lib/room/connection";

import { displayNameOf, isHost } from "@/lib/room/participant";
import { BlockedList, WaitingQueue } from "@/components/room/WaitingQueue";
import type { BlockedPerson, WaitingRequest } from "@/lib/hooks/useWaitingQueue";

/**
 * §3.8. Everyone present, what their devices are doing, and — for a host — the
 * two things they can do about it.
 *
 * The asymmetry is the whole design. A host can **ask** someone to mute and can
 * remove them; a host can never turn someone's microphone or camera *on*. Those
 * are different in kind: one is a request about a shared space, the other is
 * reaching into somebody's room. There is no unmute action here because there
 * is no unmute message to send — see `lib/room/messages.ts`.
 *
 * Built as a complementary region rather than a dialog, for the reason the chat
 * panel is: §3.4 requires the controls to stay reachable with a panel open, and
 * a modal makes the room behind it inert.
 */
export function PeopleBody({
  open,
  isLocalHost,
  code,
  waiting,
  blocked,
  onDecide,
  deciding,
  onLetBackIn,
  onRequestMute,
  onRemove,
}: {
  open: boolean;
  isLocalHost: boolean;
  /** The room's own link, for C3's copy row at the top. */
  code: string;
  /** v1.5 A2's queue, polled in the room so the badge and toast work with this closed. */
  waiting: WaitingRequest[];
  /** v1.5 B2: who is shut out, and the way back. */
  blocked: BlockedPerson[];
  onDecide: (id: string, decision: "admit" | "deny") => void;
  deciding: string | null;
  onLetBackIn: (id: string) => void;
  onRequestMute: (identity: string) => void;
  onRemove: (identity: string) => void;
}) {
  const participants = useParticipants();
  const close = useRef<HTMLButtonElement>(null);

  /**
   * Move focus into the panel when it opens.
   *
   * Without this the panel could be opened from the keyboard and not closed.
   * The Escape handler below is `onKeyDown` on this element, so React only
   * sees the key when focus is already inside — and nothing put it there.
   * Focus stayed on the trigger in the control bar, Escape went nowhere, and
   * the only way out was a mouse.
   *
   * `ChatPanel` never had the bug because it focuses its composer on open,
   * which is also why the fault survived: the two panels looked alike and one
   * of them worked.
   *
   * The close button rather than the list: it is the way out, and §9's floor
   * wants Escape to return focus to the trigger, so landing on the control
   * that does the same thing keeps the two consistent.
   */
  useEffect(() => {
    /*
     * `preventScroll` because the panel is mid-entrance when this runs.
     *
     * v1.2 C1 animates the sheet up from `translate: 0 100%`, so for the first
     * frames the focus target sits below the room's `overflow-hidden` box. The
     * browser then scrolls that container to reveal it — measured at
     * `scrollTop: 487`, exactly the sheet's height — and everything inside,
     * including the absolutely positioned control bar, jumped 487px up until
     * the animation unwound. On a phone that reads as the whole room lurching
     * every time you open chat.
     *
     * The panel is on screen by design; the scroll was an artefact of being
     * measured before it arrived. Nothing here needs revealing.
     */
    if (open) close.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      {/*
        C3: "copy link at the top". The meeting link had no home in the room at
        all — a host who wanted to invite someone mid-meeting had to leave for
        the dashboard. This is the one surface where the question "how do I get
        someone else in here" is already being asked.
      */}
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted p-3">
        <span className="min-w-0 flex-1 truncate font-mono type-small text-muted-foreground">
          {`${siteUrl().replace(/^https?:\/\//, "")}/j/${code}`}
        </span>
        <CopyLinkButton code={code} withLabel />
      </div>

      {/* v1.5 A2: above the roster, because a pending decision outranks a list. */}
      {isLocalHost && (
        <>
          <WaitingQueue waiting={waiting} onDecide={onDecide} deciding={deciding} />
          <BlockedList blocked={blocked} onLetBackIn={onLetBackIn} />
        </>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {participants.map((participant) => (
          <ParticipantRowContainer
            key={participant.identity}
            participant={participant}
            isLocalHost={isLocalHost}
            onRequestMute={onRequestMute}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </>
  );
}

/**
 * The subscribing half — and the reason the split exists.
 *
 * Connection quality is the server's verdict, delivered over the signalling
 * socket. `check:connection` puts it plainly: `ConnectionQuality.Poor` "is not
 * reachable by any local test… killing the network produces no updates rather
 * than a bad one." So while the row fetched its own quality, the chip could
 * never be made to render in a test, and its geometry — the thing that drove
 * the row to three lines and into the device icons in the first place — was
 * unpinnable. `participant-row.spec.ts` said so in a comment and left it to
 * `MANUAL.md`.
 *
 * Lifting quality to a prop dissolves that. The container subscribes; the row
 * receives. It is the same boundary rule 3 already draws for mute — truth is
 * derived from the source, and the thing that renders it is not the thing that
 * fetches it — and the payoff is the same: the rendering half becomes something
 * a test can hold still.
 *
 * What stays manual shrinks to one link: whether a genuinely poor connection
 * produces `poor` at all. That is one mapping, and `check:connection` already
 * pins every value of it that a local process can see.
 */
function ParticipantRowContainer({
  participant,
  isLocalHost,
  onRequestMute,
  onRemove,
}: {
  participant: Participant;
  isLocalHost: boolean;
  onRequestMute: (identity: string) => void;
  onRemove: (identity: string) => void;
}) {
  const { quality } = useConnectionQualityIndicator({ participant });

  return (
    <ParticipantRow
      name={displayNameOf(participant)}
      identity={participant.identity}
      isLocal={participant.isLocal}
      isTheHost={isHost(participant)}
      micOn={participant.isMicrophoneEnabled}
      cameraOn={participant.isCameraEnabled}
      quality={quality as Quality}
      // A host's own row gets no actions: removing yourself is Leave with extra
      // steps, and asking yourself to mute is what the mic button is for.
      showActions={isLocalHost && !participant.isLocal}
      onRequestMute={onRequestMute}
      onRemove={onRemove}
    />
  );
}
