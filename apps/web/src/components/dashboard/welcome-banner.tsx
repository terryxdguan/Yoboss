"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import type { DashboardOnboarding } from "@/lib/db/actions";

interface WelcomeBannerProps {
  onboarding: DashboardOnboarding;
  /** Stage 3's CTA opens the existing Add To-Do modal in place. The
   *  parent (DashboardTodayItems) owns that modal state and exposes
   *  this opener via context. Banner just calls it. */
  onOpenAddTodo: () => void;
}

interface StageContent {
  title: string;
  subtitle: string;
  ctaLabel: string;
  onClick: () => void;
}

export function WelcomeBanner({ onboarding, onOpenAddTodo }: WelcomeBannerProps) {
  const router = useRouter();
  const t = useTranslations("dashboard.welcomeBanner");

  if (onboarding.stage === "done") return null;

  const content: StageContent = (() => {
    switch (onboarding.stage) {
      case "stage1":
        return {
          title: t("stage1Title"),
          subtitle: t("stage1Subtitle"),
          ctaLabel: t("stage1Cta"),
          onClick: () => router.push("/goals"),
        };
      case "stage2":
        return {
          title: t("stage2Title"),
          subtitle: t("stage2Subtitle"),
          ctaLabel: t("stage2Cta"),
          onClick: () => {
            // Smart route: 1 goal → that goal's detail page (where the
            // weekly-planning wizard button lives); 2+ goals → /goals
            // list so user picks which one to plan.
            if (onboarding.singleGoalId) {
              router.push(`/goals/${onboarding.singleGoalId}`);
            } else {
              router.push("/goals");
            }
          },
        };
      case "stage3":
        return {
          title: t("stage3Title"),
          subtitle: t("stage3Subtitle"),
          ctaLabel: t("stage3Cta"),
          onClick: onOpenAddTodo,
        };
    }
  })();

  return (
    <div className="rounded-2xl bg-[#E6F2FF] border border-[#007AFF]/30 px-6 py-5 flex items-center gap-6 shadow-[0_4px_16px_rgba(0,122,255,0.10)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#007AFF]/15 shrink-0">
        <Sparkles className="h-5 w-5 text-[#007AFF]" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold text-[#2B2B2B]">{content.title}</h3>
        <p className="text-sm text-[#6F6A64] mt-0.5">{content.subtitle}</p>
      </div>
      <button
        onClick={content.onClick}
        className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#007AFF] text-white text-sm font-semibold hover:bg-[#0066D6] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(0,122,255,0.35)]"
      >
        {content.ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
