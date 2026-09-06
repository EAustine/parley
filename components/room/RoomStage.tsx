"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  RoomAudioRenderer,
  RoomContext,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { DisconnectReason, Room, RoomEvent } from "livekit-client";

import { readDevices } from "@/lib/media/devices";
import { useControlVisibility } from "@/lib/hooks/useControlVisibility";
import { useRoomMessages } from "@/lib/hooks/useRoomMessages";
import { useRoomShortcuts } from "@/lib/hooks/useRoomShortcuts";
import { useScreenShare } from "@/lib/hooks/useScreenShare";
import { useAnnouncer } from "@/lib/hooks/useAnnouncer";
import { usePresence } from "@/lib/hooks/usePresence";
import { useRoomConnection } from "@/lib/hooks/useRoomConnection";
import { useDevices } from "@/lib/hooks/useDevices";
import { useWaitingQueue } from "@/lib/hooks/useWaitingQueue";
import { createRetryCounter, type RetryCounter } from "@/lib/room/retry-counter";
import { displayNameOf, isHost } from "@/lib/room/participant";
import { AudioBlockedPrompt } from "@/components/room/AudioBlockedPrompt";
import { ConnectionBar } from "@/components/room/ConnectionBar";
import { ConnectionFailedDialog } from "@/components/room/ConnectionFailedDialog";
import { ResumePrompt } from "@/components/room/ResumePrompt";
import { MuteRequestPrompt } from "@/components/room/MuteRequestPrompt";
import { RoomPanel } from "@/components/room/RoomPanel";
import { ReactionOverlay } from "@/components/room/ReactionOverlay";
import { ReactionSheet } from "@/components/room/ReactionSheet";
import { ReplaceShareDialog } from "@/components/room/ReplaceShareDialog";
import { ReplacedNotice } from "@/components/room/ReplacedNotice";
import { EndMeetingDialog } from "@/components/room/EndMeetingDialog";
import { ReactionPreload } from "@/components/room/ReactionPreload";
import { DeviceSettingsDialog } from "@/components/room/DeviceSettingsDialog";
import { DeviceChangePrompt } from "@/components/room/DeviceChangePrompt";
import { StartMeetingButton } from "@/components/meetings/StartMeetingButton";
import { RoomControls } from "@/components/room/RoomControls";
import { RoomGrid } from "@/components/room/RoomGrid";
import { useViewport } from "@/lib/hooks/useViewport";
import { ShortcutsDialog } from "@/components/room/ShortcutsDialog";
import { ShortcutsHint } from "@/components/room/ShortcutsHint";
import { ScreenShareStage } from "@/components/room/ScreenShareStage";
import { SharingBar } from "@/components/room/SharingBar";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/brand/Mark";

/**
 * The room itself, and the only module in the product that imports
 * `livekit-client`.
 *
 * Rule 8: this file is reached through `next/dynamic` from `RoomEntry`, so the
 * library lands in its own async chunk rather than in any route's first load.
 * `npm run check:bundle` asserts that by route rather than by grep — the
 * marker strings live in this chunk legitimately, and the rule is that they
 * appear nowhere else.
 *
 * Rule 1: `RoomContext.Provider` rather than `<LiveKitRoom>`. The hooks need a
 * room in context and nothing more; the wrapper component would additionally
 * render a div carrying their class names, which is the edge of a design
 * system we have declined. `RoomAudioRenderer` is the documented exception —
 * it renders nothing visible and manages remote `<audio>` elements correctly,
 * which is genuinely hard.
 */

type Stage =
  | { kind: "connecting" }
  | { kind: "connected" }
  /** The first connect never succeeded. Distinct from dropping out later. */
  | { kind: "failed"; reason: string }
  | { kind: "left" }
  /**
   * The host ended it — v1.3 B1. Distinct from `left`, which offers Rejoin,
   * and from `failed`, which blames the connection. Rejoining here would be
   * refused by the token endpoint anyway, so offering it would be a button
   * that exists to fail.
   */
  | { kind: "ended"; byMe: boolean; minutes: number | null };

