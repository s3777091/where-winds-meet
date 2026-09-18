import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase-cookie";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const publicURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalURL = process.env.SUPABASE_INTERNAL_URL ?? publicURL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!internalURL || !key) return response;

  const supabase = createServerClient(internalURL, key, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/login" || path.startsWith("/_next/") || path === "/favicon.ico";

  if (!data.user && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(target);
  }

  if (data.user && path === "/login") {
    const target = request.nextUrl.clone();
    target.pathname = "/";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}
