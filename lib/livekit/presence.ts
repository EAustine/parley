import "server-only";

import { RoomServiceClient } from "livekit-server-sdk";

import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { metaOf } from "@/lib/room/participant";

/**
 * Is a host actually in the room? — BUILD-PLAN v1.5 A1.
 *
 * A1: "Host presence means joined, not sitting in pre-join. A host choosing a
 * camera has not arrived." It does not say how to ask, and the two available
 * answers fail in opposite directions.
 *
 * **The database is cheap and can be wrong in the fatal direction.**
 * `meeting_participants` carries an open host session as soon as the webhook
 * writes one, which is a plain indexed read. But it rests entirely on that
 * webhook arriving — and v1.3 A2 exists precisely because deliveries were
 * silently not arriving, where "a webhook that 401s on every delivery looks
 * exactly like one that was never called". Here that failure means **nobody can
 * ever enter the meeting**, which is worse than anything the waiting room
 * prevents.
 *
 * **LiveKit is authoritative and costs a round trip**, on a path that runs on
 * every waiting poll.
 *
 * So: the database first, and LiveKit only when the database says no host. In
 * the steady state — a host has joined, people are arriving — the cheap answer
 * is the right one and no call is made. The expensive answer is spent only on
 * the case where the alternative is telling somebody to wait for a host who is
 * already there.
 */

let client: RoomServiceClient | null = null;

function service(): RoomServiceClient {
  client ??= new RoomServiceClient(
    // The REST host, derived from the websocket URL the browser is given —
    // the same transform `api/livekit/participants` and `api/livekit/room`
    // already make. No new environment variable for a value we hold twice.
    publicEnv.NEXT_PUBLIC_LIVEKIT_URL.replace(/^wss:/, "https:"),
    serverEnv.LIVEKIT_API_KEY,
    serverEnv.LIVEKIT_API_SECRET,
  );
  return client;
}

/**
 * Ask LiveKit directly.
 *
 * A room nobody has joined does not exist on LiveKit's side and the call throws
 * — that is "no host", not an error worth propagating. Any other failure is
 * also answered `false`: the safe direction is to make somebody wait, never to
 * open the door because a lookup failed.
 */
export async function hostIsInRoomLive(code: string): Promise<boolean> {
  try {
    const participants = await service().listParticipants(code);
    return participants.some((p) => metaOf(p as never).role === "host");
  } catch {
    return false;
  }
}
