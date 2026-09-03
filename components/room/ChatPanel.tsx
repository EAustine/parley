"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { isPinnedToBottom, startsGroup, type LogEntry } from "@/lib/room/chat";
import { CHAT_COUNTER_AT, CHAT_MAX_LENGTH } from "@/lib/room/messages";
import { ChatMessage } from "@/components/room/ChatMessage";
import { Button } from "@/components/ui/button";

/**
 * §3.5's panel: a 360px drawer on desktop, a bottom sheet on mobile.
 *
 * Built here rather than from shadcn's `Sheet` because this one has to stay
 * open while the room behind it stays usable — §3.4 requires the controls to
 * remain reachable with a panel open. `Sheet` is a modal dialog: it traps
 * focus, marks the rest of the page `aria-hidden`, and blocks the pointer,
 * which is the correct behaviour for a dialog and the wrong behaviour for a
 * side panel in a live meeting.
 *
 * Focus trapping and the full tab-order pass are Phase 9's. Escape closing and
 * returning focus to the trigger is here, because a panel you cannot close
 * from the keyboard is not a partial implementation, it is a trap.
 */
export function ChatPanel({
  open,
  log,
  cooldown,
  onClose,
  onSend,
}: {
  open: boolean;
  log: LogEntry[];
  /** Seconds until sending is allowed again, or null — §3.5. */
  cooldown: number | null;
  onClose: () => void;
  onSend: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [hasNew, setHasNew] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pinned = useRef(true);

  // Focus the composer on open. Someone who opened the chat means to type.
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
    if (open) composer.current?.focus({ preventScroll: true });
  }, [open]);

  // §3.5: pinned to the bottom unless the reader has scrolled up.
  //
  // `useLayoutEffect` rather than `useEffect`: the scroll has to happen in the
  // same frame the message is painted, or the list visibly jumps.
  useLayoutEffect(() => {
    const view = scroller.current;
    if (!view) return;
    if (pinned.current) {
      view.scrollTop = view.scrollHeight;
      setHasNew(false);
    } else {
      setHasNew(true);
    }
  }, [log.length]);

  const onScroll = () => {
    const view = scroller.current;
    if (!view) return;
    pinned.current = isPinnedToBottom(view);
    if (pinned.current) setHasNew(false);
  };

  const jumpToLatest = () => {
    const view = scroller.current;
    if (!view) return;
    view.scrollTop = view.scrollHeight;
    pinned.current = true;
    setHasNew(false);
  };

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onSend(body);
    setDraft("");
    // Sending always returns the reader to the bottom — you meant to be part
    // of the conversation you just joined.
    pinned.current = true;
  };

  const remaining = CHAT_MAX_LENGTH - draft.length;

  return (
    <aside
      // Not `role="dialog"`: this is a complementary region beside the room,
      // and the room stays live behind it.
      aria-label="Meeting chat"
      hidden={!open}
      // `hidden` alone does the hiding. `app/globals.css` declares
      // `[hidden] { display: none !important }` in our own base layer, so this
      // does not depend on Tailwind's preflight happening to do the same — see
      // CLAUDE.md's testing rules, which is where that lesson came from.
      // `pb-24` on mobile: the control bar is `z-30` and floats over this
      // sheet — it has to, because §3.4 requires mute to stay reachable with a
      // panel open, and mute is a privacy control. Without the inset the
      // composer sat underneath it.
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
      // The boundary is the 1px `--tile-border` edge below, at 3.33:1 against
      // the ground and 2.89:1 against this fill — the only value in the set
      // that reads as an edge. `--border` would be 1.12:1 against it, invisible.
      //
      // Not a shadow. Shadows carry elevation on light grounds by darkening
      // what is beneath, and on `#0E1013` there is nothing meaningfully darker
      // to go to; dark interfaces carry elevation with a lighter fill and a
      // visible edge.
      className={`parley-panel ${open ? "flex" : "hidden"} absolute inset-x-0 bottom-0 top-auto z-20 h-[60dvh] flex-col rounded-t-xl border-t bg-popover pb-24 md:pb-0 md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[360px] md:rounded-t-none md:border-l md:border-t-0`}
      style={{ borderColor: "var(--tile-border)" }}
      onKeyDown={(event) => {
        // Escape closes from anywhere inside, including mid-draft.
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--tile-border)" }}>
        <h2 className="type-h2">Chat</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
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

      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-2"
      >
        {log.length === 0 ? (
          // §3.5 asks for the ephemerality to be said here rather than hidden
          // in a settings page nobody opens.
          <p className="type-small mt-8 text-balance text-center text-muted-foreground">
            Messages are only visible to people in the meeting, and disappear
            when it ends.
          </p>
        ) : (
          log.map((entry, i) => (
            <ChatMessage
              key={entry.id}
              entry={entry}
              startsGroup={startsGroup(entry, log[i - 1])}
            />
          ))
        )}
      </div>

      {hasNew && (
        <div className="px-4 pb-2">
          <Button variant="secondary" size="touch" className="w-full" onClick={jumpToLatest}>
            New messages
          </Button>
        </div>
      )}

      <div className="shrink-0 border-t p-3" style={{ borderColor: "var(--tile-border)" }}>
        <label htmlFor="chat-composer" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-composer"
          ref={composer}
          rows={2}
          value={draft}
          maxLength={CHAT_MAX_LENGTH}
          disabled={cooldown !== null}
          placeholder={
            cooldown === null
              ? "Message everyone"
              : `Slow down a moment — you can send again in ${cooldown}s`
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(event) => {
            // §3.5: Enter sends, Shift+Enter newlines. IME composition is
            // excluded — pressing Enter to accept a candidate in a Japanese or
            // Chinese input method would otherwise send half a word.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none rounded-lg bg-input px-3 py-2 type-body text-foreground placeholder:text-muted-foreground disabled:opacity-60"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {/* §3.5: the counter appears at 900, not before. A permanent counter
              is a permanent reminder of a limit almost nobody reaches. */}
          {/*
            Not a live region.

            It carried `aria-live="polite"` and its text changes every second
            while the cooldown runs, and on every keystroke past 900 — so it
            announced a number roughly as fast as someone could type. The
            character count is a glance affordance; the send button's disabled
            state is what a screen reader needs, and it has that already.
          */}
          <span
            className="type-caption tabular-nums text-muted-foreground"
          >
            {cooldown !== null
              ? `${cooldown}s`
              : draft.length >= CHAT_COUNTER_AT
                ? `${remaining} left`
                : ""}
          </span>
          <Button
            size="touch"
            onClick={submit}
            disabled={draft.trim().length === 0 || cooldown !== null}
          >
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}
