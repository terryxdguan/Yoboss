import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { recoverRun } from "@/lib/workflows/recover-run";

// Server-side sweeper for workflow runs whose Vercel function died
// mid-stream and never came back. Without this, anyone who closed the
// browser before the client-side stale-recovery in workflow-run-view
// could fire would have their run stuck "running" forever — and worse,
// any deliverable file produced after the function timeout would be
// silently lost when Anthropic Files retention expires (~30 days).
//
// Schedule: every 15 min via vercel.json. The Pro function ceiling is
// 800s (~13 min), so anything still flagged "running" past 30 min is
// definitely orphaned.

export const maxDuration = 300;

// Limit per invocation so a backlog can't blow past Vercel's per-cron
// time budget. With recovery taking ~5–15s per run (Anthropic events
// list + files list + DB writes), 20 runs ≈ 1.5–5 min — comfortable
// inside the 300s maxDuration.
const BATCH_SIZE = 20;

// "Stale" cutoff. Vercel Pro maxDuration = 800s, so a run still in
// "running" past this is definitely lost. Be generous to avoid racing
// healthy long runs.
const STALE_AFTER_MS = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const { data: staleRuns, error } = await admin
    .from("workflow_runs")
    .select("id, started_at")
    .eq("status", "running")
    .lt("started_at", cutoff)
    .order("started_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[recover-stale-runs] Query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staleRuns || staleRuns.length === 0) {
    return NextResponse.json({ scanned: 0, recovered: 0, failed: 0 });
  }

  console.log(`[recover-stale-runs] Found ${staleRuns.length} stale run(s) — sweeping`);

  // Recover sequentially. Parallel would be faster but stresses
  // Anthropic's session events API more than necessary; this cron has
  // 5 min of budget for a 20-run batch and that's plenty.
  let recovered = 0;
  let failed = 0;
  const results: Array<{
    runId: string;
    status: "recovered" | "failed";
    detail?: string;
  }> = [];

  for (const run of staleRuns) {
    try {
      const result = await recoverRun(run.id);
      if (result.recovered) {
        recovered++;
        results.push({
          runId: run.id,
          status: "recovered",
          detail: `${result.status} (${result.stepsRecovered} steps, ${result.filesRecovered} files)`,
        });
      } else {
        failed++;
        results.push({
          runId: run.id,
          status: "failed",
          detail: result.reason === "error" ? result.message : result.reason,
        });
      }
    } catch (err) {
      // recoverRun already does its own error handling and DB updates,
      // but defend against an unexpected throw bubbling out.
      failed++;
      results.push({
        runId: run.id,
        status: "failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  console.log(
    `[recover-stale-runs] Done — scanned=${staleRuns.length} recovered=${recovered} failed=${failed}`,
  );

  return NextResponse.json({
    scanned: staleRuns.length,
    recovered,
    failed,
    results,
  });
}
