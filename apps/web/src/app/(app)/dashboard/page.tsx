import { createClient } from "@/lib/db/server";
import { redirect } from "next/navigation";
import { DashboardStats } from "@/components/dashboard/stats";
import { DashboardTodos } from "@/components/dashboard/todos";
import { DashboardTeam } from "@/components/dashboard/team";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-[#1E2227]">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-[#626A73]">
          Overview of today&apos;s progress, tasks, and team activity
        </p>
      </div>

      <DashboardStats />
      <DashboardTodos />
      <DashboardTeam />
    </div>
  );
}
