import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes: landing page, auth callback, auth pages, and service endpoints
  // that authenticate via their own mechanism (Stripe signatures, CRON secret, etc.)
  const isPublicRoute =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname === "/dashboard-preview" ||
    request.nextUrl.pathname === "/dashboard-main-preview" ||
    request.nextUrl.pathname === "/todos-layout-preview" ||
    request.nextUrl.pathname.startsWith("/auth/") ||
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/api/webhooks/") ||
    request.nextUrl.pathname.startsWith("/api/cron/") ||
    // Dev-only auto-login endpoint must be reachable without a session
    // (otherwise the redirect below would loop). The route itself triple-
    // guards against running in production, so whitelisting it here is
    // safe regardless of env.
    request.nextUrl.pathname.startsWith("/api/dev/");

  // Protect private routes. On dev, if the bypass is configured, send the
  // request through /api/dev/auto-login first so it gets a real session for
  // the test account before continuing — lets browser-based automation skip
  // the OAuth flow without faking auth state. The same triple guard as the
  // route is applied here; production traffic always falls through to the
  // plain redirect-to-/ branch.
  if (!user && !isPublicRoute) {
    const devBypass =
      process.env.NODE_ENV !== "production" &&
      process.env.DEV_AUTH_BYPASS === "1" &&
      !!process.env.DEV_AUTH_BYPASS_EMAIL &&
      !!process.env.DEV_AUTH_BYPASS_PASSWORD;

    const url = request.nextUrl.clone();
    if (devBypass) {
      url.pathname = "/api/dev/auto-login";
      url.searchParams.set(
        "next",
        request.nextUrl.pathname + request.nextUrl.search
      );
    } else {
      url.pathname = "/";
      url.search = "";
    }
    return NextResponse.redirect(url);
  }

  // Logged-in users can still visit landing page (via YoBoss logo click)

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
