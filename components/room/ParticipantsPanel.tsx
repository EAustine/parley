"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useConnectionQualityIndicator,
  useParticipants,
} from "@livekit/components-react";
import { type Participant } from "livekit-client";

import { TILE_COPY, treatmentFor, type Quality } from "@/lib/room/connection";

import { ICONS } from "@/lib/icons";
import { displayNameOf, initialOf, isHost } from "@/lib/room/participant";
import { SheetHandle } from "@/components/room/SheetHandle";
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
  const close = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);

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
    <aside
      ref={sheet}
      aria-label="Participants"
      hidden={!open}
      // Surface, not content: `--popover` is the plane every other floating
      // chrome surface in the room already sits on — the mute request, the
      // replaced notice, the connection bar and pill, the shortcuts hint. This
      // was `bg-card`, which is the *tile* surface (`Tile`, `ScreenShareStage`),
      // so the panel was on the wrong plane in the system.
      //
      // It is not what makes the boundary. No fill in the set can: the whole
      // surface ramp lives inside 0.2 of a contrast point against the ground —
      // card 1.09:1, popover 1.15:1, and even `--secondary`, the lightest
      // surface token, only 1.29:1. That is what happens when every fill sits
      // within 22 hex values of `--background`.
      //
      // The boundary is the 1px `--boundary` edge below, at 3.93:1 against
      // the ground and 3.41:1 against this fill — the only value in the set
      // that reads as an edge. `--border` would be 1.12:1 against it, invisible.
      //
      // Not a shadow. Shadows carry elevation on light grounds by darkening
      // what is beneath, and on `#0E1013` there is nothing meaningfully darker
      // to go to; dark interfaces carry elevation with a lighter fill and a
      // visible edge.
      className={`parley-panel ${open ? "flex" : "hidden"} absolute inset-x-0 bottom-0 top-auto z-20 h-[55dvh] flex-col rounded-t-xl border-t bg-popover pb-[var(--parley-controls-h)] md:pb-0 md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[360px] md:rounded-t-none md:border-l md:border-t-0`}
      style={{ borderColor: "var(--boundary)" }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <SheetHandle onDismiss={onClose} sheet={sheet} />

      <header
        className="flex shrink-0 items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--boundary)" }}
      >
        <h2 className="type-h2">
          Participants{" "}
          <span className="type-data tabular-nums text-muted-foreground">
            {participants.length}
          </span>
        </h2>
        <button
          ref={close}
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
          <span className="type-body truncate">{name}</span>
          {/*
            v1.2 C2: "(you)" in `--muted-foreground` rather than at the same
            weight as the name. It was inside the name span, so it read as part
            of what someone is called.
          */}
          {participant.isLocal && (
            <span className="type-body shrink-0 text-muted-foreground">(you)</span>
          )}
          {/*
            A small outlined chip, not a word. `--boundary` is the room
            ground's boundary token and belongs to no other surface, so the
            chip takes `--border` — 1.29:1 against the panel, which is a
            boundary rather than a divider and is what the token is for. The
            label itself carries the contrast at `--muted-foreground`.
          */}
          {isHost(participant) && (
            <span className="type-caption shrink-0 rounded-full border border-border px-2 py-0.5 text-muted-foreground">
              Host
            </span>
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
              size="touch"
              variant="ghost"
              onClick={() => onRequestMute(participant.identity)}
            >
              Ask to mute
            </Button>
          )}
          {confirmingRemove ? (
            <>
              <Button
                size="touch"
                variant="ghost"
                className="text-[var(--state-critical)]"
                onClick={() => {
                  onRemove(participant.identity);
                  setConfirmingRemove(false);
                }}
              >
                Confirm
              </Button>
              <Button size="touch" variant="ghost" onClick={() => setConfirmingRemove(false)}>
                Keep
              </Button>
            </>
          ) : (
            // Two steps, because it cannot be undone from here — the person is
            // gone and has to be sent the link again.
            <Button
              size="touch"
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
