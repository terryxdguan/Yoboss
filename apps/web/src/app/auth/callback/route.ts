import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// GET /auth/callback
// Handles OAuth code exchange after Google sign-in.
// This runs server-side so it can write httpOnly session cookies.
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

    console.error("OAuth code exchange failed:", error.message);
  }

  // Redirect to home with error
  return NextResponse.redirect(new URL("/?error=auth_failed", request.url));
}
