"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useConnectionQualityIndicator,
  useParticipants,
} from "@livekit/components-react";
import { type Participant } from "livekit-client";

import { siteUrl } from "@/lib/site";
import { CopyLinkButton } from "@/components/meetings/CopyLinkButton";
import { TILE_COPY, treatmentFor, type Quality } from "@/lib/room/connection";

import { ICONS } from "@/lib/icons";
import { displayNameOf, initialOf, isHost } from "@/lib/room/participant";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MenuItem, PopupMenu } from "@/components/shared/PopupMenu";
import { WaitingQueue } from "@/components/room/WaitingQueue";
import type { WaitingRequest } from "@/lib/hooks/useWaitingQueue";

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
  onDecide,
  deciding,
  onRequestMute,
  onRemove,
}: {
  open: boolean;
  isLocalHost: boolean;
  /** The room's own link, for C3's copy row at the top. */
  code: string;
  /** v1.5 A2's queue, polled in the room so the badge and toast work with this closed. */
  waiting: WaitingRequest[];
  onDecide: (id: string, decision: "admit" | "deny") => void;
  deciding: string | null;
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
        <WaitingQueue waiting={waiting} onDecide={onDecide} deciding={deciding} />
      )}

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
    </>
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
    /**
     * Three zones, and identity never yields — v1.4 B1.
     *
     * The row was avatar, a `min-w-0 flex-1` identity block, the device icons,
     * and then "Ask to mute" and "Remove" as `shrink-0` text buttons. Flex does
     * exactly what that asks: the fixed-width actions win and the name truncates
     * toward nothing, so the row you were about to remove someone from stopped
     * saying who they were. It was reported as a hover bug and there is no hover
     * logic in this file — it is a squeeze, and it happened whenever a host
     * looked at a row long enough to act on it.
     *
     * Identity is still the flexible zone; what changed is how much the other
     * two cost. Status is two icons and a short chip, actions are one control.
     */
    <li className="flex items-center gap-3 rounded-lg px-2 py-2">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
        aria-hidden
      >
        <span className="type-small text-secondary-foreground">
          {initialOf(name)}
        </span>
      </div>

      {/* --- identity ------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
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

      {/* --- status -------------------------------------------------------- */}
      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <ConnectionChip participant={participant} />
        {/*
          Device state, as **two icons, always** — v1.3 C3: "Two icons, because
          one cannot express 'camera off, mic on'."

          An icon was rendered only for a device that was *off*, so a row with one
          icon was ambiguous until you looked at which one it was, and a row with
          none meant everything is on — a state told entirely by absence. Now the
          pair is always there and the glyph carries the state.

          Rule 5: no hue. A muted mic is a different icon, not a red one.
        */}
        <HugeiconsIcon
          icon={ICONS[participant.isMicrophoneEnabled ? "micOn" : "micOff"].icon}
          size={16}
          strokeWidth={1.5}
          color="currentColor"
          aria-label={`${name}'s microphone is ${participant.isMicrophoneEnabled ? "on" : "off"}`}
        />
        <HugeiconsIcon
          icon={ICONS[participant.isCameraEnabled ? "cameraOn" : "cameraOff"].icon}
          size={16}
          strokeWidth={1.5}
          color="currentColor"
          aria-label={`${name}'s camera is ${participant.isCameraEnabled ? "on" : "off"}`}
        />
      </div>

      {/* --- actions ------------------------------------------------------- */}
      {showActions && (
        <RowActions
          name={name}
          canAskToMute={participant.isMicrophoneEnabled}
          onRequestMute={() => onRequestMute(participant.identity)}
          onRemove={() => setConfirmingRemove(true)}
        />
      )}

      {/*
        Removing cannot be undone from here — the person is gone and has to be
        sent the link again — so the destructive item asks rather than acts.
        `ConfirmDialog` is the same surface the leave menu's End meeting uses,
        which is B1's instruction: reuse the shape rather than grow a second
        one. It replaces an inline two-step that could not survive the move into
        a menu, because a menu closes on activation.
      */}
      {confirmingRemove && (
        <ConfirmDialog
          id={`remove-${participant.identity}`}
          title={`Remove ${name} from the meeting?`}
          body="They are disconnected straight away. They can rejoin if they still have the link, so this is not a ban."
          confirmLabel="Remove"
          pending={false}
          onConfirm={() => {
            onRemove(participant.identity);
            setConfirmingRemove(false);
          }}
          onDismiss={() => setConfirmingRemove(false)}
        />
      )}
    </li>
  );
}

