import Link from "next/link";

import { Lockup } from "@/components/brand/Lockup";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

/**
 * v1.3 D2: the right side is a slot.
 *
 * Signed-in surfaces pass an account menu; everything else falls back to the
 * standalone theme toggle. A slot rather than a `user` prop, because the
 * account menu imports `supabase-js` and this component is rendered by
 * marketing and auth — two public cold-load routes with tight budgets in PRD
 * §10. Passing the element in from `(app)/layout.tsx` keeps that import out of
 * their graphs entirely; a prop would put it in this module and therefore in
 * all four.
 */
export function SiteHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <header className="border-b border-border">
      {/*
        Full-bleed, like the design's `.topbar{padding:0 24px}` — v1.3 D2.
        
        It was `max-w-6xl` while every page inside it is `max-w-3xl`, so the
        brand sat 200px left of the content it heads and 130px right of the
        window edge: aligned to neither. Full width picks one, and it is the
        one the design picks.
      */}
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {/* Horizontal lockup minimum is 96px wide; a 24px mark clears it. */}
          <Lockup variant="horizontal" markSize={24} />
        </Link>
        {actions ?? <ThemeToggle />}
      </div>
    </header>
  );
}