export function RoomStage({
  code,
  token,
  serverUrl,
  micOn,
  cameraOn,
}: {
  code: string;
  token: string;
  serverUrl: string;
  /**
   * What pre-join agreed to publish — v1.4 A1, and binding.
   *
   * Props rather than another `readDevices()` call, because these are the one
   * thing in this component that must not come from `localStorage`. See the
   * publish block below for what that cost.
   */
  micOn: boolean;
  cameraOn: boolean;
}) {
  /**
   * The arrival decision, read once and then left alone — v1.4 A1.
   *
   * A ref rather than a dependency of the connect effect, and the distinction
   * is behavioural. These describe what was agreed to *on the way in*; once the
   * room is up, the control bar owns the tracks and rule 3 derives the UI from
   * their published state. Listing them as dependencies would say a change
   * should tear down the connection and rebuild it, which is what pressing
   * Unmute would then do.
   *
   * Seeded at mount, so a resume (`resumeNonce`) rebuilds the room with the
   * same consent it started with rather than re-reading anything.
   */
  const arrivedWith = useRef({ micOn, cameraOn });

  const [room, setRoom] = useState<Room | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "connecting" });
  /**
   * Bumped to rebuild the room from scratch — §12's resume, after the browser
   * closed the connection while the tab was hidden. A fresh `Room` rather than
   * a reconnect on the old one: whatever state a frozen page left behind is
   * not worth reasoning about, and the token is still in hand.
   */
  const [resumeNonce, setResumeNonce] = useState(0);
  // Created once and handed to every Room. Its identity must be stable or the
  // hook resubscribes on each render.
  const retry = useRef<RetryCounter>(undefined as unknown as RetryCounter);
  if (!retry.current) retry.current = createRetryCounter();
  // Leaving is a decision, not a failure. Without this, the disconnect the
  // Leave button causes would be indistinguishable from the connection
  // dropping, and the person who just left would be told something went wrong.
  const leaving = useRef(false);
  /**
   * The host's own end-meeting request, in flight.
   *
   * Their client is disconnected by the same `deleteRoom` as everyone else's,
   * so the reason alone cannot tell "I ended this" from "someone ended this on
   * me". A ref rather than state: it is read inside a listener registered once,
   * where a state value would be the one captured at registration.
   */
  const ending = useRef(false);
  /** When this client got in, for the duration on the ended screen. */
  const connectedAt = useRef<number | null>(null);

  useEffect(() => {
    leaving.current = false;
    ending.current = false;
    connectedAt.current = null;
    const stored = readDevices();

    retry.current.reset();

    const next = new Room({
      // Both are LiveKit's own bandwidth work and cost us nothing: adaptive
      // stream drops the resolution of tiles that are small or off-screen,
      // dynacast stops publishing layers nobody is subscribed to.
      adaptiveStream: true,
      dynacast: true,
      /**
       * §3.11 wants a visible attempt count, and this object is the only place
       * the SDK's attempt number can be read — see `lib/room/retry-counter.ts`.
       * It delegates every delay to `DefaultReconnectPolicy`; supplying it is
       * an act of observation, not of policy.
       */
      reconnectPolicy: retry.current.policy,
      /**
       * §12's iOS Safari row. The default tears the room down when the page is
       * hidden, which turns an ordinary tab switch into a dropped meeting.
       * Turning it off does not disarm everything — the SDK's `freeze`
       * listener sits outside this option's guard, so a real bfcache freeze
       * still disconnects, which is what `ResumePrompt` is for.
       */
      disconnectOnPageLeave: false,
      // Whatever pre-join settled on. Asking for a device by id here rather
      // than switching after connecting avoids acquiring the default camera
      // first, which shows as the indicator light flicking on for the wrong
      // device.
      videoCaptureDefaults: stored.cameraId
        ? { deviceId: stored.cameraId }
        : undefined,
      audioCaptureDefaults: stored.microphoneId
        ? { deviceId: stored.microphoneId }
        : undefined,
    });

    let cancelled = false;

    const onDisconnected = (reason?: DisconnectReason) => {
      if (cancelled) return;

      /**
       * `ROOM_DELETED` is the host ending it — B1.
       *
       * The server deletes the LiveKit room, and everyone still in it is
       * disconnected with this reason. Without reading it, that arrives as an
       * ordinary drop and `useRoomConnection` renders "the connection didn't
       * come back" over a meeting that ended on purpose — the same class of
       * mistake as telling someone who pressed Leave that something went
       * wrong, which is what `leaving` exists to prevent.
       *
       * The host who pressed the button gets it too, from their own request.
       */
      if (reason === DisconnectReason.ROOM_DELETED) {
        setStage({
          kind: "ended",
          byMe: ending.current,
          minutes:
            connectedAt.current === null
              ? null
              : Math.max(1, Math.round((Date.now() - connectedAt.current) / 60_000)),
        });
        return;
      }

      // Leaving is the only disconnect that unmounts the room.
      //
      // A drop used to land here too and replace the whole surface with a
      // page. §3.11 asks for a modal offering "Rejoin" and "Leave", and
      // "Leave" is meaningless once the room is already gone. So a drop is
      // left to `useRoomConnection`, which reads it from the room's own state
      // and renders the dialog over a still-mounted meeting — derived rather
      // than mirrored, which is rule 3's reasoning one surface along.
      if (leaving.current) setStage({ kind: "left" });
    };
    next.on(RoomEvent.Disconnected, onDisconnected);

    (async () => {
      try {
        await next.connect(serverUrl, token);
        if (cancelled) {
          await next.disconnect();
          return;
        }

        if (cancelled) return;
        setRoom(next);
        connectedAt.current = Date.now();
        setStage({ kind: "connected" });

        // Everything below is *not* awaited before showing the room, and that
        // ordering is the point. Connecting and publishing are different
        // things: you are in the meeting once the connection is up, and you can
        // see and hear everyone else whether or not your own camera ever comes
        // on. Gating entry on publishing means one stalled device leaves
        // someone watching "Connecting you…" with no explanation and no way
        // out — which §3.11 is explicit about never doing.
        //
        // A publish that fails surfaces through `lastCameraError` on the
        // control bar, where it belongs: next to the control that fixes it.

        /**
         * Publish exactly what pre-join handed over, and nothing else — v1.4 A1.
         *
         * This read `stored.micOn !== false` from `localStorage`, with a
         * comment explaining that "an absent preference means the person never
         * touched the toggle, and the default is on". Both halves were wrong,
         * and together they published video from people who had granted
         * nothing: `undefined !== false` is `true`, so a visitor who declined
         * at pre-join — and therefore never had a preference written — reached
         * `setCameraEnabled(true)`, and **that call is the `getUserMedia`
         * prompt**. The room asked the browser for a camera on their behalf and
         * published what came back.
         *
         * The channel was wrong as much as the comparison. `parley:devices` is
         * `localStorage`: a standing choice carried between meetings, which is
         * right for *which* camera and wrong for *whether*. Consent belongs to
         * a visit, so it travels in the `sessionStorage` handoff beside the
         * token, and `recallJoin` reads it as `=== true`.
         *
         * Both `false` is the ordinary case now, not a failure: with nothing
         * handed over these are `false`, `setCameraEnabled(false)` acquires
         * nothing, and no prompt fires on entry. §3.3: a prompt is a response
         * to an action, so the first press of Unmute or Start video is what
         * asks. This is the publish-side twin of rule 3 — the UI may not claim
         * you are muted when you are not, and nothing may publish what you did
         * not turn on.
         */
        void Promise.allSettled([
          next.localParticipant.setMicrophoneEnabled(arrivedWith.current.micOn),
          next.localParticipant.setCameraEnabled(arrivedWith.current.cameraOn),
        ]);

        // The speaker choice pre-join collected but could not apply — it needs
        // audio elements to apply to, and until now there were none.
        if (stored.speakerId) {
          void next.switchActiveDevice("audiooutput", stored.speakerId).catch(() => {
            // Firefox has no setSinkId. The call fails, the default output is
            // used, and that is a fine outcome to be quiet about.
          });
        }
      } catch (error) {
        if (cancelled) return;
        setStage({
          kind: "failed",
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    })();

    return () => {
      cancelled = true;
      next.off(RoomEvent.Disconnected, onDisconnected);
      // Releasing the camera matters more than tidiness: the indicator light
      // stays on otherwise, which people reasonably read as still being
      // watched.
      void next.disconnect();
    };
  }, [serverUrl, token, resumeNonce]);

  const leave = useCallback(() => {
    leaving.current = true;
    setStage({ kind: "left" });
    void room?.disconnect();
  }, [room]);

  /**
   * End the meeting for everyone — B1, host only.
   *
   * The client does not disconnect itself. §7's grants withhold `roomAdmin`, so
   * the server deletes the room, and this client is disconnected by the same
   * event as everyone else's — which is what keeps the ended screen a single
   * code path rather than one the host reaches a different way and which is
   * therefore never the one under test.
   *
   * `ending` is set before the request so the listener can attribute it. On
   * failure it is cleared and nothing has happened: the meeting is untouched,
   * the dialog's caller re-enables its buttons, and the room is still there.
   */
  const endMeeting = useCallback(async () => {
    ending.current = true;
    const response = await fetch(`/api/livekit/room/${code}`, {
      method: "DELETE",
    }).catch(() => null);

    if (response?.ok) return;
    ending.current = false;

    /**
     * A meeting already ended — by the webhook, or from another tab — is the
     * outcome that was wanted. Everything else leaves the room running, and the
     * caller says so rather than pretending.
     */
    if (response?.status === 409) {
      setStage({
        kind: "ended",
        byMe: true,
        minutes:
          connectedAt.current === null
            ? null
            : Math.max(1, Math.round((Date.now() - connectedAt.current) / 60_000)),
      });
      return;
    }
    throw new Error("end_failed");
  }, [code]);

  if (stage.kind === "connecting") return <Connecting />;
  if (stage.kind === "left") return <Left code={code} />;
  if (stage.kind === "ended")
    return <Ended byMe={stage.byMe} minutes={stage.minutes} />;
  // Only a first connect that never succeeded gets a page. Dropping out after
  // getting in is handled inside the room, over a surface that still exists.
  if (stage.kind === "failed") return <Failed code={code} />;
  if (!room) return <Connecting />;

  return (
    <RoomContext.Provider value={room}>
      <RoomSurface
        code={code}
        onLeave={leave}
        onEndMeeting={endMeeting}
        retry={retry.current}
        onResume={() => setResumeNonce((n) => n + 1)}
      />
      {/* Renders nothing. Manages every remote participant's audio element. */}
      <RoomAudioRenderer />
    </RoomContext.Provider>
  );
}

/** Inside the provider, so the shortcuts can reach the local participant. */
function RoomSurface({
  code,
  onLeave,
  onEndMeeting,
  retry,
  onResume,
}: {
  code: string;
  onLeave: () => void;
  onEndMeeting: () => Promise<void>;
  retry: RetryCounter;
  onResume: () => void;
}) {
  /**
   * The mobile reactions sheet — v1.4 B2.
   *
   * Held here rather than inside `RoomControls`, because the sheet is a room
   * surface: it sits above the control bar in the stage's own stacking context,
   * the way the mute prompt does, and a bar that owned it would be positioning
   * a panel outside itself.
   */
  const [reactionsOpen, setReactionsOpen] = useState(false);

  const visible = useControlVisibility();
  /**
   * One panel at a time — BUILD-PLAN v1.2 A3.
   *
   * This was two independent booleans, so both panels could be open together.
   * On desktop that is not a subtle state: both are `absolute md:right-0
   * md:w-[360px]` at `z-20`, so they occupy the same 360px column and the
   * later one in the DOM simply paints over the earlier. The room reserved
   * `md:pr-[360px]` for one of them either way, so nothing on screen said that
   * two were open, and closing the top one revealed a panel the person did not
   * remember opening.
   *
   * A single value makes the illegal state unrepresentable rather than merely
   * unlikely, which is the reason to prefer it over two booleans kept in step
   * by hand. `chatOpen` and `participantsOpen` stay as derived reads so the
   * rest of the tree is unchanged.
   */
  const [panel, setPanel] = useState<Panel | null>(null);
  const chatOpen = panel === "chat";
  const participantsOpen = panel === "participants";
  const [helpOpen, setHelpOpen] = useState(false);
  /**
   * B1: the menu is a choice, the dialog is the commitment.
   *
   * `pending` is held here rather than inside the dialog because the request it
   * describes is this component's — the dialog is told what is happening, and
   * does not have to know how to find out.
   */
  const [endOpen, setEndOpen] = useState(false);
  const [endPending, setEndPending] = useState(false);
  /** v1.3 B2: device selection mid-call, and the hot-plug prompt. */
  const [devicesOpen, setDevicesOpen] = useState(false);
  const devices = useDevices();
  const triggers = useRef<Record<Panel, HTMLElement | null>>({
    chat: null,
    participants: null,
  });
  const surface = useRef<HTMLDivElement>(null);

  const { item: announcement, announce } = useAnnouncer();
  const connection = useRoomConnection(retry, onResume, announce);
  const messages = useRoomMessages({ panelOpen: chatOpen, announce });
  usePresence({ phase: connection.phase, announce });

  const { markRead } = messages;
  const share = useScreenShare();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  // C4: the one signal the whole share layout follows — see the branch below.
  const viewport = useViewport();
  const localIsHost = isHost(localParticipant);

  /**
   * v1.5 A2's queue, polled here rather than inside the People tab.
   *
   * Two of its three requirements are about what happens while that tab is
   * *closed* — the badge carrying the waiting count, and the single toast A2
   * insists on because "a toast auto-dismisses, so a request arriving while the
   * host is talking is a request the host never sees if the toast is the only
   * notice". A badge that only updates when you are looking at the thing it is
   * telling you about is not a notification.
   *
   * Declared after `localIsHost` rather than with the other state, because it
   * needs it — and a guest polling a route that refuses them is pure noise.
   */
  const queue = useWaitingQueue({ code, isHost: localIsHost });

  const removeParticipant = useCallback(
    async (identity: string) => {
      // Host-only, and enforced on the server — §7's grants withhold
      // roomAdmin deliberately, so the client cannot do this itself.
      await fetch(
        `/api/livekit/participants/${code}?identity=${encodeURIComponent(identity)}`,
        { method: "DELETE" },
      ).catch(() => {});
    },
    [code],
  );

  useEffect(() => {
    if (chatOpen) markRead();
  }, [chatOpen, markRead]);

  const closePanel = useCallback((which: Panel) => {
    setPanel((current) => (current === which ? null : current));
    triggers.current[which]?.focus?.();
  }, []);

  /**
   * Opening the other panel replaces this one rather than stacking on it, and
   * deliberately does not restore focus to the closing panel's trigger: focus
   * belongs in the panel that just opened, which each panel claims itself on
   * `open`. Restoring is for closing, which `closePanel` still does.
   */
  const togglePanel = useCallback((which: Panel) => {
    setPanel((current) => {
      if (current === which) {
        triggers.current[which]?.focus?.();
        return null;
      }
      // Remember what opened it so Escape can hand focus back — a panel you
      // can open from the keyboard and not close from it is a trap.
      triggers.current[which] = triggerFor(`${which}-panel`);
      return which;
    });
  }, []);

  /**
   * One panel now, so one close — v1.3 C3.
   *
   * `closePanel` still takes which tab was showing, because that is what
   * decides *whose trigger* focus goes back to. Escape from the People tab
   * should return to the People button, not to whichever one opened the panel
   * three tab-switches ago.
   */
  const closeCurrent = useCallback(
    () => closePanel(panel ?? "chat"),
    [closePanel, panel],
  );
  /**
   * Switching tab is not opening a panel: the surface is already there, so
   * there is no trigger to remember and no focus to claim. `RoomPanel` moves
   * focus to the newly selected tab itself.
   */
  const selectTab = useCallback(
    (next: Panel) => setPanel(next),
    [],
  );
  const toggleChat = useCallback(() => togglePanel("chat"), [togglePanel]);
  const toggleParticipants = useCallback(
    () => togglePanel("participants"),
    [togglePanel],
  );

  /**
   * Where a reaction rises from, as percentages of the room.
   *
   * Read from the DOM rather than threaded down from the grid: the grid
   * already knows its own layout, and passing sixteen measured rectangles up
   * through props so an overlay can put them back where they were is a lot of
   * plumbing to arrive where `getBoundingClientRect` already is.
   *
   * §3.6: someone who did not fit in the grid anchors to the overflow
   * indicator instead, and someone who is on another page of a mobile grid has
   * no element at all — the centre is the honest fallback there.
   */
  const anchorFor = useCallback((identity: string) => {
    const root = surface.current;
    const fallback = { left: 50, bottom: 30, rise: 120 };
    if (!root) return fallback;

    const tile =
      root.querySelector<HTMLElement>(`[data-participant="${CSS.escape(identity)}"]`) ??
      root.querySelector<HTMLElement>("[data-overflow]");
    if (!tile) return fallback;

    const room = root.getBoundingClientRect();
    const box = tile.getBoundingClientRect();
    return {
      left: ((box.left + box.width / 2 - room.left) / room.width) * 100,
      // Above the name label rather than on top of it — §3.6 is explicit that
      // reactions never occlude the label or the mic indicator.
      bottom: ((room.bottom - box.bottom + LABEL_CLEARANCE_PX) / room.height) * 100,
      // v1.2 E1: "travel upward roughly 40% of the tile height". A proportion,
      // not the fixed 180px it was — that was most of a filmstrip tile and a
      // twitch on a full-area one.
      rise: box.height * 0.4,
    };
  }, []);

  return (
    <div
      ref={surface}
      className="relative h-dvh w-full overflow-clip bg-background p-3 pb-[var(--parley-controls-h)]"
    >
      <Shortcuts onToggleChat={toggleChat} onShowHelp={() => setHelpOpen(true)} />

      {/* First focusable thing in the room — §9's discoverability hint. */}
      <ShortcutsHint onOpen={() => setHelpOpen(true)} />

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <div
        className={[
          // A flex column, so C4's sharing bar can take its own row above the
          // content instead of being laid over it. `gap-2` is the design's 8px
          // `.stagearea` gutter.
          "flex h-full flex-col gap-2",
          chatOpen || participantsOpen ? "md:pr-[360px]" : "",
          /*
           * v1.2 F1: "with the video area shrinking above rather than being
           * covered".
           *
           * Measured before this: at one participant on a 375x812 phone the
           * open sheet's top edge sat 138px above the tile's bottom edge — it
           * covered 70% of the video, and the tile did not move, because the
           * stage is `h-full` in a padded box and the sheet is `absolute`.
           * Nothing in the layout could react to it.
           *
           * Reserving the sheet's height below `md` is what makes the stage
           * react. The sheet stays absolute — restructuring the room into a
           * flex column would change the desktop drawer too, and desktop is
           * finished and asserted.
           */
          chatOpen || participantsOpen ? "max-md:pb-[55dvh]" : "",
          /*
           * No `pt-16` any more — v1.3 C4.
           *
           * The bar used to be `absolute top-0`, so the stage padded itself by
           * a hard-coded 64px to avoid being covered: a number standing in for
           * another element's height, which is the shape that put Send under
           * the control bar in v1.2. In flow it simply takes the height it
           * takes.
           */
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          /*
           * 180ms, matching the sheet's own entrance. The grid resizing
           * instantly while the sheet slides in reads as two unrelated events.
           *
           * One property on one element — the container, not the tiles — so
           * this is the reflow rule's permitted shape rather than sixteen
           * layout animations. And it is deliberately *not* routed through the
           * FLIP hook: opening a panel is your own action, and PRD §4.4's test
           * for motion is whether it tells you something you do not already
           * know. A join does; your own tap does not.
           */
          // §3.11: "Overlay over the dimmed, frozen room — not a full-page
          // unmount." The grid keeps its last frame because nothing detached;
          // dimming it says the meeting is not live without pretending you
          // were never in one. The overlay carries the explanation, so this
          // layer does not need to stay readable.
          opacity: connection.phase === "failed" ? 0.4 : 1,
          // One declaration, two properties — a second `transition` key would
          // silently replace the first, which is what the first draft did.
          transition:
            "padding-bottom 180ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {/*
          §3.7: persistent, and deliberately not tied to the auto-hiding control
          bar — what it says is that other people can see your screen.

          C4 moves it into the stage's own column, above the content, which is
          where the design puts it: `.stagearea` is a flex column and
          `.sharebar` is a `flex:none` child of it. It was an absolute band over
          the top of the room.
        */}
        {share.sharing && <SharingBar onStop={share.stop} />}

        {/*
          §3.11's local-user bar, in the same column as the sharing bar — v1.4
          A2. Both can be true at once and neither is optional, and in flow they
          stack without either knowing the other's height.
        */}
        {connection.phase !== "healthy" && connection.phase !== "failed" && (
          <ConnectionBar
            phase={connection.phase}
            attempts={connection.attempts}
            code={code}
            displayName={displayNameOf(localParticipant)}
          />
        )}

        <div className="min-h-0 flex-1">
        {share.presenter && !share.presenter.isLocal ? (
          // §3.4: shared content takes the main area, participants collapse to
          // a filmstrip — right edge on desktop, a top strip on mobile.
          /*
           * v1.3 C4: **one signal for the whole share layout.**
           *
           * The stack direction was a CSS `md:flex-row` (768px, any
           * orientation) while the filmstrip's orientation *and* its capacity
           * came from `useViewport` — `(max-width: 767px) and (orientation:
           * portrait)`. The two disagreed for a real window: at 700px wide in
           * landscape, `useViewport` says desktop and renders a 220px vertical
           * column, while `md:` is false and stacks it under the content. A
           * vertical rail laid out horizontally.
           *
           * The design drives all of it from one `max-width: 900px` query. The
           * *number* is a mockup convenience — a static HTML page cannot test
           * orientation — and §3.4's own table is headed "Desktop | Mobile
           * **portrait**", so the signal the build already had is the faithful
           * one. What was missing was using it in both places.
           */
          <div
            className={`flex h-full gap-2 ${
              viewport === "mobile" ? "flex-col" : "flex-row"
            }`}
          >
            {/*
              §9: "The video grid carries a heading and a participant count, so
              the shape of the room is available without seeing it." `RoomGrid`
              renders that heading, and its filmstrip branch renders the strip's
              own label *instead of* it — so while anyone shared, every viewer's
              room lost its heading entirely. It is carried here instead, where
              it survives the layout switch.
            */}
            <h1 className="sr-only">
              Meeting, {participants.length}{" "}
              {participants.length === 1 ? "participant" : "participants"}
            </h1>
            <div className={`min-h-0 flex-1 ${viewport === "mobile" ? "order-last" : "order-first"}`}>
              <ScreenShareStage
                presenter={share.presenter}
                track={share.remoteTrack}
              />
            </div>
            <RoomGrid filmstrip />
          </div>
        ) : (
          /*
           * v1.2 B1: **the sharer does not need to see their own screen; they
           * need to see the people.** So sharing takes the same branch as not
           * sharing — the ordinary grid at full size — and the only thing that
           * changes is the persistent bar above it.
           *
           * §3.7's "the sharer's own view of the shared content is suppressed"
           * is satisfied more completely by this than by the region that used
           * to render in its place carrying a sentence about being empty.
           */
          <RoomGrid />
        )}
        </div>
      </div>

      {/*
        §3.11's last row. The room stays mounted underneath — see the
        component, and `onDisconnected` above.

        Suppressed when the resume prompt is up, and the precedence matters.
        Both states are the same underlying `disconnected`, so both would
        otherwise render at once — and the dialog's copy ("Parley kept trying
        and the connection didn't come back") is simply false when the cause
        was the browser closing a hidden tab. Nothing was tried. The more
        specific explanation wins.
      */}
      {connection.phase === "failed" && !connection.resumeNeeded && (
        <ConnectionFailedDialog
          code={code}
          displayName={displayNameOf(localParticipant)}
        />
      )}

      {/* §12. Almost never seen, because joining is a real gesture. */}
      {connection.audioBlocked && (
        <AudioBlockedPrompt onEnable={connection.allowAudio} />
      )}

      {/* §12's iOS row: the tab came back and the connection did not. */}
      {connection.resumeNeeded && <ResumePrompt onResume={connection.resume} />}

      {share.replacing && (
        <ReplaceShareDialog
          presenter={displayNameOf(share.replacing)}
          onConfirm={() => void share.confirmReplace()}
          onCancel={share.cancelReplace}
        />
      )}

      {share.replacedBy && (
        <ReplacedNotice by={share.replacedBy} onDismiss={share.dismissReplaced} />
      )}

      {/*
        v1.4 B2: the six emoji on a phone, out of the overflow menu.

        **Not while a mute request stands**, and that is A2's rule applied to a
        pair this pass created. `MuteRequestPrompt` anchors to the same
        `bottom: calc(var(--parley-controls-h) + 0.5rem)` at the same `z-20`, so
        two of them on screen is the connection bar over the tile's pill again,
        one surface along — found by driving the design file, where the prompt
        intercepted a press meant for an emoji.

        Closing rather than offsetting, deliberately. An offset would be a
        number tuned to the prompt's height, which is exactly the `top: 3.5rem`
        A2 just retired; and of the two, the request is the one that needs an
        answer. The sheet is one press away again afterwards.
      */}
      <ReactionSheet
        open={reactionsOpen && !messages.muteRequest}
        onReact={messages.sendReaction}
        onClose={() => setReactionsOpen(false)}
      />

      {messages.muteRequest && (
        <MuteRequestPrompt
          from={messages.muteRequest.from}
          onMute={() => {
            void localParticipant.setMicrophoneEnabled(false);
            messages.dismissMuteRequest();
          }}
          onDismiss={messages.dismissMuteRequest}
        />
      )}

      {/* v1.3 C6. Fetches the six reaction images once the connection is
          healthy — not at room entry, which is the join path. */}
      <ReactionPreload ready={connection.phase === "healthy"} />

      <ReactionOverlay reactions={messages.reactions} anchorFor={anchorFor} />

      <RoomControls
        waitingCount={queue.waiting.length}
        visible={visible}
        unread={messages.unread}
        chatOpen={chatOpen}
        participantsOpen={participantsOpen}
        participantCount={participants.length}
        share={{
          supported: share.supported,
          sharing: share.sharing,
          toggle: () => void (share.sharing ? share.stop() : share.start()),
        }}
        onToggleChat={toggleChat}
        onToggleParticipants={toggleParticipants}
        onReact={messages.sendReaction}
        onOpenReactions={() => setReactionsOpen(true)}
        onLeave={onLeave}
        isHost={localIsHost}
        onEnd={() => setEndOpen(true)}
        onOpenDevices={() => setDevicesOpen(true)}
        onOpenShortcuts={() => setHelpOpen(true)}
      />

      {devicesOpen && (
        <DeviceSettingsDialog
          devices={devices}
          onClose={() => setDevicesOpen(false)}
        />
      )}

      {/* B2: "Do not switch silently." Non-modal, so the meeting continues
          behind it and ignoring it is a valid answer. */}
      {devices.newDevice && (
        <DeviceChangePrompt
          label={devices.newDevice.label}
          onSwitch={() => void devices.acceptNewDevice()}
          onDismiss={devices.dismissNewDevice}
        />
      )}

      {endOpen && (
        <EndMeetingDialog
          pending={endPending}
          onCancel={() => {
            if (endPending) return;
            setEndOpen(false);
          }}
          onConfirm={() => {
            setEndPending(true);
            void onEndMeeting()
              .catch(() => {
                // Nothing happened: the meeting is untouched and the room is
                // still there. Say so and let them try again, rather than
                // closing on a failure that would look like success.
                toast.error("The meeting couldn't be ended. Try again.");
              })
              .finally(() => setEndPending(false));
          }}
        />
      )}

      {/*
        Panels after the controls, which is both §3.4's stated tab order —
        "controls → chat panel → participant panel → back to controls" — and
        the floor's "order the panel in the DOM adjacent to its trigger so
        tabbing out lands somewhere sensible".

        They rendered before the controls until now, so a Tab traverse met the
        panels first and, worse, opening participants stranded focus on a
        trigger *downstream* of the panel it opened: tabbing forward never
        entered it. Both panels are absolutely positioned, so this changes the
        order the keyboard sees and nothing the eye does.
      */}
      {/*
        One panel, two tabs — C3. The wrappers stay because the control bar's
        `aria-controls` points at them and `triggerFor` finds the bar button by
        the same id; the *panel* is one surface inside.
      */}
      <div id="chat-panel" />
      <div id="participants-panel" />

      <RoomPanel
        waiting={queue.waiting}
        blocked={queue.blocked}
        onDecide={queue.decide}
        deciding={queue.deciding}
        onLetBackIn={queue.letBackIn}
        tab={panel}
        log={messages.log}
        cooldown={messages.chatCooldown}
        code={code}
        isLocalHost={localIsHost}
        onTab={selectTab}
        onClose={closeCurrent}
        onSend={messages.sendChat}
        onRequestMute={messages.requestMute}
        onRemove={removeParticipant}
      />

      {share.error && (
        <p
          role="status"
          className="absolute inset-x-0 bottom-24 z-[var(--layer-chrome)] text-center type-small text-[var(--state-critical)]"
        >
          {share.error}
        </p>
      )}

      {/* One polite live region for the whole room. §9 and BUILD-PLAN's Phase 9
          note: Next already mounts an assertive one, and a second would
          interrupt rather than wait its turn. */}
      {/*
        One polite region for the room, and it never remounts.

        The keyed child is load-bearing rather than tidy: a live region
        inserted into the document with content already in it is not announced
        by most screen readers, so the <p> is stable and only its child
        changes. And the child is keyed by id rather than by text, because an
        identical repeat used to be a React bail-out that never touched the DOM
        — two messages from the same sender announced once.
      */}
      <p role="status" aria-live="polite" data-live-region className="sr-only">
        {announcement && <span key={announcement.id}>{announcement.text}</span>}
      </p>
      <span className="sr-only">Meeting code {code}</span>
    </div>
  );
}

/**
 * What should get focus back when a panel closes.
 *
 * `document.activeElement` alone is wrong for the keyboard path: opening chat
 * with ⌘⌥C leaves focus on `<body>`, and `body.focus()` is a no-op — so
 * Escape closed the panel and dropped focus to nowhere, which is worse than
 * not restoring it at all. The existing test only ever exercised the click
 * path, where `activeElement` really is the button.
 *
 * So: the focused element if it is genuinely one, and otherwise the control
 * that owns this panel, found by the `aria-controls` it already declares.
 */
/** §3.4's two side panels. The ids are `${Panel}-panel` in the DOM. */
type Panel = "chat" | "participants";

function triggerFor(panelId: string): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && typeof active.focus === "function") {
    return active;
  }
  return document.querySelector<HTMLElement>(`[aria-controls="${panelId}"]`);
}

/** The gap that keeps a rising reaction clear of the name label beneath it. */
const LABEL_CLEARANCE_PX = 40;

/**
 * Renders nothing; exists so that subscribing to mute state re-renders a leaf
 * rather than the whole room. The handler has to see current state — a stale
 * closure here would toggle the mic to where it already was.
 */
function Shortcuts({
  onToggleChat,
  onShowHelp,
}: {
  onToggleChat: () => void;
  onShowHelp: () => void;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();
  useRoomShortcuts({
    onToggleMic: () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled),
    onToggleCamera: () => localParticipant.setCameraEnabled(!isCameraEnabled),
    onToggleChat,
    onShowHelp,
  });
  return null;
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16 text-center">
      {children}
    </div>
  );
}

