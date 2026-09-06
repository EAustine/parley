"use client";

import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import type { LogEntry } from "@/lib/room/chat";
import { ChatBody } from "@/components/room/ChatPanel";
import { PeopleBody } from "@/components/room/ParticipantsPanel";
import { SheetHandle } from "@/components/room/SheetHandle";

export type PanelTab = "chat" | "participants";

/**
 * One panel, two tabs — v1.3 C3.
 *
 * Chat and People were two independent `<aside>` regions with identical
 * geometry, landing on the same 360px column, kept apart by a one-at-a-time
 * constraint in `RoomStage`. C3 "dissolves the one-at-a-time constraint by
 * removing the second panel", which is the better fix: the state that could go
 * wrong is gone rather than guarded.
 *
 * ## What survives the merge
 *
 * **Still a labelled region, never a dialog.** The floor is explicit that
 * `role="dialog"` with `aria-modal` promises a focus trap, and this must not
 * trap: §3.4 requires the control bar to stay reachable with a panel open, and
 * mute is a privacy control. So `<aside aria-label>`, the room live behind it,
 * Escape closing and returning focus to the trigger.
 *
 * **The two bar buttons stay two disclosures**, each with its own
 * `aria-expanded`. Opening People while Chat is showing does not close the
 * panel, so Chat's button is no longer disclosing anything and says so — a
 * single `aria-expanded` shared by both would claim chat was on screen when
 * people was.
 *
 * ## The tabs are real tabs
 *
 * `role="tablist"` with arrow keys, Home and End, and roving `tabIndex`. The
 * same rule the leave menu is built on: the ARIA role is a promise about
 * keyboard behaviour, and making it without keeping it is the lie `CLAUDE.md`
 * names. Two tabs is not too few to bother — it is exactly the case where a
 * left arrow is the obvious thing to press.
 */
