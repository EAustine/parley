import { Suspense } from "react";
import type { Metadata } from "next";

import { Lockup } from "@/components/brand/Lockup";
import { SignInForm } from "@/components/auth/SignInForm";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to host meetings on Parley.",
};

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-10 px-6 py-20">
      <div className="flex flex-col items-center gap-6 text-center">
        <Lockup variant="stacked" markSize={40} />
        <div className="space-y-2">
          <h1 className="type-h1">Sign in</h1>
          <p className="type-body text-muted-foreground">
            You only need an account to host. Joining a meeting never does.
          </p>
        </div>
      </div>

      {/* useSearchParams needs a Suspense boundary to stay statically rendered. */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
