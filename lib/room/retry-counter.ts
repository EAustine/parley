import { DefaultReconnectPolicy } from "livekit-client";
import type { ReconnectContext, ReconnectPolicy } from "livekit-client";

/**
 * The only place LiveKit's reconnect attempt number is observable.
 *
 * §3.11 asks for "automatic retry with visible attempt count". The SDK runs
 * the retry loop itself and keeps the count to itself:
 * `RTCEngine.reconnectAttempts` is private, `Room.engine` is `@internal`, and
 * the `reconnecting` event carries no argument. What *is* public is
 * `ReconnectPolicy` — the SDK asks it for the next delay and hands it a
 * `ReconnectContext` with `retryCount` on it. So supplying a policy is not a
 * way of changing the schedule; it is the only way of reading the count.
 *
 * Which is why this delegates. `DefaultReconnectPolicy` is exported and
 * decides every delay; we pass the question straight through and keep the
 * number on the way past. Shortening the schedule ourselves would abandon
 * connections the default would have recovered, and the SDK's own `online`
 * listener already short-circuits the wait when the network comes back.
 * `npm run check:connection` pins our vendored copy of the delays to the
 * SDK's, so a change there is visible rather than silent.
 *
 * A store rather than a callback: React must not be written to from inside a
 * policy call, which happens during reconnection on the SDK's schedule. The
 * hook subscribes with `useSyncExternalStore`, which is the supported way to
 * read a value that changes outside React's knowledge.
 */
export type RetryCounter = {
  /** Hand this to `new Room({ reconnectPolicy })`. */
  readonly policy: ReconnectPolicy;
  /** Failed attempts so far. 0 when nothing is wrong. */
  getAttempts: () => number;
  subscribe: (listener: () => void) => () => void;
  /** Called on `Reconnected` and on a fresh connect. */
  reset: () => void;
};

export function createRetryCounter(): RetryCounter {
  const inner = new DefaultReconnectPolicy();
  const listeners = new Set<() => void>();
  let attempts = 0;

  const publish = () => {
    for (const listener of listeners) listener();
  };

  return {
    policy: {
      nextRetryDelayInMs(context: ReconnectContext): number | null {
        // `retryCount` is the number of attempts that have already failed, so
        // the attempt about to be made is the next one. A bar reading
        // "attempt 0" while something is visibly happening is the kind of
        // detail that makes a person distrust the rest of the screen.
        const next = context.retryCount + 1;
        if (next !== attempts) {
          attempts = next;
          publish();
        }
        return inner.nextRetryDelayInMs(context);
      },
    },
    getAttempts: () => attempts,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset: () => {
      if (attempts === 0) return;
      attempts = 0;
      publish();
    },
  };
}
