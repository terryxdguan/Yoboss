import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// GET /auth/callback
// Handles OAuth code exchange after Google sign-in.
// This runs server-side so it can write httpOnly session cookies.
//
// Email-confirmation now goes through /auth/confirm (client-side
// verifyOtp) — this route is OAuth-only.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  // Only accept same-origin paths in `next` to prevent open-redirect abuse.
  // `new URL(next, request.url)` would happily resolve absolute URLs to the
  // supplied origin, so an attacker crafting ?next=https://evil.com would
  // bounce the user off-site after a valid code exchange.
  const rawNext = searchParams.get("next") || "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  // Supabase forwards verify-side failures here as ?error=...&error_code=...
  // &error_description=... Surface them to the homepage so the user actually
  // sees what went wrong instead of staring at a silent redirect.
  const supabaseError = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");
  if (supabaseError) {
    console.error(
      "[auth/callback] Supabase returned error:",
      supabaseError,
      errorCode,
      errorDescription
    );
    return NextResponse.redirect(buildErrorRedirect(request.url, supabaseError, errorCode, errorDescription));
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // May fail if called from middleware context
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }

    console.error("[auth/callback] OAuth code exchange failed:", error.message);
    return NextResponse.redirect(
      buildErrorRedirect(request.url, "exchange_failed", null, error.message)
    );
  }

  // No code AND no error — somebody navigated here directly. Send them home.
  return NextResponse.redirect(new URL("/", request.url));
}

function buildErrorRedirect(
  requestUrl: string,
  error: string,
  code: string | null,
  description: string | null
): URL {
  const url = new URL("/", requestUrl);
  url.searchParams.set("error", error);
  if (code) url.searchParams.set("error_code", code);
  if (description) url.searchParams.set("error_description", description);
  return url;
}
