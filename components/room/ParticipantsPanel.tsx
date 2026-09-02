"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useConnectionQualityIndicator,
  useParticipants,
} from "@livekit/components-react";
import { type Participant } from "livekit-client";

import { TILE_COPY, treatmentFor, type Quality } from "@/lib/room/connection";

import { ICONS } from "@/lib/icons";
import { displayNameOf, initialOf, isHost } from "@/lib/room/participant";
import { Button } from "@/components/ui/button";

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
export function ParticipantsPanel({
  open,
  isLocalHost,
  onClose,
  onRequestMute,
  onRemove,
}: {
  open: boolean;
  isLocalHost: boolean;
  onClose: () => void;
  onRequestMute: (identity: string) => void;
  onRemove: (identity: string) => void;
}) {
  const participants = useParticipants();

  return (
    <aside
      aria-label="Participants"
      hidden={!open}
      className={`${open ? "flex" : "hidden"} absolute inset-x-0 bottom-0 top-auto z-20 h-[60dvh] flex-col rounded-t-xl border-t bg-card md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[360px] md:rounded-t-none md:border-l md:border-t-0`}
      style={{ borderColor: "var(--tile-border)" }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header
        className="flex shrink-0 items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--tile-border)" }}
      >
        <h2 className="type-h2">
          Participants{" "}
          <span className="type-data tabular-nums text-muted-foreground">
            {participants.length}
          </span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close participants"
          className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ICONS.close.icon}
            size={20}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
        </button>
      </header>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {participants.map((participant) => (
          <ParticipantRow
            key={participant.identity}
            participant={participant}
            isLocalHost={isLocalHost}
            onRequestMute={onRequestMute}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </aside>
  );
}

function ParticipantRow({
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
  const name = displayNameOf(participant);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // A host's own row gets no actions: removing yourself is Leave with extra
  // steps, and asking yourself to mute is what the mic button is for.
  const showActions = isLocalHost && !participant.isLocal;

  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
        aria-hidden
      >
        <span className="type-small text-secondary-foreground">
          {initialOf(name)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="type-body truncate">
            {participant.isLocal ? `${name} (you)` : name}
          </span>
          {isHost(participant) && (
            <span className="type-caption text-muted-foreground">Host</span>
          )}
        </div>
        <ConnectionLabel participant={participant} />
      </div>

      {/* Device state, as icons with names. Rule 5: no hue — a muted mic is a
          different icon, not a red one. */}
      <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
        {!participant.isMicrophoneEnabled && (
          <HugeiconsIcon
            icon={ICONS.micOff.icon}
            size={16}
            strokeWidth={1.5}
            color="currentColor"
            aria-label={`${name}'s microphone is off`}
          />
        )}
        {!participant.isCameraEnabled && (
          <HugeiconsIcon
            icon={ICONS.cameraOff.icon}
            size={16}
            strokeWidth={1.5}
            color="currentColor"
            aria-label={`${name}'s camera is off`}
          />
        )}
      </div>

      {showActions && (
        <div className="flex shrink-0 items-center gap-1">
          {/* Only offered while they are unmuted. §3.8: a host can silence,
              never activate — so there is nothing to press once they are. */}
          {participant.isMicrophoneEnabled && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRequestMute(participant.identity)}
            >
              Ask to mute
            </Button>
          )}
          {confirmingRemove ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="text-[var(--state-critical)]"
                onClick={() => {
                  onRemove(participant.identity);
                  setConfirmingRemove(false);
                }}
              >
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>
                Keep
              </Button>
            </>
          ) : (
            // Two steps, because it cannot be undone from here — the person is
            // gone and has to be sent the link again.
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingRemove(true)}
              aria-label={`Remove ${name} from the meeting`}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * §3.8 lists connection quality as a column, and §3.11 maps it to treatments in
 * Phase 8. This is the panel's half: named, never a coloured dot on its own.
 *
 * Silence means fine — §3.11: "Excellent, good → No indicator."
 */
function ConnectionLabel({ participant }: { participant: Participant }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const treatment = treatmentFor(quality as Quality);

  // This shipped in Phase 7 testing quality negatively — returning null for
  // excellent and good, and treating everything else as a problem. That is
  // wrong at exactly one value, and it is the value every participant starts
  // on: the SDK seeds `_connectionQuality` to `Unknown` in the `Participant`
  // constructor, and resets to it after a full reconnect. So the panel
  // labelled every participant "Unstable connection" from the moment they
  // joined until the server's first quality update, and again after every
  // recovery.
  //
  // `treatmentFor` is the positive form, shared with the tile so the two
  // surfaces cannot drift, and `npm run check:connection` pins the `unknown`
  // case directly.
  if (treatment === "none") return null;

  return (
    <p
      className="type-caption"
      style={{
        color:
          treatment === "lost"
            ? "var(--state-critical)"
            : "var(--state-warning)",
      }}
    >
      {TILE_COPY[treatment]}
    </p>
  );
}
