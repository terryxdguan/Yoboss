"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/db/client";

// Email-confirmation landing page. The Supabase email template points
// here:
//
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next={{ .RedirectTo }}
//
// We intentionally call verifyOtp from the BROWSER (not a server route)
// so anti-phishing link scanners that pre-fetch the URL — looking at
// you, QQ Mail — don't burn the one-time token before the human ever
// clicks. Scanners don't run JS; only a real browser session triggers
// the verification and gets the resulting cookies.
export default function ConfirmEmailPage() {
  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type") as EmailOtpType | null;
    // Only same-origin paths are accepted as `next`. An attacker
    // crafting `?next=https://evil.com` would otherwise bounce the
    // user off-site after a valid verification.
    const rawNext = params.get("next") || "/dashboard";
    const next =
      rawNext.startsWith("/") && !rawNext.startsWith("//")
        ? rawNext
        : "/dashboard";

    if (!tokenHash || !type) {
      setStatus("error");
      setErrorMsg("Missing confirmation token. Try the link in your email again.");
      return;
    }

    const supabase = createClient();
    supabase.auth.verifyOtp({ type, token_hash: tokenHash }).then(({ error }) => {
      if (error) {
        // Map the most common Supabase failure modes to plain English.
        // Everything else falls through to the raw message.
        const msg = error.message || "";
        let friendly = msg;
        if (/expired/i.test(msg)) {
          friendly =
            "This confirmation link has expired. Please sign up again to receive a fresh link.";
        } else if (/invalid|consumed|used/i.test(msg)) {
          friendly =
            "This confirmation link is no longer valid. Please sign up again to receive a fresh link.";
        }
        setStatus("error");
        setErrorMsg(friendly);
        return;
      }
      // Success — verifyOtp has set the session cookies. Use a hard
      // navigation so the middleware sees the new session on the very
      // first request to `next`.
      window.location.replace(next);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#F6F3EE] flex items-center justify-center p-6">
      <div className="bg-[#FFFDF9] rounded-2xl shadow-[0_0_48px_rgba(30,34,39,0.08)] p-8 max-w-md w-full text-center">
        {status === "verifying" ? (
          <>
            <Loader2 className="h-8 w-8 text-[#7FAEE6] animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#2B2B2B] mb-1">
              Confirming your email
            </h1>
            <p className="text-sm text-[#6F6A64]">
              Hang tight — we&apos;re logging you in.
            </p>
          </>
        ) : (
          <>
            <AlertCircle className="h-8 w-8 text-[#D5847A] mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#2B2B2B] mb-2">
              We couldn&apos;t confirm your email
            </h1>
            <p className="text-sm text-[#6F6A64] mb-6">{errorMsg}</p>
            <a
              href="/"
              className="inline-block bg-[#7FAEE6] text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all"
            >
              Back to home
            </a>
          </>
        )}
      </div>
    </div>
  );
}
