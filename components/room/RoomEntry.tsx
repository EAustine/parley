"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Lockup } from "@/components/brand/Lockup";
import { recallJoin } from "@/lib/prejoin-handoff";
import { MAX_JOIN_ATTEMPTS, retryAfterSeconds } from "@/lib/join-backoff";

/**
 * Rule 8, enforced here.
 *
 * `livekit-client` is ~200 kB and belongs to exactly one screen. Everything
 * above this line — the token request, every failure state — is ordinary React
 * that ships in the route's first load. Everything below it arrives only once
 * a token has actually been minted, which means a stranger who hits an ended
 * meeting or a rate limit never downloads a media SDK to be told so.
 *
 * `ssr: false` because the SDK touches `navigator` and `RTCPeerConnection` on
 * import. There is nothing to server-render here anyway: the token is fetched
 * in the browser, so the server has nothing to say about this subtree.
 */
const RoomStage = dynamic(
  () => import("@/components/room/RoomStage").then((m) => m.RoomStage),
  { ssr: false, loading: () => <Joining /> },
);

/**
 * Requests a room token and reports what happened.
 *
 * Every failure the §7 contract can return has its own state here. That is the
 * point of building this now rather than alongside the video grid: when a join
 * fails under a grid it looks like the grid is broken, and the actual cause —
 * an ended meeting, a rate limit, a guest hitting a closed meeting — is three
 * layers down. Each one gets a sentence that says what happened and what to do.
 */

type Failure = {
  title: string;
  body: string;
  /** The one thing that fixes this state. Never a generic "try again". */
  action: { label: string; href: string };
};

type Outcome =
  | { kind: "requesting" }
  | { kind: "waiting"; seconds: number }
  | { kind: "ready"; token: string; serverUrl: string }
  | ({ kind: "failed" } & Failure);

/**
 * The contract's error strings, in Parley's voice, each with the action that
 * actually resolves it.
 *
 * An earlier version had a single `retry` flag deciding whether to show "Back
 * to the join screen". It produced a state whose copy said "go back to the join
 * screen" above a button that went somewhere else — the copy and the control
 * disagreeing, which is its own kind of undesigned state. Each case now names
 * its own way out.
 */
function describe(reason: string, status: number, code: string): Failure {
  const backToJoin = { label: "Back to the join screen", href: `/j/${code}` };
  const newMeeting = { label: "Start a new meeting", href: "/dashboard" };

  switch (reason) {
    case "meeting_ended":
      return {
        title: "This meeting has ended",
        body: "It finished while you were on the way in. There's nothing to join.",
        action: newMeeting,
      };
    case "meeting_not_found":
      return {
        title: "That meeting isn't here",
        body: "The code doesn't match an open meeting. Check the link, or ask whoever sent it.",
        action: backToJoin,
      };
    case "guests_not_allowed":
      return {
        title: "This meeting needs an account",
        body: "The host has limited it to signed-in people. Sign in and the link will work.",
        action: { label: "Sign in", href: `/sign-in?next=/j/${code}` },
      };
    case "rate_limited":
      return {
        title: "Too many attempts",
        body: "This connection has asked to join too many times in the last minute. Wait a moment, then try again.",
        action: backToJoin,
      };
    case "display_name_required":
      return {
        title: "A name is needed first",
        body: "The join screen asks for the name people will see. It only takes a moment.",
        action: backToJoin,
      };
    default:
      return {
        title: "Couldn't join the meeting",
        body: `The server refused the request (${status}). Try again from the join screen; if it keeps happening the meeting may have been closed.`,
        action: backToJoin,
      };
  }
}

export function RoomEntry({ code }: { code: string }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "requesting" });

  const attempts = useRef(0);

  // React 18+ mounts effects twice in development. Without this the token
  // endpoint sees two requests per visit, which is harmless except that it
  // burns the rate limit at double speed and makes 429 look like a bug.
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;

    const timers: ReturnType<typeof setInterval>[] = [];

    const hold = (seconds: number) => {
      setOutcome({ kind: "waiting", seconds });
      const timer = setInterval(() => {
        setOutcome((current) => {
          if (current.kind !== "waiting") return current;
          if (current.seconds > 1) return { ...current, seconds: current.seconds - 1 };
          clearInterval(timer);
          void request();
          return { kind: "requesting" };
        });
      }, 1000);
      timers.push(timer);
    };

    const request = async () => {
      // Pre-join already minted one and checked it would be accepted. Asking
      // again would spend a second rate-limit slot to be told the same thing.
      const handed = recallJoin(code);
      if (handed) {
        setOutcome({
          kind: "ready",
          token: handed.token,
          serverUrl: handed.serverUrl,
        });
        return;
      }

      try {
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // A guest's name comes from pre-join; a host's comes from the
          // session and is not sent at all.
          // Nothing was handed over — a link opened directly, a restored tab,
          // or storage refused. There is no name to send, so this succeeds for
          // a host and correctly asks a guest to go and give one.
          body: JSON.stringify({ code }),
        });

        if (!response.ok) {
          const payload = (await response
            .json()
            .catch(() => ({ error: "unknown" }))) as {
            error: string;
            retryAfter?: number;
          };

          // §7's rule holds here too. Sending someone back to the join screen
          // to press the same button again is the dead end it removes — and
          // this is the path a link opened directly takes, where there is no
          // pre-join screen behind them to go back to.
          if (payload.error === "rate_limited" && attempts.current < MAX_JOIN_ATTEMPTS) {
            attempts.current += 1;
            hold(retryAfterSeconds(response, payload));
            return;
          }

          setOutcome({
            kind: "failed",
            ...describe(payload.error, response.status, code),
          });
          return;
        }

        const data = (await response.json()) as { token: string; url: string };
        setOutcome({ kind: "ready", token: data.token, serverUrl: data.url });
      } catch {
        setOutcome({
          kind: "failed",
          title: "Couldn't reach the server",
          body: "Check your connection, then try joining again.",
          action: { label: "Back to the join screen", href: `/j/${code}` },
        });
      }
    };

    void request();
    return () => {
      for (const timer of timers) clearInterval(timer);
    };
  }, [code]);

  if (outcome.kind === "requesting") return <Joining />;

  if (outcome.kind === "waiting") {
    return (
      <Centred>
        <div className="space-y-2">
          <p className="type-body tabular-nums" role="status" aria-live="polite">
            This meeting is busy. Joining in {outcome.seconds}s…
          </p>
          <p className="type-small text-muted-foreground">
            There&rsquo;s nothing to do — it will go through on its own.
          </p>
        </div>
      </Centred>
    );
  }

  if (outcome.kind === "failed") {
    return (
      <Centred>
        <div className="flex flex-col items-center gap-6 text-center">
          <Lockup variant="stacked" markSize={40} />
          <div className="space-y-2">
            <h1 className="type-h1">{outcome.title}</h1>
            <p className="type-body text-balance text-muted-foreground">
              {outcome.body}
            </p>
          </div>
        </div>
        <Button asChild className="w-full">
          <Link href={outcome.action.href}>{outcome.action.label}</Link>
        </Button>
      </Centred>
    );
  }

  return (
    <RoomStage
      code={code}
      token={outcome.token}
      serverUrl={outcome.serverUrl}
    />
  );
}

function Joining() {
  return (
    <Centred>
      <p className="type-body text-muted-foreground" role="status" aria-live="polite">
        Getting you in…
      </p>
    </Centred>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      {children}
    </div>
  );
}