function Connecting() {
  return (
    <Centred>
      <p className="type-body text-muted-foreground" role="status" aria-live="polite">
        Connecting you…
      </p>
    </Centred>
  );
}

function Left({ code }: { code: string }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6">
        <Mark size={34} aria-hidden />
        <div className="space-y-2">
          <h1 className="type-h1">You left the meeting</h1>
          <p className="type-body text-balance text-muted-foreground">
            It carries on without you. The link still works if you want to come
            back.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button size="touch" asChild className="w-full">
          <Link href={`/j/${code}`}>Rejoin</Link>
        </Button>
        <Button size="touch" asChild variant="outline" className="w-full">
          <Link href="/dashboard">Back to meetings</Link>
        </Button>
      </div>
    </Centred>
  );
}

/**
 * What everyone lands on when the host ends it — B1, screen 5 of
 * `design/02-room.html`.
 *
 * **No Rejoin.** The token endpoint refuses `ended`, so the button would exist
 * only to fail — and `CLAUDE.md` forbids shipping a working control that lands
 * somewhere broken. `Left` offers Rejoin because leaving is reversible; this
 * is not, which is the whole reason the two states are separate.
 *
 * **The duration is this viewer's, and says so.** The design reads "Design
 * review ran for 42 minutes", which needs the meeting's title and its real
 * start — neither of which the room has. §3.2 keeps the anonymous resolver to
 * six columns on purpose, and widening it so an ended screen can print a
 * number is not a trade worth making. What this client can measure honestly is
 * how long *it* was in the meeting, so that is what it claims.
 */
