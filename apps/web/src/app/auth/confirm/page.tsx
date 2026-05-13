"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
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

function pickDestination(rawNext: string | null): string {
  if (rawNext) {
    if (rawNext.startsWith("/") && !rawNext.startsWith("//")) return rawNext;
    try {
      const url = new URL(rawNext);
      if (url.origin === window.location.origin) {
        return url.pathname + url.search + url.hash;
      }
    } catch {
      // Not a parseable URL — fall through.
    }
  }

  return "/dashboard";
}
export default function ConfirmEmailPage() {
  const t = useTranslations("authConfirm");
  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type") as EmailOtpType | null;
    const rawNext = params.get("next");

    if (!tokenHash || !type) {
      setStatus("error");
      setErrorMsg(t("errorMissing"));
      return;
    }

    const supabase = createClient();
    supabase.auth.verifyOtp({ type, token_hash: tokenHash }).then(({ error }) => {
      if (error) {
        const msg = error.message || "";
        let friendly = msg;
        if (/expired/i.test(msg)) {
          friendly = t("errorExpired");
        } else if (/invalid|consumed|used/i.test(msg)) {
          friendly = t("errorInvalid");
        }
        setStatus("error");
        setErrorMsg(friendly);
        return;
      }
      const dest = pickDestination(rawNext);
      window.location.replace(dest);
    });
  }, [t]);

  return (
    <div className="min-h-screen bg-[#FDFAF6] flex items-center justify-center p-6">
      <div className="bg-[#FFFFFF] rounded-2xl shadow-[0_0_48px_rgba(30,34,39,0.08)] p-8 max-w-md w-full text-center">
        {status === "verifying" ? (
          <>
            <Loader2 className="h-8 w-8 text-[#7C2DE8] animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#2B2B2B] mb-1">
              {t("verifyingTitle")}
            </h1>
            <p className="text-sm text-[#6F6A64]">
              {t("verifyingBody")}
            </p>
          </>
        ) : (
          <>
            <AlertCircle className="h-8 w-8 text-[#D5847A] mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#2B2B2B] mb-2">
              {t("errorTitle")}
            </h1>
            <p className="text-sm text-[#6F6A64] mb-6">{errorMsg}</p>
            <a
              href="/"
              className="inline-block bg-[#7C2DE8] text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-[#6921C7] active:scale-[0.98] transition-all"
            >
              {t("backHome")}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
