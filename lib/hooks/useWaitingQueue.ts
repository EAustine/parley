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
  const [deciding, setDeciding] = useState<string | null>(null);
  /** What the last toast said, so an unchanged queue does not re-announce. */
  const announced = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/meetings/${code}/waiting`);
      if (!response.ok) return;
      const body = (await response.json()) as { waiting: WaitingRequest[] };
      setWaiting(body.waiting ?? []);
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

  return { waiting, decide, deciding };
}
