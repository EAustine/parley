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
  onClose,
  onSend,
}: {
  open: boolean;
  log: LogEntry[];
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
    if (open) composer.current?.focus();
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
      // `flex` is conditional rather than constant, and that is not a
      // shortcut. The `hidden` attribute's `display: none` comes from a UA
      // rule that any author `display` declaration outranks — a constant
      // `flex` here would leave the panel permanently open. Tailwind's
      // preflight happens to mark its `[hidden]` rule important, which is what
      // makes the attribute alone work today; a correctness property should
      // not rest on a detail of someone else's reset.
      className={`${open ? "flex" : "hidden"} absolute inset-x-0 bottom-0 top-auto z-20 h-[60dvh] flex-col rounded-t-xl border-t bg-card md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[360px] md:rounded-t-none md:border-l md:border-t-0`}
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
          <Button variant="secondary" size="sm" className="w-full" onClick={jumpToLatest}>
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
          placeholder="Message everyone"
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
          className="w-full resize-none rounded-lg bg-input px-3 py-2 type-body text-foreground placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          {/* §3.5: the counter appears at 900, not before. A permanent counter
              is a permanent reminder of a limit almost nobody reaches. */}
          <span
            className="type-caption tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {draft.length >= CHAT_COUNTER_AT ? `${remaining} left` : ""}
          </span>
          <Button size="sm" onClick={submit} disabled={draft.trim().length === 0}>
            Send
          </Button>
        </div>
      </div>
    </aside>
  );
}
