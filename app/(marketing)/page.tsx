import Link from "next/link";

import { Lockup } from "@/components/brand/Lockup";
import { SITE_TAGLINE } from "@/lib/site";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-6 py-24 text-center">
      <Lockup variant="stacked" markSize={64} />
      <p className="type-display text-balance">{SITE_TAGLINE}</p>
      <p className="type-body max-w-md text-balance text-muted-foreground">
        Video meetings that guests join without an account, a download, or a
        plugin.
      </p>

      {process.env.NODE_ENV !== "production" && (
        <Button asChild variant="outline">
          <Link href="/dev/tokens">View design tokens</Link>
        </Button>
      )}
    </div>
  );
}
