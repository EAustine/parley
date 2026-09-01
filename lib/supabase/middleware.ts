import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/** Signed-in-only routes. Everything else, including /j/[code], stays public. */
const PROTECTED = ["/dashboard", "/schedule"];

/** Where a signed-in user should never be. */
const AUTH_ROUTES = ["/sign-in"];

export async function updateSession(request: NextRequest) {
  // This response object is the one that must be returned. Its cookies carry
  // the refreshed session; building a fresh NextResponse later would drop them
  // and log the user out on the next navigation.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser(), not getSession(). getSession() reads the cookie and trusts it;
  // getUser() revalidates the token with Supabase. On the server the cookie is
  // attacker-supplied input, so the difference is the whole point.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    // Come back to where they were headed once signed in.
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ROUTES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
