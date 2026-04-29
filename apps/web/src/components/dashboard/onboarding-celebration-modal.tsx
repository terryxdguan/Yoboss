"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { ONBOARDING_ACTIVE_KEY } from "@/components/dashboard/onboarding-dashboard";

// Pops once when the user lands on the regular dashboard with the
// "was-in-onboarding" flag set in sessionStorage. Reads the flag on
// mount, shows the modal, and clears the flag so subsequent visits
// don't re-trigger.
export function OnboardingCelebrationModal() {
  const t = useTranslations("dashboard.celebration");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = false;
    try {
      active = window.sessionStorage.getItem(ONBOARDING_ACTIVE_KEY) === "1";
      if (active) window.sessionStorage.removeItem(ONBOARDING_ACTIVE_KEY);
    } catch {
      // sessionStorage unavailable — silently skip.
    }
    if (active) setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-[#FFFDF9] p-8 text-center shadow-[0_24px_64px_rgba(30,34,39,0.18)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E6F2FF] text-[#007AFF]">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-semibold text-[#2B2B2B]">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6F6A64]">
          {t("body")}
        </p>
        <button
          onClick={() => setOpen(false)}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-[#007AFF] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0066D6]"
        >
          {t("cta")}
        </button>
      </div>
    </div>
  );
}
