import { SiteHeader } from "@/components/shared/SiteHeader";

/**
 * Header plus content, for the document-like surfaces: marketing, sign-in,
 * dashboard, and the tokens page.
 *
 * Not in the root layout, for two reasons.
 *
 * The visible one: `/j/[code]` and `/room/[code]` are forced dark by rule 8b,
 * and a header rendered above them from the root layout stays on the viewer's
 * own theme. On a light system that produced a white bar sitting on top of a
 * dark pre-join screen — a seam at exactly the moment the product is meant to
 * signal "you've entered the call".
 *
 * The quieter one: the header carries HugeIcons, a Radix tooltip and
 * next-themes. In the root layout every route pays for them, including the two
 * that do not render it.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
