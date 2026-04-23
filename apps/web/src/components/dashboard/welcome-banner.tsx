"use client";

import { useRouter } from "next/navigation";
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

  if (onboarding.stage === "done") return null;

  const content: StageContent = (() => {
    switch (onboarding.stage) {
      case "stage1":
        return {
          title: "Welcome to YoBoss",
          subtitle:
            "Let's set up your first goal — describe what you want to achieve and your team takes it from there.",
          ctaLabel: "Create your first goal",
          onClick: () => router.push("/goals/create"),
        };
      case "stage2":
        return {
          title: "One goal set. Let's plan this week.",
          subtitle:
            "Turn your goal into a concrete weekly schedule your team can execute alongside you.",
          ctaLabel: "Plan your first week",
          onClick: () => {
            // Smart route: 1 goal → that goal's plan-week directly;
            // 2+ goals → /goals list so user picks which one to plan.
            if (onboarding.singleGoalId) {
              router.push(`/goals/${onboarding.singleGoalId}/plan-week`);
            } else {
              router.push("/goals");
            }
          },
        };
      case "stage3":
        return {
          title: "Your week is planned.",
          subtitle:
            "Keep momentum with a quick to-do for today — the little things that fall outside weekly plans.",
          ctaLabel: "Create your first to-do",
          onClick: onOpenAddTodo,
        };
    }
  })();

  return (
    <div className="rounded-2xl bg-[#EAF3FD] border border-[#7FAEE6]/30 px-6 py-5 flex items-center gap-6 shadow-[0_4px_16px_rgba(127,174,230,0.10)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7FAEE6]/15 shrink-0">
        <Sparkles className="h-5 w-5 text-[#7FAEE6]" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold text-[#2B2B2B]">{content.title}</h3>
        <p className="text-sm text-[#6F6A64] mt-0.5">{content.subtitle}</p>
      </div>
      <button
        onClick={content.onClick}
        className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(127,174,230,0.35)]"
      >
        {content.ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
