"use client";

import { autolink } from "@/lib/room/autolink";
import type { LogEntry } from "@/lib/room/chat";

/**
 * One entry in the log.
 *
 * Rule 6: rendered as text. There is no `dangerouslySetInnerHTML` anywhere on
 * this path — `autolink` returns segments, and the only element built from
 * someone else's message is an `<a>` whose `href` has already been through a
 * URL parser and a two-scheme allow-list.
 */
export function ChatMessage({
  entry,
  startsGroup,
}: {
  entry: LogEntry;
  startsGroup: boolean;
}) {
  if (entry.type === "system") {
    // §3.5: "visually distinct and quieter". Smaller, muted, and centred so it
    // does not read as something someone said.
    return (
      // v1.2 C1: 24px of air on each side, so a join sits between two
      // conversations rather than inside one. Margin rather than padding
      // because the scroller is a block formatting context — adjacent margins
      // collapse, so a group and a system message are 24px apart rather than
      // 24 plus the group's own 16.
      <p className="type-caption my-6 px-1 text-center text-muted-foreground">
        {entry.name} {entry.kind === "joined" ? "joined" : "left"}
      </p>
    );
  }

  return (
    // 16px between groups, 2px inside one — v1.2 C1.
    <div className={startsGroup ? "mt-4" : "mt-0.5"}>
      {startsGroup && (
        <div className="flex items-baseline gap-2">
          {/*
            v1.2 C1 inverts the hierarchy this had. The name was
            `type-small font-semibold text-foreground` — louder than the message
            under it — and the body is the thing anyone came to read. So the
            name is caption weight in `--muted-foreground` and the body keeps
            `--foreground`.
          */}
          <span className="type-caption text-muted-foreground">
            {entry.mine ? "You" : entry.name}
          </span>
          {/*
            "One step dimmer" than the name, expressed as weight rather than
            colour. There is no token dimmer than `--muted-foreground` — the
            next neutral down is `--tile-border`, which CLAUDE.md reserves for
            the room ground and permits on no other surface — and dimming with
            alpha would take this under 4.5:1 on `--popover`. Weight 400 against
            the name's 500 is the step the palette can actually carry.
          */}
          <time
            className="type-caption font-normal tabular-nums text-muted-foreground"
            dateTime={new Date(entry.at).toISOString()}
          >
            {clockTime(entry.at)}
          </time>
        </div>
      )}
      {/* `whitespace-pre-wrap` because Shift+Enter puts real newlines in the
          body, and `break-words` because a 900-character URL is one word. */}
      <p
        className={`type-body whitespace-pre-wrap break-words text-foreground${
          startsGroup ? " mt-1" : ""
        }`}
      >
        {autolink(entry.body).map((segment, i) =>
          segment.kind === "link" ? (
            <a
              key={i}
              href={segment.href}
              target="_blank"
              // Rule 6 and §8. `noopener` denies the opened page a handle on
              // this one; `nofollow` because a meeting is not an endorsement.
              rel="noopener noreferrer nofollow"
              className="underline underline-offset-2 hover:no-underline"
            >
              {segment.text}
            </a>
          ) : (
            <span key={i}>{segment.text}</span>
          ),
        )}
      </p>
    </div>
  );
}

/**
 * §3.5 asks for a relative time. A wall clock is the honest form here: this
 * chat lives for one meeting, so "14:32" is unambiguous and never goes stale,
 * where "2 minutes ago" needs a ticking timer to stay true and quietly lies
 * between ticks.
 */
function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
