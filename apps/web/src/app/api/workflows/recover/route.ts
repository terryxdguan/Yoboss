import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, listSessionFiles } from "@/lib/ai/client";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type { WorkflowStepResult } from "@/lib/types/workflow";

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

/**
 * POST /api/workflows/recover
 * Auto-recover a stale workflow run by pulling results from the Anthropic session.
 * Called when a run has been "running" for >20 min without DB updates.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await request.json();
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  const admin = createAdminClient();

  // Fetch the run
  const { data: run } = await admin
    .from("workflow_runs")
    .select("*, workflows(*)")
    .eq("id", runId)
    .single();

  if (!run || run.user_id !== user.id) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "running") {
    return NextResponse.json({ error: "Run is not stale", status: run.status });
  }

  if (!run.session_id) {
    // No session — mark as failed
    await admin.from("workflow_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    await admin.from("workflows").update({ status: "ready" }).eq("id", run.workflow_id);
    return NextResponse.json({ recovered: false, reason: "No session ID" });
  }

  console.log(`[Recovery] Recovering run ${runId} from session ${run.session_id}`);

  try {
    const client = getAnthropicClient();
    const workflow = run.workflows;
    const steps = (workflow?.steps || []) as { id: string; agentId: string; prompt: string }[];
    const stepResults: WorkflowStepResult[] = run.step_results;

    // Get all session events
    const events = await client.beta.sessions.events.list(run.session_id, { limit: 500, order: "asc" });

    // Parse events: split by user.message (each = one step) and session.status_idle (step end)
    let currentStep = -1;
    const stepTexts: string[][] = []; // stepTexts[i] = array of text chunks
    const stepTools: { type: string; label: string }[][] = [];
    let idleCount = 0;

    for (const event of events.data) {
      if (event.type === "user.message") {
        currentStep++;
        stepTexts[currentStep] = [];
        stepTools[currentStep] = [];
      } else if (event.type === "agent.message" && currentStep >= 0) {
        for (const block of (event as { content: { type: string; text?: string }[] }).content) {
          if (block.type === "text" && block.text) {
            stepTexts[currentStep].push(block.text);
          }
        }
      } else if (event.type === "agent.tool_use" && currentStep >= 0) {
        const name = (event as { name: string }).name;
        const label = name === "web_search" ? "Searching the web..."
          : name === "bash" ? "Running code..."
          : name === "write" ? "Writing file..."
          : name === "web_fetch" ? "Fetching web page..."
          : `Using ${name}...`;
        stepTools[currentStep].push({ type: name.includes("web") ? "web_search" : "code_execution", label });
      } else if (event.type === "session.status_idle") {
        const stopReason = (event as { stop_reason?: { type: string } }).stop_reason;
        if (stopReason?.type === "requires_action") continue;
        idleCount++;
      }
    }

    console.log(`[Recovery] Found ${currentStep + 1} steps, ${idleCount} idle events`);

    // Get all files from the session
    const sessionFiles = await listSessionFiles(run.session_id);
    const allFiles = sessionFiles.map(f => ({ fileId: f.id, filename: f.filename }));
    console.log(`[Recovery] Found ${allFiles.length} files`);

    // Assign files to steps heuristically (files created during each step)
    // Simple approach: distribute based on step count
    const filesPerStep: { fileId: string; filename: string }[][] = [];
    for (let i = 0; i <= currentStep; i++) filesPerStep.push([]);

    // Known file IDs from existing step results
    const knownFileIds = new Set<string>();
    for (const sr of stepResults) {
      if (sr.files) sr.files.forEach(f => knownFileIds.add(f.fileId));
    }

    // Assign new files to the last completed step (most likely producer)
    const newFiles = allFiles.filter(f => !knownFileIds.has(f.fileId));
    // Find the last step that completed (has idle event)
    const lastCompletedStep = Math.min(idleCount - 1, currentStep);
    if (lastCompletedStep >= 0 && newFiles.length > 0) {
      filesPerStep[lastCompletedStep] = newFiles;
    }

    // Update step results
    for (let i = 0; i < stepResults.length; i++) {
      if (i > currentStep) break; // Step never started

      const text = stepTexts[i]?.join("") || "";
      const tools = stepTools[i] || [];

      // Only update steps that are still "running" or "pending" with no output
      if (stepResults[i].status === "running" || (stepResults[i].status === "pending") || !stepResults[i].output) {
        stepResults[i] = {
          ...stepResults[i],
          status: i < idleCount ? "success" : (text.length > 0 ? "success" : "failed"),
          output: text || stepResults[i].output || "(Recovered — check Deliverables for files)",
          toolActivity: tools.length > 0 ? tools : stepResults[i].toolActivity,
          files: filesPerStep[i]?.length > 0 ? [...(stepResults[i].files || []), ...filesPerStep[i]] : stepResults[i].files,
        };
      }
    }

    // Determine overall status
    const allDone = stepResults.every(s => s.status === "success");
    const anyFailed = stepResults.some(s => s.status === "failed");
    const finalStatus = allDone ? "success" : anyFailed ? "failed" : "success";

    // Write back to DB
    await admin.from("workflow_runs").update({
      status: finalStatus,
      current_step: Math.min(currentStep + 1, steps.length),
      step_results: stepResults,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    await admin.from("workflows").update({
      status: "ready",
      last_run_at: new Date().toISOString(),
      last_run_status: finalStatus,
    }).eq("id", run.workflow_id);

    console.log(`[Recovery] ✅ Run ${runId} recovered as "${finalStatus}"`);

    return NextResponse.json({
      recovered: true,
      status: finalStatus,
      stepsRecovered: stepResults.filter(s => s.status === "success").length,
      filesRecovered: newFiles.length,
    });
  } catch (err) {
    console.error("[Recovery] Failed:", err);

    // Mark as failed so it doesn't stay stuck
    await admin.from("workflow_runs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    await admin.from("workflows").update({ status: "ready" }).eq("id", run.workflow_id);

    return NextResponse.json({
      recovered: false,
      error: err instanceof Error ? err.message : "Recovery failed",
    });
  }
}
