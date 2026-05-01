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
    .select("id, user_id, name, schedule_cron, schedule_timezone, consecutive_quota_failures")
    .eq("schedule_enabled", true)
    .lte("schedule_next_run_at", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!dueWorkflows || dueWorkflows.length === 0) {
    return NextResponse.json({ triggered: 0 });
  }

  // Pre-flight quota check. Without this, every due workflow for a
  // budget-exhausted user would still hit /api/workflows/execute, walk
  // all the way through workflow load + run-record insert, and only then
  // get rejected. Cheaper to look up everyone's quota in one batched
  // query and skip the obviously-blocked workflows up front.
  const userIds = Array.from(new Set(dueWorkflows.map((w) => w.user_id)));
  const { data: quotas } = await supabase
    .from("user_quotas")
    .select("user_id, cost_this_month_cents, monthly_allowance_cents, credits_balance_cents")
    .in("user_id", userIds);

  const blockedUserIds = new Set<string>();
  for (const q of quotas || []) {
    const spent = q.cost_this_month_cents ?? 0;
    const allowance = q.monthly_allowance_cents ?? 500;
    const credits = q.credits_balance_cents ?? 0;
    if (spent >= allowance && credits <= 0) {
      blockedUserIds.add(q.user_id);
    }
  }

  const results = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const wf of dueWorkflows) {
    if (blockedUserIds.has(wf.user_id)) {
      // Mirror the strike + auto-disable behavior the execute path runs
      // when called directly, so the bookkeeping stays consistent whether
      // the block was caught here or downstream.
      const failures = (wf.consecutive_quota_failures ?? 0) + 1;
      const update: { consecutive_quota_failures: number; schedule_enabled?: boolean } = {
        consecutive_quota_failures: failures,
      };
      if (failures >= 3) update.schedule_enabled = false;
      await supabase.from("workflows").update(update).eq("id", wf.id);

      await supabase.from("workflow_runs").insert({
        workflow_id: wf.id,
        user_id: wf.user_id,
        status: "failed",
        current_step: 0,
        total_steps: 0,
        step_results: [],
        triggered_by: "scheduled",
        error: "Monthly allowance exhausted",
        completed_at: new Date().toISOString(),
      });

      await supabase.from("notifications").insert({
        user_id: wf.user_id,
        type: failures >= 3 ? "scheduled_run_disabled" : "scheduled_run_quota_exceeded",
        title:
          failures >= 3
            ? `${wf.name} schedule paused — out of credits`
            : `${wf.name} skipped — out of credits`,
        metadata: { workflowId: wf.id, consecutiveFailures: failures },
      });

      results.push({ workflowId: wf.id, status: "quota_skipped" });
    } else {
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
        // Surface the real reason — without this the cron returns
        // "trigger_error" with no clue whether it was network, parse,
        // or something Next runtime did to fetch.
        const message = err instanceof Error ? err.message : String(err);
        console.error("[cron/run-scheduled] fetch failed", { workflowId: wf.id, appUrl, message });
        results.push({ workflowId: wf.id, status: "trigger_error", error: message });
      }
    }

    // Always advance schedule_next_run_at even on skip — otherwise the
    // workflow stays "due" forever and gets re-attempted every cron tick.
    // Auto-pause (schedule_enabled = false) is the right place to actually
    // halt; the cron filter on schedule_enabled will then drop it.
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
