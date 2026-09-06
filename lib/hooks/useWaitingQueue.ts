"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { POLL_MS } from "@/lib/meetings/waiting";

/**
 * The host's side of the queue — BUILD-PLAN v1.5 A2.
 *
 * ## Why this lives above the panel
 *
 * A2 puts the queue "at the top of the People tab", which reads like it belongs
 * inside `PeopleBody`. It cannot: two of its three requirements are about what
 * happens while that tab is **closed**.
 *
 * > "The badge carries the waiting count while a queue exists."
 * > "The toast is a hint; the panel is the truth. A toast auto-dismisses, so a
 * > request arriving while the host is talking is a request the host never sees
 * > if the toast is the only notice."
 *
 * A badge that only updates when you are looking at the thing it is telling you
 * about is not a notification, and a toast that only fires when the panel is
 * open is one nobody needs. So the polling sits in the room and the panel
 * renders what it finds.
 */

/** Somebody the host shut out, and whether they have tried to come back. */
export type BlockedPerson = {
  id: string;
  name: string;
  reason: "denied" | "removed";
  expiresAt: string;
  /** `attempted_at > notified_at` — they came back and the host has not been told. */
  returned: boolean;
};

export type WaitingRequest = {
  id: string;
  name: string;
  /**
   * C1's distinction, carried from the route: signing in buys accountability,
   * not authorisation. A guest can type your name, so a queue that does not say
   * which is which implies an attestation the product cannot make.
   */
  verified: boolean;
  requestedAt: string;
};

/** One toast, reused. Sonner updates in place when the id is the same. */
const TOAST_ID = "parley-waiting";

export function useWaitingQueue({
  code,
  isHost,
}: {
  code: string;
  /** Guests never poll this. The route refuses them, and asking would be noise. */
  isHost: boolean;
}) {
  const [waiting, setWaiting] = useState<WaitingRequest[]>([]);
  const [blocked, setBlocked] = useState<BlockedPerson[]>([]);
  /**
   * The door, as the server currently has it — v1.5 A1's in-room home.
   *
   * `null` until the first poll answers, so the control can wait rather than
   * render a guess and then correct itself. A toggle that flips on its own a
   * second after the panel opens reads as the product changing the setting.
   */
  const [waitingRoom, setWaitingRoom] = useState<boolean | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  /** What the last toast said, so an unchanged queue does not re-announce. */
  const announced = useRef(0);
  /**
   * Blocks this session has already announced.
   *
   * The server rule (`notified_at is null`) is the durable one and survives a
   * reload; this only closes the window between raising the toast and the
   * `POST` that marks it, during which another poll can still see `returned`.
   * Belt to that brace — and deliberately not the whole mechanism, because a
   * client-side memory alone re-announces on every reload.
   */
  const toldAbout = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/meetings/${code}/waiting`);
      if (!response.ok) return;
      const body = (await response.json()) as {
        waiting: WaitingRequest[];
        blocked: BlockedPerson[];
        waitingRoom?: boolean;
      };
      setWaiting(body.waiting ?? []);
      setBlocked(body.blocked ?? []);
      if (typeof body.waitingRoom === "boolean") setWaitingRoom(body.waitingRoom);
    } catch {
      // A blip is not an empty queue. Leaving the last known list up is the
      // safer wrong answer: it shows a request that may already be gone, rather
      // than hiding one that is still waiting.
    }
  }, [code]);

  useEffect(() => {
    if (!isHost) return;
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [isHost, refresh]);

  /**
   * One toast, whatever the queue length — A2, and it is a rule about attention
   * rather than about tidiness. "Ten people waiting produces **one** toast
   * saying how many, never ten toasts."
   *
   * It fires when the queue grows and stays quiet when it shrinks: somebody
   * being admitted is not news, and re-announcing on every decision would make
   * the host's own actions notify them.
   */
  useEffect(() => {
    if (!isHost) return;
    const count = waiting.length;
    if (count === 0) {
      announced.current = 0;
      toast.dismiss(TOAST_ID);
      return;
    }
    if (count <= announced.current) return;
    announced.current = count;
    toast(
      count === 1
        ? `${waiting[0].name} is waiting to join`
        : `${count} people are waiting to join`,
      {
        id: TOAST_ID,
        description: "Open People to let them in.",
      },
    );
  }, [waiting, isHost]);

  /**
   * Somebody came back — announced once, then marked seen — v1.5 B2.
   *
   * The server decides *whether* to announce (`attempted_at > notified_at`) and
   * this closes the loop by marking it. Doing it the other way round — the
   * client remembering what it has said — re-announces on every reload, so a
   * host with two tabs still gets a stream, which is the thing B2 forbids.
   *
   * Its own toast id per person, because two different people returning are two
   * different facts. The queue's single toast is the opposite case: ten people
   * waiting is one fact with a number in it.
   */
  useEffect(() => {
    if (!isHost) return;
    for (const person of blocked) {
      if (!person.returned || toldAbout.current.has(person.id)) continue;
      toldAbout.current.add(person.id);
      toast(`${person.name} tried to rejoin`, {
        id: `parley-blocked-${person.id}`,
        description: "They're blocked for a few more minutes. Open People to let them back in.",
      });
      void fetch(`/api/meetings/${code}/blocks/${person.id}`, { method: "POST" });
    }
  }, [blocked, code, isHost]);

  /** B2's undo. Clearing the row is all it takes — the door re-reads it. */
  const letBackIn = useCallback(
    async (id: string) => {
      setBlocked((current) => current.filter((b) => b.id !== id));
      await fetch(`/api/meetings/${code}/blocks/${id}`, { method: "DELETE" });
      void refresh();
    },
    [code, refresh],
  );

  const decide = useCallback(
    async (id: string, decision: "admit" | "deny") => {
      setDeciding(id);
      try {
        await fetch(`/api/meetings/${code}/waiting/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        });
        // Drop it locally rather than waiting for the next poll: the host has
        // answered, and a row that lingers for two seconds invites a second tap
        // on a decision that is already made.
        setWaiting((current) => current.filter((w) => w.id !== id));
        void refresh();
      } finally {
        setDeciding(null);
      }
    },
    [code, refresh],
  );

  return { waiting, blocked, decide, deciding, letBackIn, waitingRoom };
}
