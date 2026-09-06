"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";

import { ICONS } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/brand/Mark";
import {
  BLOCK_MINUTES,
  NO_HOST_AFTER_MS,
  POLL_MS,
} from "@/lib/meetings/waiting";

/**
 * Held at the door — BUILD-PLAN v1.5 A3.
 *
 * > "Pre-join, then held: 'Waiting for the host to let you in.'"
 *
 * ## Waiting is not joining
 *
 * Nothing here publishes and nothing here holds a token. The camera and
 * microphone choice made at pre-join is *remembered* and applied at the moment
 * of admission, which is v1.4 A1's rule reaching one step further back: a
 * person who is not in a meeting is not on camera in it. The two chips below
 * exist so that is visible rather than promised — you can see what will be on
 * when you get in, and see that it is not on now.
 *
 * ## Five endings that must not share a screen
 *
 * §3.11 already refuses to let a dropped connection, a voluntary leave and a
 * host ending the meeting share one screen. A3 extends that from three to five,
 * and two of the new ones differ only in what happened to you:
 *
 * | Ending | Why it is its own screen |
 * |---|---|
 * | Admitted | Goes to the room |
 * | Denied | You were turned away |
 * | Removed | You were ejected |
 * | No host | Nobody can let you in yet |
 * | Ended | §3.4's state, with no Rejoin |
 *
 * Denied and removed carry the same ten-minute block and different words.
 * Being turned away and being ejected are different experiences, and telling
 * somebody the wrong one happened to them is the same class of error as §3.2's
 * cancelled meeting reading as one you missed.
 *
 * ## Leave is live from the first second
 *
 * §3.11's rule about the reconnect countdown — "nobody should be made to watch
 * a countdown they cannot interrupt" — applied to a wait whose length nobody
 * controls, and which A1 admits may never end at all: there is no co-host, so a
 * host who never arrives means a meeting nobody enters.
 */

export type WaitingState =
  | "waiting_for_host"
  | "waiting_for_admission"
  | "denied"
  | "removed"
  | "ended";

