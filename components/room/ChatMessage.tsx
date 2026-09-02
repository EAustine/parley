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
      <p className="type-caption px-1 py-2 text-center text-muted-foreground">
        {entry.name} {entry.kind === "joined" ? "joined" : "left"}
      </p>
    );
  }

  return (
    <div className={startsGroup ? "pt-3" : "pt-0.5"}>
      {startsGroup && (
        <div className="flex items-baseline gap-2">
          <span className="type-small font-semibold text-foreground">
            {entry.mine ? "You" : entry.name}
          </span>
          <time
            className="type-caption tabular-nums text-muted-foreground"
            dateTime={new Date(entry.at).toISOString()}
          >
            {clockTime(entry.at)}
          </time>
        </div>
      )}
      {/* `whitespace-pre-wrap` because Shift+Enter puts real newlines in the
          body, and `break-words` because a 900-character URL is one word. */}
      <p className="type-body whitespace-pre-wrap break-words text-foreground">
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
