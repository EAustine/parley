/**
 * Absolute site URL. Social meta tags must carry complete absolute URLs baked
 * into the HTML — crawlers do not execute JavaScript, so nothing may be
 * assembled client-side.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  // Vercel preview and production deployments set this without a scheme.
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export const SITE_NAME = "Parley";
export const SITE_TAGLINE = "A link is all anyone needs.";
export const SITE_DESCRIPTION = "Video meetings. A link is all anyone needs.";
