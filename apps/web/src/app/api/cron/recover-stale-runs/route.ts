import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { recoverRun } from "@/lib/workflows/recover-run";
import { resumeStuckRun } from "@/lib/workflows/resume-stuck-run";

// Server-side sweeper for workflow runs whose Vercel function died
// mid-stream and never came back. Two passes per run:
//
// 1. recoverRun(id) — pull latest session events from Anthropic, merge
//    completed step output + files into step_results, mark steps as
//    success/failed when their idle event was observed. Status stays
//    "running" if any step is still pending.
//
// 2. resumeStuckRun(id) — if any step is still pending after recover,
//    send the user.message to kick the next pending step on Anthropic
//    side, poll for as long as our cron budget allows, persist what
//    we get. Protected by a row-level lock so concurrent sweepers
//    (and a returning client) don't double-fire.
//
// Without this, anyone who closed the browser before the client-side
// stale-recovery in workflow-run-view could fire would have their run
// stuck "running" forever — and any deliverable file produced after
// the function timeout would be silently lost when Anthropic Files
// retention expired (~30 days).

// Pro plan ceiling. We want as much budget as possible because a single
// stuck step can take up to ~13 min on Anthropic side (real research +
// code_execution workflows hit this). With less budget we'd ship the
// user.message and bail before idle, then have to wait a full sweep
// interval for recoverRun to detect the idle event — slow and visible
// in the UI.
export const maxDuration = 800;

// Reserve some headroom at the end of each sweep for DB writes + the
// final response. If we hit this threshold while iterating runs, we
// stop and defer the rest to the next 15-min sweep.
const SWEEP_BUFFER_MS = 30 * 1000;

// Floor on per-run polling budget. If the time remaining in the sweep
// is below this, don't start a new resume — just send the user.message
// and let the next sweep pick up. Avoids wasting work on a too-short
// poll attempt.
const MIN_POLL_BUDGET_MS = 60 * 1000;

// Pull more candidates than we'll likely process in one sweep; iteration
// exits early on the time-budget check, so any unhandled runs roll into
// the next sweep.
const MAX_CANDIDATES = 20;

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
  const sweepStart = Date.now();
  const sweepDeadline = sweepStart + (maxDuration * 1000 - SWEEP_BUFFER_MS);

  const { data: staleRuns, error } = await admin
    .from("workflow_runs")
    .select("id, started_at")
    .eq("status", "running")
    .lt("started_at", cutoff)
    .order("started_at", { ascending: true })
    .limit(MAX_CANDIDATES);

  if (error) {
    console.error("[recover-stale-runs] Query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staleRuns || staleRuns.length === 0) {
    return NextResponse.json({ scanned: 0, recovered: 0, resumed: 0, failed: 0 });
  }

  console.log(`[recover-stale-runs] Found ${staleRuns.length} stale run(s) — sweeping`);

  let scanned = 0;
  let recovered = 0;
  let resumed = 0;
  let failed = 0;
  let deferred = 0;
  const results: Array<{
    runId: string;
    recover?: string;
    resume?: string;
  }> = [];

  for (const run of staleRuns) {
    const remainingMs = sweepDeadline - Date.now();
    if (remainingMs <= MIN_POLL_BUDGET_MS) {
      // Out of budget — defer remaining runs to the next 15-min sweep.
      deferred = staleRuns.length - scanned;
      console.log(
        `[recover-stale-runs] Time budget exhausted, deferring ${deferred} run(s) to next sweep`,
      );
      break;
    }

    scanned++;
    const entry: { runId: string; recover?: string; resume?: string } = { runId: run.id };
    try {
      // Pass 1: pull state from Anthropic events. Fast (~5-15s); time
      // budget check skipped here.
      const recoverResult = await recoverRun(run.id);
      if (recoverResult.recovered) {
        recovered++;
        entry.recover = `${recoverResult.status} (${recoverResult.stepsRecovered}/${recoverResult.filesRecovered})`;
      } else {
        entry.recover = recoverResult.reason === "error" ? recoverResult.message : recoverResult.reason;
      }

      // Pass 2: if recoverRun left status="running" (i.e. there's still
      // a pending step), kick that step. Hand it whatever budget we
      // have left — this lets a single long-step run consume most of
      // the cron's budget when it needs to. resumeStuckRun is a no-op
      // when the run has reached a terminal state.
      const stillRunning =
        recoverResult.recovered && recoverResult.status === "running";
      if (stillRunning) {
        const remainingForResume = sweepDeadline - Date.now() - 5_000; // leave 5s for DB writes
        const resumeResult = await resumeStuckRun(run.id, {
          pollBudgetMs: Math.max(MIN_POLL_BUDGET_MS, remainingForResume),
        });
        if (resumeResult.resumed) {
          resumed++;
          entry.resume = `step ${resumeResult.stepIndex} ${resumeResult.stepStatus}`;
        } else {
          entry.resume = resumeResult.reason === "error" ? resumeResult.message : resumeResult.reason;
        }
      }

      if (!recoverResult.recovered && !stillRunning) failed++;
    } catch (err) {
      failed++;
      entry.recover = err instanceof Error ? err.message : "Unknown error";
    }
    results.push(entry);
  }

  const elapsedMs = Date.now() - sweepStart;
  console.log(
    `[recover-stale-runs] Done in ${(elapsedMs / 1000).toFixed(1)}s — scanned=${scanned} recovered=${recovered} resumed=${resumed} failed=${failed} deferred=${deferred}`,
  );

  return NextResponse.json({
    scanned,
    recovered,
    resumed,
    failed,
    deferred,
    elapsedMs,
    results,
  });
}
