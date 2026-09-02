import { AuthListener } from "@/components/auth/AuthListener";
import { Toaster } from "@/components/ui/sonner";
import { SiteShell } from "@/components/shared/SiteShell";

/**
 * Signed-in surfaces only.
 *
 * AuthListener lives here rather than in the root layout because it pulls
 * supabase-js into whatever bundle contains it. In the root layout that cost
 * lands on the marketing page and, later, on /j/[code] — the guest join screen,
 * which is the highest-traffic route in the product and the one route that
 * never needs an auth session at all.
 *
 * Toaster is here for the same measured reason: in the root layout, sonner and
 * its lucide icons cost 10 kB of the shared baseline, paid by every route
 * whether or not it ever raises a toast. Every toast in Phase 2 — "Link
 * copied", meeting-creation failures — fires inside this group. The room route
 * gets its own when it arrives, rather than the marketing page paying for it.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AuthListener />
      <SiteShell>{children}</SiteShell>
      <Toaster />
    </>
  );
}
