import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";

// POST /api/workflows/stop — request cancellation of a running workflow
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await request.json();
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the run belongs to this user and is currently running
  const { data: run } = await admin
    .from("workflow_runs")
    .select("id, user_id, status, workflow_id")
    .eq("id", runId)
    .single();

  if (!run || run.user_id !== user.id) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "running") {
    return NextResponse.json({ error: "Run is not active" }, { status: 400 });
  }

  // Set status to "cancelled" — the execute endpoint checks this between steps
  await admin
    .from("workflow_runs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", runId);

  await admin
    .from("workflows")
    .update({ status: "ready" })
    .eq("id", run.workflow_id);

  return NextResponse.json({ success: true });
}
