"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  RoomAudioRenderer,
  RoomContext,
  useLocalParticipant,
  useParticipants,
} from "@livekit/components-react";
import { Room, RoomEvent } from "livekit-client";

import { readDevices } from "@/lib/media/devices";
import { useControlVisibility } from "@/lib/hooks/useControlVisibility";
import { useRoomMessages } from "@/lib/hooks/useRoomMessages";
import { useRoomShortcuts } from "@/lib/hooks/useRoomShortcuts";
import { useScreenShare } from "@/lib/hooks/useScreenShare";
import { useAnnouncer } from "@/lib/hooks/useAnnouncer";
import { usePresence } from "@/lib/hooks/usePresence";
import { useRoomConnection } from "@/lib/hooks/useRoomConnection";
import { createRetryCounter, type RetryCounter } from "@/lib/room/retry-counter";
import { displayNameOf, isHost } from "@/lib/room/participant";
import { AudioBlockedPrompt } from "@/components/room/AudioBlockedPrompt";
import { ConnectionBar } from "@/components/room/ConnectionBar";
import { ConnectionFailedDialog } from "@/components/room/ConnectionFailedDialog";
import { ResumePrompt } from "@/components/room/ResumePrompt";
import { ChatPanel } from "@/components/room/ChatPanel";
import { MuteRequestPrompt } from "@/components/room/MuteRequestPrompt";
import { ParticipantsPanel } from "@/components/room/ParticipantsPanel";
import { ReactionOverlay } from "@/components/room/ReactionOverlay";
import { ReplaceShareDialog } from "@/components/room/ReplaceShareDialog";
import { ReplacedNotice } from "@/components/room/ReplacedNotice";
import { RoomControls } from "@/components/room/RoomControls";
import { RoomGrid } from "@/components/room/RoomGrid";
import { ShortcutsDialog } from "@/components/room/ShortcutsDialog";
import { ShortcutsHint } from "@/components/room/ShortcutsHint";
import { ScreenShareStage } from "@/components/room/ScreenShareStage";
import { SharingBar } from "@/components/room/SharingBar";
import { Button } from "@/components/ui/button";
import { Lockup } from "@/components/brand/Lockup";

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
  | { kind: "left" };