export function WaitingRoom({
  code,
  title,
  micOn,
  cameraOn,
  displayName,
  initial,
  onAdmitted,
}: {
  code: string;
  title: string;
  /** What pre-join chose, held until admission. */
  micOn: boolean;
  cameraOn: boolean;
  displayName: string;
  initial: WaitingState;
  /** Pre-join owns the token and the handoff; this only says when. */
  onAdmitted: () => void;
}) {
  const [state, setState] = useState<WaitingState>(initial);
  /**
   * Long enough with no host that saying "soon" would be a lie.
   *
   * A1 asks for this by name: "after a period of waiting with no host present,
   * the waiting screen must say so rather than spinning indefinitely. Nobody
   * should be left to guess whether the product is broken."
   */
  const [hostOverdue, setHostOverdue] = useState(false);
  const since = useRef(Date.now());

  // A terminal state stops the polling. `denied`, `removed` and `ended` are
  // answers, not stages, and asking again would only produce the same one.
  const settled = state === "denied" || state === "removed" || state === "ended";

  useEffect(() => {
    if (settled) return;
    let cancelled = false;

    const ask = async () => {
      try {
        const response = await fetch(`/api/meetings/${code}/waiting`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName }),
        });

        if (cancelled) return;

        // 410 is the meeting ending under you — §3.4's state, and the one
        // ending here that is not about you personally.
        if (response.status === 410) {
          setState("ended");
          return;
        }
        if (!response.ok) return; // A rate limit or a blip: ask again shortly.

        const body = (await response.json()) as {
          status: "waiting" | "admitted" | "denied";
          hostPresent?: boolean;
        };

        if (body.status === "admitted") {
          onAdmitted();
          return;
        }
        if (body.status === "denied") {
          setState("denied");
          return;
        }

        /*
         * Still waiting, and *which* wait it is can change under you: a host
         * arrives, or leaves again. Austine's call on the latter is that people
         * keep waiting rather than being admitted or turned out, so this screen
         * has to be able to go back as well as forward.
         */
        setState(body.hostPresent ? "waiting_for_admission" : "waiting_for_host");
        if (!body.hostPresent && Date.now() - since.current > NO_HOST_AFTER_MS) {
          setHostOverdue(true);
        } else if (body.hostPresent) {
          // The clock is about *this* absence. A host who arrives resets it, so
          // a later departure does not instantly read as "never arrived".
          since.current = Date.now();
          setHostOverdue(false);
        }
      } catch {
        // Offline, or the server blinked. Neither is an ending, and the next
        // tick asks again — the same reasoning §7 gives for holding the
        // pre-join screen through a 429 rather than bouncing to an error.
      }
    };

    void ask();
    const timer = setInterval(ask, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code, displayName, onAdmitted, settled]);

  if (state === "denied" || state === "removed") {
    return (
      <Ending
        heading={
          state === "denied"
            ? "The host didn’t let you in"
            : "The host removed you from the meeting"
        }
        body={
          state === "denied"
            ? `You can try again in ${BLOCK_MINUTES} minutes, or ask the host for a new link.`
            : `You can rejoin in ${BLOCK_MINUTES} minutes, or sooner if the host lets you back in.`
        }
      />
    );
  }

  if (state === "ended") {
    return (
      <Ending
        heading="This meeting has ended"
        body="It finished while you were waiting. There’s nothing to join."
      />
    );
  }

  const noHost = state === "waiting_for_host" && hostOverdue;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-6 text-center">
        {/*
          The mark alone, without the wordmark.

          These are full-screen status pages whose whole job is one sentence —
          "Waiting for the host to let you in", "The host removed you from the
          meeting" — and a display-size product name above that sentence
          competes with it for the first thing you read. The mark identifies the
          product; the heading is what you came for. The same argument §3.10a
          already makes for the landing page, where the tagline takes the
          display size and the name does not.

          `title` keeps the name for a screen reader: dropping the wordmark is a
          decision about visual weight, not a decision that the page should stop
          saying what it is — and an unlabelled logo is a worse outcome than a
          quiet one.
        */}
        <Mark size={40} title="Parley" />
        <div className="space-y-2">
          <h1 className="type-h1">
            {noHost
              ? "The host hasn’t arrived yet"
              : "Waiting for the host to let you in"}
          </h1>
          <p className="type-body text-balance text-muted-foreground">
            {noHost
              ? "Nobody can join until they do. You’ll go straight in when they get here."
              : title}
          </p>
        </div>

        {/*
          What is held, shown rather than promised — A3's "waiting is not
          joining". These describe the state that will be *applied on
          admission*; nothing is publishing while this screen is up, because
          there is no token and no room to publish into.
        */}
        <div
          className="flex items-center gap-2"
          role="status"
          aria-label={`On arrival: microphone ${micOn ? "on" : "off"}, camera ${cameraOn ? "on" : "off"}`}
        >
          <Held on={micOn} onIcon="micOn" offIcon="micOff" label={micOn ? "Mic on" : "Mic off"} />
          <Held
            on={cameraOn}
            onIcon="cameraOn"
            offIcon="cameraOff"
            label={cameraOn ? "Camera on" : "Camera off"}
          />
        </div>
      </div>

      {/*
        Live from the first second, never revealed after a delay. §3.11: nobody
        is made to watch something they cannot interrupt — and this is a wait
        whose length nobody controls and which may never end.
      */}
      <Button asChild size="touch" variant="secondary" className="w-full">
        <Link href="/">Leave</Link>
      </Button>
    </div>
  );
}

/** A held device state. Rule 5: no hue — the glyph carries it. */
function Held({
  on,
  onIcon,
  offIcon,
  label,
}: {
  on: boolean;
  onIcon: "micOn" | "cameraOn";
  offIcon: "micOff" | "cameraOff";
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 type-caption text-secondary-foreground">
      <HugeiconsIcon
        icon={ICONS[on ? onIcon : offIcon].icon}
        size={16}
        strokeWidth={1.5}
        color="currentColor"
        aria-hidden
      />
      {label}
    </span>
  );
}

/**
 * A terminal state, in the shape §3.2's ended and cancelled pages already use.
 *
 * "Back to Parley" rather than a retry: every ending here is one the person
 * cannot resolve by pressing the same button again, and §3.11's rule is that a
 * state's one action must be the thing that actually fixes it. Offering a retry
 * against a ten-minute block would be a button that exists to fail.
 */
function Ending({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col items-center gap-6 text-center">
        <Mark size={40} title="Parley" />
        <div className="space-y-2">
          <h1 className="type-h1">{heading}</h1>
          <p className="type-body text-balance text-muted-foreground">{body}</p>
        </div>
      </div>
      <Button asChild size="touch" className="w-full">
        <Link href="/">Back to Parley</Link>
      </Button>
    </div>
  );
}
