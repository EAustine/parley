// Same source as the Open Graph card — one image, two sets of tags.
// `runtime` must be a string literal for Next to see it; the rest re-exports.
export const runtime = "nodejs";

export { alt, size, contentType, default } from "./opengraph-image";