export function RoomStage({
  code,
  token,
  serverUrl,
}: {
  code: string;
  token: string;
  serverUrl: string;
}) {
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

  useEffect(() => {
    leaving.current = false;
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

    const onDisconnected = () => {
      if (cancelled) return;
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

        // Publish only what pre-join left switched on. `!== false` rather than
        // a truthiness test: an absent preference means the person never
        // touched the toggle, and the default is on.
        void Promise.allSettled([
          next.localParticipant.setMicrophoneEnabled(stored.micOn !== false),
          next.localParticipant.setCameraEnabled(stored.cameraOn !== false),
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

  if (stage.kind === "connecting") return <Connecting />;
  if (stage.kind === "left") return <Left code={code} />;
  // Only a first connect that never succeeded gets a page. Dropping out after
  // getting in is handled inside the room, over a surface that still exists.
  if (stage.kind === "failed") return <Failed code={code} />;
  if (!room) return <Connecting />;

  return (
    <RoomContext.Provider value={room}>
      <RoomSurface
        code={code}
        onLeave={leave}
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
  retry,
  onResume,
}: {
  code: string;
  onLeave: () => void;
  retry: RetryCounter;
  onResume: () => void;
}) {
  const visible = useControlVisibility();
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const chatTrigger = useRef<HTMLElement | null>(null);
  const participantsTrigger = useRef<HTMLElement | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  const { item: announcement, announce } = useAnnouncer();
  const connection = useRoomConnection(retry, onResume, announce);
  const messages = useRoomMessages({ panelOpen: chatOpen, announce });
  usePresence({ phase: connection.phase, announce });

  const { markRead } = messages;
  const share = useScreenShare();
  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const localIsHost = isHost(localParticipant);

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

  const closeChat = useCallback(() => {
    setChatOpen(false);
    chatTrigger.current?.focus?.();
  }, []);

  const closeParticipants = useCallback(() => {
    setParticipantsOpen(false);
    participantsTrigger.current?.focus?.();
  }, []);

  const toggleParticipants = useCallback(() => {
    setParticipantsOpen((open) => {
      if (open) {
        participantsTrigger.current?.focus?.();
        return false;
      }
      participantsTrigger.current = triggerFor("participants-panel");
      return true;
    });
  }, []);

  const toggleChat = useCallback(() => {
    setChatOpen((open) => {
      if (open) {
        chatTrigger.current?.focus?.();
        return false;
      }
      // Remember what opened it so Escape can hand focus back — a panel you
      // can open from the keyboard and not close from it is a trap.
      chatTrigger.current = triggerFor("chat-panel");
      return true;
    });
  }, []);

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
    const fallback = { left: 50, bottom: 30 };
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
    };
  }, []);

  return (
    <div
      ref={surface}
      className="relative h-dvh w-full overflow-hidden bg-background p-3 pb-24"
    >
      <Shortcuts onToggleChat={toggleChat} onShowHelp={() => setHelpOpen(true)} />

      {/* First focusable thing in the room — §9's discoverability hint. */}
      <ShortcutsHint onOpen={() => setHelpOpen(true)} />

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <div
        className={
          chatOpen || participantsOpen ? "h-full md:pr-[360px]" : "h-full"
        }
        style={{
          // §3.11: "Overlay over the dimmed, frozen room — not a full-page
          // unmount." The grid keeps its last frame because nothing detached;
          // dimming it says the meeting is not live without pretending you
          // were never in one. The overlay carries the explanation, so this
          // layer does not need to stay readable.
          opacity: connection.phase === "failed" ? 0.4 : 1,
          transition: "opacity 200ms cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {share.presenter ? (
          // §3.4: shared content takes the main area, participants collapse to
          // a filmstrip — right edge on desktop, a top strip on mobile.
          <div className="flex h-full flex-col gap-3 md:flex-row">
            <div className="min-h-0 flex-1 order-last md:order-first">
              <ScreenShareStage
                presenter={share.presenter}
                track={share.remoteTrack}
                isLocal={share.presenter.isLocal}
              />
            </div>
            <RoomGrid filmstrip />
          </div>
        ) : (
          <RoomGrid />
        )}
      </div>

      {/* §3.7: persistent, and deliberately not tied to the auto-hiding
          control bar — what it says is that other people can see your screen. */}
      {share.sharing && <SharingBar onStop={share.stop} />}

      {/* §3.11's local-user bar. Sits below §3.7's sharing bar rather than
          displacing it: both can be true at once, and neither is optional. */}
      {connection.phase !== "healthy" && connection.phase !== "failed" && (
        <ConnectionBar
          phase={connection.phase}
          attempts={connection.attempts}
          code={code}
          displayName={displayNameOf(localParticipant)}
        />
      )}

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

      <ReactionOverlay reactions={messages.reactions} anchorFor={anchorFor} />

      <RoomControls
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
        onLeave={onLeave}
      />

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
      <div id="chat-panel">
        <ChatPanel
          open={chatOpen}
          log={messages.log}
          cooldown={messages.chatCooldown}
          onClose={closeChat}
          onSend={messages.sendChat}
        />
      </div>

      <div id="participants-panel">
        <ParticipantsPanel
          open={participantsOpen}
          isLocalHost={localIsHost}
          onClose={closeParticipants}
          onRequestMute={messages.requestMute}
          onRemove={removeParticipant}
        />
      </div>

      {share.error && (
        <p
          role="status"
          className="absolute inset-x-0 bottom-24 z-30 text-center type-small text-[var(--state-critical)]"
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
        <Lockup variant="stacked" markSize={40} />
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

function Failed({ code }: { code: string }) {
  return (
    <Centred>
      <div className="flex flex-col items-center gap-6">
        <Lockup variant="stacked" markSize={40} />
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
