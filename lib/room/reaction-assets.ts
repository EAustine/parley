import type { Reaction } from "@/lib/room/messages";

/**
 * The six reactions as Fluent Emoji 3D — v1.3 C6.
 *
 * MIT, from `microsoft/fluentui-emoji`, resized to 96px and converted to WebP:
 * 22 kB for the set against 212 kB at source. 96 covers the 30px render at 3×
 * density, which is every phone shipping, and `design/02` is where the 30 comes
 * from.
 *
 * ## What this trades, on the platform it matters most
 *
 * On Android and Windows it is an upgrade. **On iOS it is a lateral move at
 * best** — Fluent 3D replaces Apple Color Emoji, which is already three
 * dimensional and is the best-looking set on any platform. iPhone is a large
 * share of the guests this product is built for, so a good part of the audience
 * gets a swap rather than an improvement.
 *
 * The consistency argument is weaker here than it first looks, too: a reaction
 * lives 2400ms, nobody compares one across devices, and platform-varying emoji
 * is what every messaging app already does.
 *
 * Recorded rather than resolved. The set ships because C6 asks for it and the
 * cost came in at a tenth of the estimate; if it ever stops earning that, this
 * comment is the argument for taking it out again.
 */
export const REACTION_ASSETS: Record<Reaction, string> = {
  "👍": "/reactions/thumbs-up.webp",
  "❤️": "/reactions/red-heart.webp",
  "😂": "/reactions/tears-of-joy.webp",
  "🎉": "/reactions/party-popper.webp",
  "👏": "/reactions/clapping-hands.webp",
  "😮": "/reactions/open-mouth.webp",
};

/** Every asset, for the preload. */
export const REACTION_ASSET_URLS = Object.values(REACTION_ASSETS);