function Ended({ byMe, minutes }: { byMe: boolean; minutes: number | null }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6">
        <Mark size={34} aria-hidden />
        <div className="space-y-2">
          {/* The host who pressed the button knows who did it. Telling them
              "the host ended the meeting" would read as someone else having
              done it. */}
          <h1 className="type-h1">
            {byMe ? "You ended the meeting" : "The host ended the meeting"}
          </h1>
          <p className="type-body text-balance text-muted-foreground">
            {minutes === null
              ? "The link no longer works."
              : `You were in it for ${minutes} minute${minutes === 1 ? "" : "s"}. The link no longer works.`}
          </p>
        </div>
      </div>
      {/*
        The design puts two buttons here. Both are only offered to the host who
        ended it, because "Start a new meeting" creates one — and creating a
        meeting needs an account, so for a guest it is a button that exists to
        return 401. They get the one action that works.

        `StartMeetingButton` rather than a link to `/dashboard` labelled as if
        it starts something: the label says what happens, which is the copy
        rule, and it is the same control the dashboard uses.
      */}
      <div className="flex w-full flex-col gap-2">
        {/*
          Back to meetings leads, and starting a new one follows — the design's
          order. The meeting just ended; the likely next move is the list of the
          rest, not another meeting immediately.
        */}
        <Button size="touch" asChild className="w-full">
          <Link href="/dashboard">Back to meetings</Link>
        </Button>
        {byMe && (
          /*
            Only for the host who ended it. Creating a meeting needs an account,
            so for a guest this is a button that exists to return 401 — they get
            the one action that works.

            `StartMeetingButton` rather than a link to `/dashboard` wearing the
            label: the name says what happens, which is the copy rule, and it is
            the same control the dashboard uses. It has to be *told* to fill the
            column — it renders at its intrinsic width and default height
            otherwise, which is why it came out shorter than the button beneath
            it.
          */
          <StartMeetingButton
            size="touch"
            variant="outline"
            className="w-full"
            label="Start a new meeting"
          />
        )}
      </div>
    </Centred>
  );
}

function Failed({ code }: { code: string }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6">
        <Mark size={34} aria-hidden />
        <div className="space-y-2">
          <h1 className="type-h1">The connection dropped</h1>
          <p className="type-body text-balance text-muted-foreground">
            Parley lost its link to the meeting. Check your network, then join
            again.
          </p>
        </div>
      </div>
      <Button size="touch" asChild className="w-full">
        <Link href={`/j/${code}`}>Join again</Link>
      </Button>
    </Centred>
  );
}
