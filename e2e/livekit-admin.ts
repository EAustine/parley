import { RoomServiceClient } from "livekit-server-sdk";

/**
 * Evicting stragglers between tests.
 *
 * LiveKit does not notice a browser context that was closed rather than
 * disconnected until its own timeout elapses, so a participant from the
 * previous test lingers in the room for a while afterwards. Every assertion
 * here is about an exact participant count, and one ghost makes "2
 * participants" into "3" — a flake that looks exactly like a real bug in the
 * grid.
 *
 * So each test starts from an empty room rather than from whatever the last one
 * left behind. This is the server SDK, in Node, in the test runner — never in a
 * browser context and never in the app. The credentials come from
 * `--env-file=.env.local`, the same way `check:rls` and `check:meetings` get
 * theirs.
 */

function client(): RoomServiceClient | null {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return null;
  // The REST API is https where the signalling is wss.
  return new RoomServiceClient(url.replace(/^wss:/, "https:"), key, secret);
}

export function adminAvailable(): boolean {
  return client() !== null;
}

export async function emptyRoom(name: string) {
  const service = client();
  if (!service) {
    throw new Error(
      "LiveKit admin credentials are absent. Run via `npm run check:media`, " +
        "which loads them with --env-file=.env.local.",
    );
  }
  try {
    await service.deleteRoom(name);
  } catch {
    // A room that does not exist is already empty, which is the desired state.
  }
}
