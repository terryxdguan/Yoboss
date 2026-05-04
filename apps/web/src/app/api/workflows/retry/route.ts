import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { retryRun } from "@/lib/workflows/retry-run";

// User-triggered retry of a failed workflow run. Differs from the
// recover-stale-runs cron in that:
//   - allows force=true to retry quota/permanent failures (cron never
//     does — it would just re-fail)
//   - runs synchronously so the click → result feedback is immediate
//     (cron returns immediately and lets the next 15-min sweep verify)
//
// 800s budget so a single long-step retry doesn't get its own polling
// cut short. Same pattern as agent-run-step / workflows/execute.
export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId, force } = await request.json();
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  // Ownership check before delegating to the shared retry logic
  // (which uses admin client internally).
  const admin = createAdminClient();
  const { data: ownership } = await admin
    .from("workflow_runs")
    .select("user_id")
    .eq("id", runId)
    .single();
  if (!ownership || ownership.user_id !== user.id) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Leave 30s headroom inside the 800s function budget for DB writes
  // + final JSON response. resumeStuckRun receives the rest as its
  // polling deadline.
  const pollBudgetMs = 770 * 1000;

  const result = await retryRun(runId, { force: !!force, pollBudgetMs });

  if (result.retried) {
    return NextResponse.json({
      retried: true,
      stepIndex: result.stepIndex,
      stepStatus: result.stepStatus,
      durationMs: result.durationMs,
    });
  }

  // Map structured failures to clearer client errors.
  if (result.reason === "blocked_by_failure_kind") {
    const kind = result.failureKind || "unknown";
    const message =
      kind === "quota"
        ? "Cannot retry: monthly allowance exhausted. Buy credits or upgrade your plan first."
        : kind === "auth"
          ? "Cannot retry: session expired. Please sign in again."
          : kind === "permanent"
            ? "Cannot retry: this step failed for a non-retryable reason (e.g. content policy). Edit the workflow before re-running."
            : "Cannot retry this step.";
    return NextResponse.json(
      { retried: false, reason: result.reason, failureKind: kind, error: message },
      { status: 409 },
    );
  }

  if (result.reason === "lock_held") {
    return NextResponse.json(
      { retried: false, reason: result.reason, error: "A retry is already in progress for this run." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { retried: false, reason: result.reason, error: result.message || result.reason },
    { status: result.reason === "not_found" ? 404 : 400 },
  );
}
