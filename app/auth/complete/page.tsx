import { Suspense } from "react";
import type { Metadata } from "next";

import { CompleteSignIn } from "@/components/auth/CompleteSignIn";

export const metadata: Metadata = {
  title: "Signing in",
  robots: { index: false, follow: false },
};

export default function CompleteSignInPage() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-24 text-center">
      <Suspense fallback={<p className="type-body text-muted-foreground">Signing you in…</p>}>
        <CompleteSignIn />
      </Suspense>
    </div>
  );
}
