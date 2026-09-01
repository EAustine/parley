import { AuthListener } from "@/components/auth/AuthListener";

/**
 * Signed-in surfaces only.
 *
 * AuthListener lives here rather than in the root layout because it pulls
 * supabase-js into whatever bundle contains it. In the root layout that cost
 * lands on the marketing page and, later, on /j/[code] — the guest join screen,
 * which is the highest-traffic route in the product and the one route that
 * never needs an auth session at all.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AuthListener />
      {children}
    </>
  );
}
