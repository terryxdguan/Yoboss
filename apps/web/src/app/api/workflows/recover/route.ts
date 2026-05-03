import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, listSessionFiles } from "@/lib/ai/client";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type { WorkflowStepResult } from "@/lib/types/workflow";

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

/**
 * POST /api/workflows/recover
 * Auto-recover a workflow run by pulling results from the Anthropic session.
 *
 * Two modes:
 * 1. Default — recover a "running" run that hasn't updated in a while
 *    (e.g. Vercel function timed out mid-step). Status will be set
 *    based on what the session events show.
 * 2. force=true — re-pull files for a run that's already in a terminal
 *    state (success/failed/cancelled). Use case: agent's last polling
 *    pass was killed by Vercel maxDuration just before the file was
 *    written to Anthropic Files API, so the run got marked "success"
 *    but with zero deliverables. Force mode merges newly-discovered
 *    files into step_results without altering existing status/output.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId, force } = await request.json();
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

  if (run.status !== "running" && !force) {
    return NextResponse.json({
      error: "Run is not stale. Pass {force:true} to re-pull files for a run already marked terminal (e.g. \"success\" but missing deliverables).",
      status: run.status,
    });
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

    // Update step results.
    //
    // Files are merged ADDITIVELY for every step — even already-successful
    // ones — because the only reason force-recovery exists is "step
    // finished, file appeared on Anthropic side, but our DB never
    // recorded it". Keeping the old guard here would drop those files
    // on the floor.
    //
    // Status / output / toolActivity are NOT overwritten on already-
    // successful steps; the existing values are typically richer than
    // a re-fetch (e.g. partial text already streamed at original run
    // time). Only fill them in for steps that still look unfinished.
    for (let i = 0; i < stepResults.length; i++) {
      if (i > currentStep) break; // Step never started

      const text = stepTexts[i]?.join("") || "";
      const tools = stepTools[i] || [];
      const newFilesForStep = filesPerStep[i] || [];

      // Always merge in any newly-discovered files for this step.
      if (newFilesForStep.length > 0) {
        stepResults[i] = {
          ...stepResults[i],
          files: [...(stepResults[i].files || []), ...newFilesForStep],
        };
      }

      // Only re-derive status/output for steps that didn't complete
      // before. Already-terminal steps keep their existing values.
      const isUnfinished = stepResults[i].status === "running" || stepResults[i].status === "pending";
      if (isUnfinished || !stepResults[i].output) {
        stepResults[i] = {
          ...stepResults[i],
          status: i < idleCount ? "success" : (text.length > 0 ? "success" : "failed"),
          output: text || stepResults[i].output || "(Recovered — check Deliverables for files)",
          toolActivity: tools.length > 0 ? tools : stepResults[i].toolActivity,
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

    // Only downgrade to "failed" if the run was actively stuck "running"
    // when we started. For force-recovery on a run that was already
    // terminal (success/failed/cancelled), leave its status alone — a
    // transient Anthropic API blip during file-merge shouldn't nuke a
    // "complete" run back to "failed".
    if (run.status === "running") {
      await admin.from("workflow_runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
      await admin.from("workflows").update({ status: "ready" }).eq("id", run.workflow_id);
    }

    return NextResponse.json({
      recovered: false,
      error: err instanceof Error ? err.message : "Recovery failed",
    });
  }
}