/**
 * The host's two powers, behind one control — v1.4 B1.
 *
 * They were two adjacent buttons, one of them destructive, which is exactly the
 * construction §3.4 refused for Leave and End meeting: "a split puts two actions
 * inside one control at different coordinates". It refused it on a 48px bar,
 * where the targets are *larger* than these were.
 *
 * **Always rendered, never revealed on hover.** A hover-revealed action does not
 * exist for a touch device and does not exist for a keyboard user until focus
 * has already arrived, so the host on a phone had no route to Remove at all.
 *
 * `PopupMenu` rather than a second menu idiom, so the arrow keys, Escape and
 * focus return are the ones already written — and `placement="below"`, because
 * this sits in a scrolling list rather than on the control bar.
 */
function RowActions({
  name,
  canAskToMute,
  onRequestMute,
  onRemove,
}: {
  name: string;
  canAskToMute: boolean;
  onRequestMute: () => void;
  onRemove: () => void;
}) {
  return (
    <PopupMenu
      id={`row-actions-${name.replace(/\W+/g, "-")}`}
      menuLabel={`Actions for ${name}`}
      triggerLabel={`Actions for ${name}`}
      placement="below"
      // 44px, not the 40 a dense list would suggest. The room is a 44px surface
      // and the floor does not bend — the same call the control bar, the panel
      // tabs and the sharing bar already made.
      triggerClassName="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
      trigger={
        <HugeiconsIcon
          icon={ICONS.rowActions.icon}
          size={20}
          strokeWidth={1.5}
          color="currentColor"
          aria-hidden
        />
      }
    >
      {(close) => (
        <>
          {/*
            Only offered while they are unmuted. §3.8: a host can silence, never
            activate — so there is nothing to press once they are.
          */}
          {canAskToMute && (
            <MenuItem
              icon={
                <HugeiconsIcon
                  icon={ICONS.micOff.icon}
                  size={18}
                  strokeWidth={1.5}
                  color="currentColor"
                  aria-hidden
                />
              }
              title="Ask to mute"
              detail="They choose whether to accept."
              onSelect={() => {
                close();
                onRequestMute();
              }}
            />
          )}
          {canAskToMute && <hr className="mx-1 my-1.5 border-t border-border" />}
          <MenuItem
            icon={
              <HugeiconsIcon
                icon={ICONS.leave.icon}
                size={18}
                strokeWidth={1.5}
                color="currentColor"
                aria-hidden
              />
            }
            title="Remove from the meeting"
            detail="They are disconnected straight away."
            critical
            onSelect={() => {
              close();
              onRemove();
            }}
          />
        </>
      )}
    </PopupMenu>
  );
}

/**
 * §3.8 lists connection quality as a column, and §3.11 maps it to treatments in
 * Phase 8. This is the panel's half: named, never a coloured dot on its own.
 *
 * Silence means fine — §3.11: "Excellent, good → No indicator."
 */
function ConnectionChip({ participant }: { participant: Participant }) {
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

  /**
   * A chip in the row, not a line under the name — v1.4 B1.
   *
   * It was a `<p>` below the name, so "Unstable connection" wrapped and pushed
   * the row to two and three lines, which is what drove it into the device
   * icons. Inline and `shrink-0`, the row stays one line at every width and the
   * name is what gives.
   *
   * `--secondary` rather than the panel's own `--popover`: rule 4 wants hued
   * text on an opaque chip, and a chip the same colour as its surface is not a
   * chip. Both values are permitted there — `--state-critical` 4.84:1 on
   * `--secondary` is its worst permitted surface, and `--state-warning` clears
   * comfortably. Rule 5 sanctions the hue itself: connection state is one of
   * the exactly two things the chroma budget is spent on.
   */
  return (
    <span
      className="shrink-0 rounded-full bg-secondary px-2 py-0.5 type-caption"
      style={{
        color:
          treatment === "lost"
            ? "var(--state-critical)"
            : "var(--state-warning)",
      }}
    >
      {TILE_COPY[treatment]}
    </span>
  );
}
