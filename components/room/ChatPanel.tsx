"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { isPinnedToBottom, startsGroup, type LogEntry } from "@/lib/room/chat";
import { CHAT_COUNTER_AT, CHAT_MAX_LENGTH } from "@/lib/room/messages";
import { ChatMessage } from "@/components/room/ChatMessage";
import { Button } from "@/components/ui/button";

/**
 * §3.5's chat, as the Chat tab's body and footer — v1.3 C3.
 *
 * This was a whole panel: its own `<aside aria-label="Meeting chat">`, its own
 * header and close button, its own sheet geometry. C3 merges chat and people
 * into **one** surface with two tabs, so the shell moved to `RoomPanel` and
 * what stayed here is the part that is actually about chat — the log, the
 * scroll pinning, and the composer.
 *
 * The surface reasoning did not move with it; it is recorded in `RoomPanel`,
 * which is now the thing that has a surface.
 */
export function ChatBody({
  open,
  log,
  cooldown,
  onSend,
}: {
  /** The Chat tab is showing. Focus and scroll pinning both key off it. */
  open: boolean;
  log: LogEntry[];
  /** Seconds until sending is allowed again, or null — §3.5. */
  cooldown: number | null;
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
    <>
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

      <div className="shrink-0 border-t p-3" style={{ borderColor: "var(--boundary)" }}>
        <label htmlFor="chat-composer" className="sr-only">
          Message
        </label>
        <div className="flex items-end gap-2">
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
          /*
           * v1.3 C3: transparent with a 1px `--boundary` edge, not a filled
           * `--input` well. `--input` is a fill, and at 1.44:1 against the
           * panel it is not a boundary — the same distinction `CLAUDE.md` draws
           * for every other field in the product. The focus ring is the `--ring`
           * border plus a 1px shadow, matching the design's `.composer:focus`.
           */
          className="min-h-11 max-h-30 w-full resize-none rounded-lg border border-boundary bg-transparent px-3 py-2.5 type-body text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--ring)] focus:shadow-[0_0_0_1px_var(--ring)] disabled:opacity-60"
        />
        {/*
          C3: "A send button beside the composer, disabled until there is
          content; Enter still sends, the button is for touch."

          It was a text button on its own row, sharing it with the character
          counter — two rows of chrome under a two-row field, on the surface
          with the least vertical room in the product.
        */}
        <button
          type="button"
          onClick={submit}
          disabled={draft.trim().length === 0 || cooldown !== null}
          aria-label="Send message"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <HugeiconsIcon
            icon={ICONS.send.icon}
            size={18}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
        </button>
      </div>

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
        </div>
      </div>
    </>
  );
}
