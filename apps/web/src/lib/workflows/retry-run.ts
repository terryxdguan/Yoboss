// Shared logic for "user clicks Retry" and "cron auto-resumes a failed
// run". Both want the same operation:
//
//   1. Find the failed step
//   2. Confirm its failureKind allows retry (or force=true)
//   3. Reset that step → "pending" + clear error
//   4. Reset run.status → "running" + clear completed_at
//   5. Hand off to resumeStuckRun() to actually run it
//
// Caller is responsible for authorization (the API route checks
// ownership; the cron uses CRON_SECRET).

import { createAdminClient } from "@/lib/db/admin";
import { resumeStuckRun, type ResumeResult } from "./resume-stuck-run";
import { isRetryableFailureKind } from "./classify-failure";
import type { WorkflowStepResult, StepFailureKind } from "@/lib/types/workflow";

export interface RetryOptions {
  /** Override the failureKind retryability check. Used by the user-
   *  triggered retry endpoint when they explicitly want to bang on a
   *  quota/permanent failure (which usually fails again — but they're
   *  consenting). Cron path leaves this false. */
  force?: boolean;
  /** Forwarded to resumeStuckRun.pollBudgetMs. */
  pollBudgetMs?: number;
}

export type RetryResult =
  | {
      retried: true;
      stepIndex: number;
      stepStatus: "success" | "running";
      durationMs: number;
    }
  | {
      retried: false;
      reason:
        | "not_found"
        | "no_session"
        | "no_failed_step"
        | "blocked_by_failure_kind"
        | "lock_held"
        | "error";
      failureKind?: StepFailureKind;
      message?: string;
    };

export async function retryRun(
  runId: string,
  options: RetryOptions = {},
): Promise<RetryResult> {
  const { force = false, pollBudgetMs } = options;
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .single();
  if (!run) return { retried: false, reason: "not_found" };
  if (!run.session_id) return { retried: false, reason: "no_session" };

  const stepResults = (run.step_results as WorkflowStepResult[]) || [];
  const failedIdx = stepResults.findIndex((s) => s.status === "failed");
  if (failedIdx === -1) {
    // No failed step. Maybe a pending step exists from a different
    // failure mode — still considered "no failed step to retry".
    return { retried: false, reason: "no_failed_step" };
  }

  const failed = stepResults[failedIdx];
  if (!force && !isRetryableFailureKind(failed.failureKind)) {
    return {
      retried: false,
      reason: "blocked_by_failure_kind",
      failureKind: failed.failureKind,
    };
  }

  // Reset that step → "pending", clear error markers. Keep partial
  // output / files if the previous attempt produced any (they may be
  // useful even if the step ultimately failed).
  stepResults[failedIdx] = {
    ...failed,
    status: "pending",
    error: undefined,
    failureKind: undefined,
  };

  await admin
    .from("workflow_runs")
    .update({
      status: "running",
      step_results: stepResults,
      completed_at: null,
      current_step: failedIdx,
    })
    .eq("id", runId);

  // Workflow row should match — clear last_run_status so it doesn't
  // linger on the dashboard as "last run failed".
  await admin
    .from("workflows")
    .update({ status: "ready" })
    .eq("id", run.workflow_id);

  console.log(
    `[RetryRun] Run ${runId} step ${failedIdx} reset → running. force=${force} prevKind=${failed.failureKind}`,
  );

  // Hand off to resumeStuckRun — it acquires the row lock so a parallel
  // cron sweep won't double-fire on the same step.
  const resumeResult: ResumeResult = await resumeStuckRun(runId, {
    pollBudgetMs,
  });

  if (!resumeResult.resumed) {
    return {
      retried: false,
      reason: resumeResult.reason === "lock_held" ? "lock_held" : "error",
      message:
        "message" in resumeResult ? resumeResult.message : resumeResult.reason,
    };
  }

  return {
    retried: true,
    stepIndex: resumeResult.stepIndex,
    stepStatus: resumeResult.stepStatus,
    durationMs: resumeResult.durationMs,
  };
}
