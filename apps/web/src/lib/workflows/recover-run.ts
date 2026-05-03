// Shared workflow-run recovery core. Two callers:
//
// 1. POST /api/workflows/recover — user-triggered, after we've already
//    authenticated the user and verified ownership of the run.
// 2. GET /api/cron/recover-stale-runs — server-side sweeper for runs
//    whose Vercel function died mid-stream and never came back.
//
// This function trusts that the caller has already done the relevant
// authorization checks (does the runId belong to this user / are we a
// trusted cron). It uses the admin client throughout because workflow
// runs need to be readable + writable regardless of RLS state.
//
// Behavior parity with the previous inline implementation in
// app/api/workflows/recover/route.ts — that route now just delegates
// here.

import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, listSessionFiles } from "@/lib/ai/client";
import type { WorkflowStepResult } from "@/lib/types/workflow";

export interface RecoverOptions {
  /**
   * Force-recover a run that's already in a terminal state
   * (success/failed/cancelled). Use case: agent's last polling pass was
   * killed by Vercel maxDuration just before a generated file made it
   * into Anthropic Files API, so the run got marked "success" with
   * zero deliverables. Force mode merges newly-discovered files into
   * step_results without altering existing status/output.
   *
   * Default false: only "running" runs are eligible.
   */
  force?: boolean;
}

export type RecoverResult =
  | {
      recovered: true;
      status: "success" | "failed";
      stepsRecovered: number;
      filesRecovered: number;
    }
  | {
      recovered: false;
      reason: "not_found" | "not_stale" | "no_session" | "error";
      runStatus?: string;
      message?: string;
    };

export async function recoverRun(
  runId: string,
  options: RecoverOptions = {},
): Promise<RecoverResult> {
  const { force = false } = options;
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("workflow_runs")
    .select("*, workflows(*)")
    .eq("id", runId)
    .single();

  if (!run) {
    return { recovered: false, reason: "not_found" };
  }

  if (run.status !== "running" && !force) {
    return { recovered: false, reason: "not_stale", runStatus: run.status };
  }

  if (!run.session_id) {
    // Nothing to recover from. Mark failed so it doesn't stay "running"
    // forever, but only if it was actually running — terminal runs left
    // alone.
    if (run.status === "running") {
      await admin
        .from("workflow_runs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", runId);
      await admin
        .from("workflows")
        .update({ status: "ready" })
        .eq("id", run.workflow_id);
    }
    return { recovered: false, reason: "no_session" };
  }

  console.log(`[Recovery] Recovering run ${runId} from session ${run.session_id} (force=${force})`);

  try {
    const client = getAnthropicClient();
    const workflow = run.workflows;
    const steps = (workflow?.steps || []) as { id: string; agentId: string; prompt: string }[];
    const stepResults: WorkflowStepResult[] = run.step_results;

    // Get all session events
    const events = await client.beta.sessions.events.list(run.session_id, {
      limit: 500,
      order: "asc",
    });

    // Parse events: split by user.message (each = one step) and
    // session.status_idle (step end)
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
        const label =
          name === "web_search"
            ? "Searching the web..."
            : name === "bash"
              ? "Running code..."
              : name === "write"
                ? "Writing file..."
                : name === "web_fetch"
                  ? "Fetching web page..."
                  : `Using ${name}...`;
        stepTools[currentStep].push({
          type: name.includes("web") ? "web_search" : "code_execution",
          label,
        });
      } else if (event.type === "session.status_idle") {
        const stopReason = (event as { stop_reason?: { type: string } }).stop_reason;
        if (stopReason?.type === "requires_action") continue;
        idleCount++;
      }
    }

    console.log(`[Recovery] Found ${currentStep + 1} steps, ${idleCount} idle events`);

    // Get all files from the session
    const sessionFiles = await listSessionFiles(run.session_id);
    const allFiles = sessionFiles.map((f) => ({ fileId: f.id, filename: f.filename }));
    console.log(`[Recovery] Found ${allFiles.length} files`);

    // Assign files to steps heuristically (files created during each step).
    // Simple approach: distribute based on step count.
    const filesPerStep: { fileId: string; filename: string }[][] = [];
    for (let i = 0; i <= currentStep; i++) filesPerStep.push([]);

    // Known file IDs from existing step results
    const knownFileIds = new Set<string>();
    for (const sr of stepResults) {
      if (sr.files) sr.files.forEach((f) => knownFileIds.add(f.fileId));
    }

    // Assign new files to the last completed step (most likely producer)
    const newFiles = allFiles.filter((f) => !knownFileIds.has(f.fileId));
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

      if (newFilesForStep.length > 0) {
        stepResults[i] = {
          ...stepResults[i],
          files: [...(stepResults[i].files || []), ...newFilesForStep],
        };
      }

      const isUnfinished = stepResults[i].status === "running" || stepResults[i].status === "pending";
      if (isUnfinished || !stepResults[i].output) {
        stepResults[i] = {
          ...stepResults[i],
          status: i < idleCount ? "success" : text.length > 0 ? "success" : "failed",
          output: text || stepResults[i].output || "(Recovered — check Deliverables for files)",
          toolActivity: tools.length > 0 ? tools : stepResults[i].toolActivity,
        };
      }
    }

    const allDone = stepResults.every((s) => s.status === "success");
    const anyFailed = stepResults.some((s) => s.status === "failed");
    const finalStatus: "success" | "failed" = allDone ? "success" : anyFailed ? "failed" : "success";

    await admin
      .from("workflow_runs")
      .update({
        status: finalStatus,
        current_step: Math.min(currentStep + 1, steps.length),
        step_results: stepResults,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await admin
      .from("workflows")
      .update({
        status: "ready",
        last_run_at: new Date().toISOString(),
        last_run_status: finalStatus,
      })
      .eq("id", run.workflow_id);

    console.log(`[Recovery] ✅ Run ${runId} recovered as "${finalStatus}"`);

    return {
      recovered: true,
      status: finalStatus,
      stepsRecovered: stepResults.filter((s) => s.status === "success").length,
      filesRecovered: newFiles.length,
    };
  } catch (err) {
    console.error("[Recovery] Failed:", err);

    // Only downgrade to "failed" if the run was actively stuck "running"
    // when we started. For force-recovery on a run that was already
    // terminal (success/failed/cancelled), leave its status alone — a
    // transient Anthropic API blip during file-merge shouldn't nuke a
    // "complete" run back to "failed".
    if (run.status === "running") {
      await admin
        .from("workflow_runs")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("id", runId);
      await admin.from("workflows").update({ status: "ready" }).eq("id", run.workflow_id);
    }

    return {
      recovered: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Recovery failed",
    };
  }
}
