import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { recoverRun } from "@/lib/workflows/recover-run";

/**
 * POST /api/workflows/recover
 * User-triggered run recovery. The actual recovery logic lives in
 * lib/workflows/recover-run.ts so the cron sweeper can share it.
 *
 * Two modes (passed straight through to recoverRun):
 * 1. Default — recover a "running" run that hasn't updated in a while
 *    (e.g. Vercel function timed out mid-step).
 * 2. force=true — re-pull files for a run that's already in a terminal
 *    state, useful when the agent finished but its last file write
 *    didn't make it back into our DB.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId, force } = await request.json();
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  // Ownership check before delegating to the shared recovery — we don't
  // want a user to be able to recover other users' runs even though the
  // shared function uses admin client internally.
  const admin = createAdminClient();
  const { data: ownership } = await admin
    .from("workflow_runs")
    .select("user_id")
    .eq("id", runId)
    .single();

  if (!ownership || ownership.user_id !== user.id) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const result = await recoverRun(runId, { force: !!force });

  if (result.recovered) {
    return NextResponse.json({
      recovered: true,
      status: result.status,
      stepsRecovered: result.stepsRecovered,
      filesRecovered: result.filesRecovered,
    });
  }

  // Map structured failure reasons back to the error shapes the existing
  // clients expect.
  if (result.reason === "not_stale") {
    return NextResponse.json({
      error:
        'Run is not stale. Pass {force:true} to re-pull files for a run already marked terminal (e.g. "success" but missing deliverables).',
      status: result.runStatus,
    });
  }
  if (result.reason === "no_session") {
    return NextResponse.json({ recovered: false, reason: "No session ID" });
  }
  return NextResponse.json({
    recovered: false,
    error: result.message || "Recovery failed",
  });
}
