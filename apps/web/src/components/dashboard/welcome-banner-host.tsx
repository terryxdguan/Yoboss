"use client";

import { WelcomeBanner } from "./welcome-banner";
import { useDashboardAddTodo } from "./dashboard-shell";
import type { DashboardOnboarding } from "@/lib/db/actions";

interface WelcomeBannerHostProps {
  onboarding: DashboardOnboarding;
}

export function WelcomeBannerHost({ onboarding }: WelcomeBannerHostProps) {
  const openAddTodo = useDashboardAddTodo();
  return (
    <WelcomeBanner
      onboarding={onboarding}
      onOpenAddTodo={openAddTodo ?? (() => {})}
    />
  );
}
