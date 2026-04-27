import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// GET /api/dev/auto-login?next=<path>
//
// Dev-only convenience: signs the request into a known test account using
// password creds stored in env vars, sets the Supabase session cookies, then
// redirects to `next` (defaults to /dashboard). Lets automated browser tests
// bypass the OAuth dance without compromising prod auth.
//
// Triple-guarded — ALL three must hold or this route returns 404 (acts as if
// it doesn't exist):
//
//   1. NODE_ENV !== "production"            (Next.js fills this; "production"
//                                            on Vercel deploys regardless of
//                                            other env)
//   2. DEV_AUTH_BYPASS === "1"              (explicit opt-in flag)
//   3. DEV_AUTH_BYPASS_EMAIL + _PASSWORD    (real creds for an existing user)
//
// If any condition fails the route 404s — there is no path by which an
// attacker can trigger sign-in via this endpoint on production, even with
// a misconfigured env.
export async function GET(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const bypassFlag = process.env.DEV_AUTH_BYPASS === "1";
  const email = process.env.DEV_AUTH_BYPASS_EMAIL;
  const password = process.env.DEV_AUTH_BYPASS_PASSWORD;

  if (isProd || !bypassFlag || !email || !password) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Only accept same-origin paths in `next` — otherwise an attacker who
  // somehow tricked a dev server into running this could chain it into an
  // open redirect. Same guard as /auth/callback.
  const { searchParams } = new URL(request.url);
  const rawNext = searchParams.get("next") || "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

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
            // Tolerate the Server Component cookie-set warning.
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Surface the real reason so the dev can fix env / password instead of
    // staring at a redirect loop.
    console.error("[dev/auto-login] signInWithPassword failed:", error.message);
    return NextResponse.json(
      {
        error: "Auto-login failed",
        detail: error.message,
        hint: "Check DEV_AUTH_BYPASS_EMAIL / DEV_AUTH_BYPASS_PASSWORD in .env.local match a real Supabase auth user.",
      },
      { status: 500 }
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
