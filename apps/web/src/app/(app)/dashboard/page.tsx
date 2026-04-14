import { createClient } from "@/lib/db/server";
import { redirect } from "next/navigation";
import { getDashboardData, getWorkflows, getTodoTags } from "@/lib/db/actions";
import { DashboardStats } from "@/components/dashboard/stats";
import { DashboardTodayItems } from "@/components/dashboard/today-items";
import { DashboardImportantGoals } from "@/components/dashboard/important-goals";
import { DashboardFavoriteWorkflows } from "@/components/dashboard/favorite-workflows";
import { DashboardFavoriteMembers } from "@/components/dashboard/favorite-members";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

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

  return (
    <DashboardShell allItems={data.todayItems} highPriorityItems={data.highPriorityItems}>
      <div className="space-y-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[32px] font-semibold tracking-tight text-[#2B2B2B]">
            Dashboard
          </h1>
          <p className="text-sm text-[#9B948B]">
            Overview of today&apos;s progress, tasks, and team activity
          </p>
        </div>

        <DashboardStats stats={data.stats} workflows={allWorkflows} />
        <DashboardTodayItems
          items={data.todayItems}
          highPriorityItems={data.highPriorityItems}
          todoTags={todoTags.map(t => t.name)}
          goals={data.goalsWithPhases}
        />
        <DashboardImportantGoals goals={data.goalsWithPhases} />
        <DashboardFavoriteWorkflows workflows={data.workflows} allWorkflows={allWorkflows} />
        <DashboardFavoriteMembers />
      </div>
    </DashboardShell>
  );
}
