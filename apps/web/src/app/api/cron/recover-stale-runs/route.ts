import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { recoverRun } from "@/lib/workflows/recover-run";
import { resumeStuckRun } from "@/lib/workflows/resume-stuck-run";
import { retryRun } from "@/lib/workflows/retry-run";
import { isRetryableFailureKind } from "@/lib/workflows/classify-failure";
import type { WorkflowStepResult } from "@/lib/types/workflow";

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

  // Two pools to sweep:
  //   1. status='running' older than STALE_AFTER_MS — original target,
  //      Vercel function died mid-stream, recoverRun + resumeStuckRun.
  //   2. status='failed' with transient/unknown failureKind — newly
  //      added. Lets us auto-retry network-error type failures the
  //      client gave up on. Skipped for quota/auth/permanent kinds.
  const [{ data: stuckRunning, error: stuckErr }, { data: failedRetryable, error: failedErr }] =
    await Promise.all([
      admin
        .from("workflow_runs")
        .select("id, started_at, status, step_results")
        .eq("status", "running")
        .lt("started_at", cutoff)
        .order("started_at", { ascending: true })
        .limit(MAX_CANDIDATES),
      admin
        .from("workflow_runs")
        .select("id, started_at, status, step_results, completed_at, session_id")
        .eq("status", "failed")
        .lt("completed_at", cutoff)
        .not("session_id", "is", null)
        .order("started_at", { ascending: true })
        .limit(MAX_CANDIDATES),
    ]);

  if (stuckErr || failedErr) {
    const err = stuckErr || failedErr;
    console.error("[recover-stale-runs] Query failed:", err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }

  // Filter failed runs down to those with a retryable failureKind on
  // their first failed step. This is the gate that prevents auto-retry
  // from burning Anthropic budget on quota/auth/permanent failures.
  const retryableFailed = (failedRetryable || []).filter((r) => {
    const steps = (r.step_results as WorkflowStepResult[]) || [];
    const firstFailed = steps.find((s) => s.status === "failed");
    return firstFailed && isRetryableFailureKind(firstFailed.failureKind);
  });

  // Combined work list — process stuck "running" runs first since
  // those are higher-priority (currently visible to the user as
  // perpetually loading).
  const candidates: Array<{ id: string; mode: "stuck" | "retry" }> = [
    ...(stuckRunning || []).map((r) => ({ id: r.id, mode: "stuck" as const })),
    ...retryableFailed.map((r) => ({ id: r.id, mode: "retry" as const })),
  ];

  if (candidates.length === 0) {
    return NextResponse.json({ scanned: 0, recovered: 0, resumed: 0, retried: 0, failed: 0 });
  }

  console.log(
    `[recover-stale-runs] Found ${stuckRunning?.length || 0} stuck running + ${retryableFailed.length} retryable failed (skipped ${(failedRetryable?.length || 0) - retryableFailed.length} non-retryable failed) — sweeping`,
  );

  let scanned = 0;
  let recovered = 0;
  let resumed = 0;
  let retried = 0;
  let failed = 0;
  let deferred = 0;
  const results: Array<{
    runId: string;
    mode: "stuck" | "retry";
    recover?: string;
    resume?: string;
    retry?: string;
  }> = [];

  for (const cand of candidates) {
    const remainingMs = sweepDeadline - Date.now();
    if (remainingMs <= MIN_POLL_BUDGET_MS) {
      deferred = candidates.length - scanned;
      console.log(
        `[recover-stale-runs] Time budget exhausted, deferring ${deferred} run(s) to next sweep`,
      );
      break;
    }

    scanned++;
    const entry: typeof results[number] = { runId: cand.id, mode: cand.mode };

    try {
      if (cand.mode === "stuck") {
        // Stuck-running path: recoverRun pulls latest events, resumeStuckRun
        // kicks the next pending step.
        const recoverResult = await recoverRun(cand.id);
        if (recoverResult.recovered) {
          recovered++;
          entry.recover = `${recoverResult.status} (${recoverResult.stepsRecovered}/${recoverResult.filesRecovered})`;
        } else {
          entry.recover = recoverResult.reason === "error" ? recoverResult.message : recoverResult.reason;
        }

        const stillRunning =
          recoverResult.recovered && recoverResult.status === "running";
        if (stillRunning) {
          const remainingForResume = sweepDeadline - Date.now() - 5_000;
          const resumeResult = await resumeStuckRun(cand.id, {
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
      } else {
        // Retry-failed path: failed run with transient/unknown failure.
        // retryRun resets the failed step → "pending", flips run to
        // "running", then runs resumeStuckRun internally.
        const remainingForResume = sweepDeadline - Date.now() - 5_000;
        const retryResult = await retryRun(cand.id, {
          pollBudgetMs: Math.max(MIN_POLL_BUDGET_MS, remainingForResume),
        });
        if (retryResult.retried) {
          retried++;
          entry.retry = `step ${retryResult.stepIndex} ${retryResult.stepStatus}`;
        } else {
          failed++;
          entry.retry =
            retryResult.reason === "error"
              ? retryResult.message
              : retryResult.reason;
        }
      }
    } catch (err) {
      failed++;
      entry.recover = err instanceof Error ? err.message : "Unknown error";
    }
    results.push(entry);
  }

  const elapsedMs = Date.now() - sweepStart;
  console.log(
    `[recover-stale-runs] Done in ${(elapsedMs / 1000).toFixed(1)}s — scanned=${scanned} recovered=${recovered} resumed=${resumed} retried=${retried} failed=${failed} deferred=${deferred}`,
  );

  return NextResponse.json({
    scanned,
    recovered,
    resumed,
    retried,
    failed,
    deferred,
    elapsedMs,
    results,
  });
}
