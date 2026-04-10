import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getNextRunAt } from "@/lib/utils/schedule";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: dueWorkflows, error } = await supabase
    .from("workflows")
    .select("id, user_id, name, schedule_cron, schedule_timezone")
    .eq("schedule_enabled", true)
    .lte("schedule_next_run_at", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!dueWorkflows || dueWorkflows.length === 0) {
    return NextResponse.json({ triggered: 0 });
  }

  const results = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const wf of dueWorkflows) {
    try {
      const res = await fetch(`${appUrl}/api/workflows/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({
          workflowId: wf.id,
          userId: wf.user_id,
          triggeredBy: "scheduled",
        }),
      });

      const result = await res.json();
      results.push({ workflowId: wf.id, status: result.status });
    } catch (err) {
      results.push({ workflowId: wf.id, status: "trigger_error" });
    }

    try {
      const nextRun = getNextRunAt(wf.schedule_cron, wf.schedule_timezone || "UTC");
      await supabase
        .from("workflows")
        .update({ schedule_next_run_at: nextRun })
        .eq("id", wf.id);
    } catch {
      await supabase
        .from("workflows")
        .update({ schedule_enabled: false })
        .eq("id", wf.id);
    }
  }

  return NextResponse.json({ triggered: results.length, results });
}
