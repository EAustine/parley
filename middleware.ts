import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the brand image files. The session
     * has to be refreshed on ordinary navigations, not on every icon request.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|ttf|woff2?)$).*)",
  ],
};
