import Link from "next/link";

import { Lockup } from "@/components/brand/Lockup";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {/* Horizontal lockup minimum is 96px wide; a 24px mark clears it. */}
          <Lockup variant="horizontal" markSize={24} />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