export function RoomPanel({
  tab,
  log,
  cooldown,
  code,
  isLocalHost,
  waiting,
  blocked,
  onDecide,
  deciding,
  onLetBackIn,
  onTab,
  onClose,
  onSend,
  onRequestMute,
  onRemove,
}: {
  /** `null` is closed. Non-null is both "open" and "which tab". */
  tab: PanelTab | null;
  log: LogEntry[];
  cooldown: number | null;
  code: string;
  isLocalHost: boolean;
  /** v1.5 A2's queue, owned by the room — see `useWaitingQueue`. */
  waiting: import("@/lib/hooks/useWaitingQueue").WaitingRequest[];
  blocked: import("@/lib/hooks/useWaitingQueue").BlockedPerson[];
  onDecide: (id: string, decision: "admit" | "deny") => void;
  deciding: string | null;
  onLetBackIn: (id: string) => void;
  onTab: (next: PanelTab) => void;
  onClose: () => void;
  onSend: (body: string) => void;
  onRequestMute: (identity: string) => void;
  onRemove: (identity: string) => void;
}) {
  const open = tab !== null;
  const sheet = useRef<HTMLElement>(null);
  const tabs = useRef<HTMLDivElement>(null);

  /**
   * Focus into the panel on open — the floor's non-modal behaviour.
   *
   * The **selected tab**, not the close button and not the composer. It is the
   * first thing in the panel and the thing that says where you are; from there
   * one Tab reaches the body and Escape returns to the trigger.
   *
   * `preventScroll` because the sheet is mid-entrance: it animates up from
   * `translate: 0 100%`, so for the first frames the focus target sits below
   * the room's `overflow-hidden` box and the browser scrolls the container to
   * reveal it — measured once at exactly the sheet's height, which read as the
   * whole room lurching.
   */
  useEffect(() => {
    if (!open) return;
    tabs.current
      ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
      ?.focus({ preventScroll: true });
  }, [open, tab]);

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const order: PanelTab[] = ["chat", "participants"];
    const at = order.indexOf(tab ?? "chat");
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onTab(order[(at + 1) % order.length]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      onTab(order[(at - 1 + order.length) % order.length]);
    } else if (event.key === "Home") {
      event.preventDefault();
      onTab(order[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      onTab(order[order.length - 1]);
    }
  };

  return (
    <aside
      ref={sheet}
      id="room-panel"
      aria-label="Chat and people"
      hidden={!open}
      /*
       * `hidden` alone does the hiding. `app/globals.css` declares
       * `[hidden] { display: none !important }` in our own base layer, so this
       * does not rest on Tailwind's preflight happening to do the same.
       *
       * **`max-h`, not `h`** — v1.3 C3. The design caps the sheet at 55dvh and
       * lets it hug what it holds; this pinned it to exactly 55dvh, so a room
       * with two people and no messages still took over half the screen to say
       * so.
       *
       * Surface, not content: `--popover` is the plane every other floating
       * chrome surface in the room sits on. It is not what makes the boundary —
       * no fill in this set can, since the whole surface ramp lives inside 0.2
       * of a contrast point against the ground. The 1px `--boundary` edge is
       * the only value that reads as one, at 3.93:1 against the ground and
       * 3.41:1 against this fill.
       *
       * The bottom inset on mobile is the control bar's *measured* height: the
       * bar is `z-30` and floats over this sheet, because §3.4 requires mute to
       * stay reachable with a panel open.
       */
      className={`parley-panel ${open ? "flex" : "hidden"} absolute inset-x-0 bottom-0 top-auto z-[var(--layer-surfaces)] max-h-[55dvh] flex-col rounded-t-xl border-t bg-popover pb-[var(--parley-controls-h)] md:pb-0 md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[360px] md:rounded-t-none md:border-l md:border-t-0`}
      style={{ borderColor: "var(--boundary)" }}
      onKeyDown={(event) => {
        // Escape closes from anywhere inside, including mid-draft.
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <SheetHandle onDismiss={onClose} sheet={sheet} />

      <div
        ref={tabs}
        className="flex shrink-0 items-center gap-1 px-2 pt-2 pb-1 md:pt-3"
      >
        <div role="tablist" aria-label="Panel" className="flex flex-1 gap-1">
          <PanelTabButton
            id="chat"
            label="Chat"
            selected={tab === "chat"}
            onSelect={() => onTab("chat")}
            onKeyDown={onTabKeyDown}
          />
          <PanelTabButton
            id="participants"
            label="People"
            selected={tab === "participants"}
            onSelect={() => onTab("participants")}
            onKeyDown={onTabKeyDown}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          // One close button for one panel. It used to be two, one per region,
          // and "Close chat" / "Close participants" were different names for
          // the same act — which is why the floor's disclosure rule had to
          // spell out that a panel's close button is not its bar trigger.
          aria-label="Close panel"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ICONS.close.icon}
            size={20}
            strokeWidth={1.5}
            color="currentColor"
            aria-hidden
          />
        </button>
      </div>

      {/*
        Both bodies stay mounted and one is hidden, rather than swapping.
        `ChatBody` pins its scroller to the bottom and counts what arrived while
        you were away; unmounting it on every tab change would reset both, so
        switching to People and back would lose your place in the conversation.
      */}
      <div
        role="tabpanel"
        id="panel-chat"
        aria-labelledby="tab-chat"
        hidden={tab !== "chat"}
        className={`${tab === "chat" ? "flex" : "hidden"} min-h-0 flex-1 flex-col`}
      >
        <ChatBody
          open={tab === "chat"}
          log={log}
          cooldown={cooldown}
          onSend={onSend}
        />
      </div>

      <div
        role="tabpanel"
        id="panel-participants"
        aria-labelledby="tab-participants"
        hidden={tab !== "participants"}
        className={`${tab === "participants" ? "block" : "hidden"} min-h-0 flex-1 overflow-y-auto p-4`}
      >
        <PeopleBody
          open={tab === "participants"}
          code={code}
          isLocalHost={isLocalHost}
          waiting={waiting}
          blocked={blocked}
          onDecide={onDecide}
          deciding={deciding}
          onLetBackIn={onLetBackIn}
          onRequestMute={onRequestMute}
          onRemove={onRemove}
        />
      </div>
    </aside>
  );
}

function PanelTabButton({
  id,
  label,
  selected,
  onSelect,
  onKeyDown,
}: {
  id: PanelTab;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      // Roving tabIndex: one stop for the whole tablist, arrows within it.
      // Two tabs each taking a Tab stop would put the panel's own navigation
      // between the trigger and its content.
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      /*
       * 44px, not the design's `.tab{height:40px}`.
       *
       * `CLAUDE.md`'s floor is 44 on the room and pre-join surfaces and 24
       * elsewhere, and it does not bend for a design file — the same call that
       * kept the control bar at 44 where the design shrinks it to 40. These are
       * touch targets on a touch-primary surface, used one-handed, mid-meeting.
       * `check:targets` measured them at 146x40 and said so.
       */
      className="flex h-11 flex-1 items-center justify-center rounded-lg type-small font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ring)]"
      style={{
        // Selected is a fill and a value change, not a hue — rule 5, and the
        // same encoding as the control bar's secondary tier.
        background: selected ? "var(--secondary)" : "transparent",
        color: selected ? "var(--foreground)" : "var(--muted-foreground)",
      }}
    >
      {label}
    </button>
  );
}
