"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { MetaPixel } from "@/components/meta-pixel";

const STORAGE_KEY = "yoboss_cookie_consent";

type Consent = "accepted" | "declined";

function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "accepted" || v === "declined" ? v : null;
}

// Sentry replay is a separate integration that we add only if the user
// accepts. Errors and basic perf are tracked unconditionally — that's
// "legitimate interest" under GDPR Art. 6(1)(f) for keeping the app
// running. The replay integration captures DOM (text already masked,
// media blocked) and is the part that benefits from explicit consent.
async function enableSentryReplay() {
  if (typeof window === "undefined") return;
  try {
    const Sentry = await import("@sentry/nextjs");
    const client = Sentry.getClient();
    if (!client) return;
    const integration = Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    });
    client.addIntegration(integration);
  } catch {
    // Non-blocking — replay is optional.
  }
}

export function CookieConsent() {
  const t = useTranslations("cookies");
  const [consent, setConsent] = useState<Consent | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = readConsent();
    setConsent(stored);
    setMounted(true);
    if (stored === "accepted") {
      enableSentryReplay();
    }
  }, []);

  const accept = () => {
    window.localStorage.setItem(STORAGE_KEY, "accepted");
    setConsent("accepted");
    enableSentryReplay();
  };

  const decline = () => {
    window.localStorage.setItem(STORAGE_KEY, "declined");
    setConsent("declined");
  };

  // SSR / pre-mount: render nothing to avoid hydration mismatch on the
  // banner itself. Analytics is also gated on mounted so it never runs
  // during the brief pre-decision window.
  if (!mounted) return null;

  return (
    <>
      {consent === "accepted" && (
        <>
          <Analytics />
          <MetaPixel />
        </>
      )}
      {consent === null && (
        <div
          role="dialog"
          aria-label={t("ariaLabel")}
          className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-2xl rounded-xl border border-[#E7DED2] bg-[#FFFDF9] shadow-lg p-4 sm:p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#2B2B2B]">
              {t("body")}{" "}
              <Link href="/privacy" className="text-[#007AFF] hover:underline">
                {t("learnMore")}
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={decline}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
              >
                {t("decline")}
              </button>
              <button
                type="button"
                onClick={accept}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#007AFF] text-white hover:bg-[#0066D6] transition-colors"
              >
                {t("accept")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
