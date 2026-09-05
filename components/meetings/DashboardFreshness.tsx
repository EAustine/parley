"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { REFRESH_GAP_MS } from "@/lib/meetings/freshness";

/**
 * "Nobody watches a dashboard for five minutes; they come back to it, and that
 * is the moment the data should be current." — v1.3 D5.
 *
 * Renders nothing. It exists to hold one effect on a page that is otherwise a
 * Server Component, which is also why it is mounted by `/dashboard` rather than
 * by `(app)/layout.tsx`: the layout wraps `/schedule` and `/schedule/[code]`
 * too, and refreshing a form the user is halfway through filling in is the
 * opposite of the improvement.
 *
 * ## Two events, because "came back" has two shapes
 *
 * `window`'s **focus** is returning to the browser from another application or
 * another window. `document`'s **visibilitychange** is returning to this tab
 * from another one, or to the browser from the home screen on a phone. Neither
 * implies the other: switching tabs in a focused window fires only the second,
 * and clicking back into an already-visible window fires only the first.
 *
 * The repo has ruled on the event-name half of this once already —
 * `useControlVisibility.ts`: "`focusin` rather than `focus`: focus does not
 * bubble". That is about catching focus *inside* a subtree. This listens on
 * `window` itself, which is where the non-bubbling event is actually dispatched,
 * so `focus` is right here and `focusin` would be the mistake.
 */



export function DashboardFreshness() {
  const router = useRouter();
  /*
   * Seeded at mount, not at zero.
   *
   * The page has just rendered, so it is already current — and a load very
   * often arrives with a `focus` of its own, which would otherwise spend a
   * refresh re-fetching what the server sent a moment ago.
   */
  const last = useRef(Date.now());

  useEffect(() => {
    /*
     * A ref and a subtraction, rather than `Throttle` from `lib/room/limits`.
     *
     * That class is a *per-key* leading-edge gate, keyed on participant
     * identity so one person flooding cannot silence anyone else's reactions.
     * There is one key here and it is always the same one, so reusing it would
     * be borrowing the name rather than the behaviour — and it would pull a
     * module of reaction constants into a route with 7 kB of budget left.
     */
    const refresh = () => {
      const now = Date.now();
      if (now - last.current < REFRESH_GAP_MS) return;
      last.current = now;
      /*
       * A soft refresh: the server re-renders and React reconciles, so this is
       * not a reload and client state survives it.
       *
       * A row *can* move between the two panels under someone who left the tab
       * with it focused, and that will drop the focus. Deliberately not
       * guarded: the row moved because the meeting genuinely changed state,
       * which is the thing they came back to find out. A guard that skipped the
       * refresh whenever anything on the list had focus would trade the feature
       * for the edge case.
       */
      router.refresh();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
