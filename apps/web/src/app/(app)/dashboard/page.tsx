import { createClient } from "@/lib/db/server";
import { redirect } from "next/navigation";
import { getDashboardData, getWorkflows, getTodoTags } from "@/lib/db/actions";
import { DashboardStats } from "@/components/dashboard/stats";
import { DashboardTodayItems } from "@/components/dashboard/today-items";
import { DashboardActiveGoals } from "@/components/dashboard/active-goals";
import { DashboardTeam } from "@/components/dashboard/team";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { WelcomeBannerHost } from "@/components/dashboard/welcome-banner-host";
import { OnboardingDashboard } from "@/components/dashboard/onboarding-dashboard";
import { OnboardingCelebrationModal } from "@/components/dashboard/onboarding-celebration-modal";

// Opt out of Next.js router cache and static generation. Every visit to
// /dashboard re-runs getDashboardData() / getWorkflows() / getTodoTags() on
// the server so the stat cards (Goals, To-Dos, Workflows, Team) always
// reflect the latest DB state. Without this, client-side navigation from
// another page may serve a stale cached snapshot — e.g. a todo you deleted
// in /todos would still be counted in the TO-DOS card here.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const [data, allWorkflows, todoTags] = await Promise.all([
    getDashboardData(),
    getWorkflows(),
    getTodoTags(),
  ]);

  // Pre-onboarding users (any of the three setup steps still missing) get
  // the guided dashboard. Once all three are present, fall through to the
  // regular dashboard. The OnboardingCelebrationModal pops once when the
  // user transitions from onboarding → done (via a sessionStorage flag set
  // by OnboardingDashboard).
  if (data.onboarding.stage !== "done") {
    return <OnboardingDashboard onboarding={data.onboarding} />;
  }

  return (
    <DashboardShell allItems={data.todayItems} highPriorityItems={data.highPriorityItems}>
      <OnboardingCelebrationModal />
      <div className="space-y-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[32px] font-semibold tracking-tight text-[#2B2B2B]">
            Dashboard
          </h1>
          <p className="text-sm text-[#9B948B]">
            Overview of today&apos;s progress, tasks, and team activity
          </p>
        </div>

        <WelcomeBannerHost onboarding={data.onboarding} />

        <DashboardStats stats={data.stats} workflows={allWorkflows} />
        <DashboardTodayItems
          items={data.todayItems}
          highPriorityItems={data.highPriorityItems}
          todoTags={todoTags.map(t => t.name)}
          goals={data.goalsWithPhases}
        />
        <DashboardActiveGoals goals={data.goalsWithPhases} />
        <DashboardTeam />
      </div>
    </DashboardShell>
  );
}
