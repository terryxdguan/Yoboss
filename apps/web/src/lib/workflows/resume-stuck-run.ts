// Server-side resumer for stuck workflow runs.
//
// Job: given a run that's still status="running" but has no executor
// (the original Vercel function died, or the user closed the tab
// between steps), find the next step that hasn't started, send the
// user.message to its Anthropic session, and poll for completion as
// long as the cron's budget allows.
//
// Coordination: protected by a row-level lock (workflow_runs.resume_lock_at).
// Only one of {cron sweeper, returning client} can hold it at a time;
// the other gets a `lock_held` no-op. Lock TTL is 15 min — well above
// Vercel Pro's 800s function ceiling, so a stale lock implies a dead
// holder.
//
// Time budget: cron has 300s. We reserve up to 240s for polling here;
// if the agent's response doesn't fit, the user.message is already
// sent and the next sweep will pick up the result via recoverRun.

import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, listSessionFiles } from "@/lib/ai/client";
import { readFile } from "fs/promises";
import { join } from "path";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type { WorkflowStepResult } from "@/lib/types/workflow";

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

const LOCK_TTL_MS = 15 * 60 * 1000;
// Default polling budget. The caller (cron sweeper) can pass a smaller
// value when several runs are sharing a sweep. 240s was the original
// conservative default; with the cron's maxDuration now 800s and most
// callers passing their own remaining budget, this is mostly a safety
// floor.
const DEFAULT_POLL_BUDGET_MS = 240 * 1000;
const POLL_INTERVAL_MS = 2_000;

export interface ResumeOptions {
  /**
   * Hard upper bound on how long resumeStuckRun spends polling Anthropic
   * for the current step's idle event. The user.message has already been
   * sent by the time this budget starts ticking, so cutting short just
   * means "let the next cron sweep finish reading events"; no work is
   * lost. Defaults to 240s.
   */
  pollBudgetMs?: number;
}

interface ToolActivityItem {
  type: string;
  label: string;
}

function classifyTool(name: string): ToolActivityItem {
  if (name.includes("web_search")) return { type: "web_search", label: "Searching the web..." };
  if (name.includes("web_fetch")) return { type: "web_fetch", label: "Fetching web page..." };
  if (name.includes("code_execution")) return { type: "code_execution", label: "Running code..." };
  if (name === "bash" || name === "terminal") return { type: "code_execution", label: "Running code..." };
  if (name === "write" || name === "file_write") return { type: "code_execution", label: "Writing file..." };
  if (name === "read" || name === "file_read") return { type: "code_execution", label: "Reading file..." };
  if (name === "edit" || name === "file_edit") return { type: "code_execution", label: "Editing file..." };
  return { type: name, label: `Using ${name}...` };
}

async function loadPromptFile(promptFile: string): Promise<string> {
  const filePath = join(process.cwd(), "src", "lib", "ai", "agent-prompts", promptFile);
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

export type ResumeResult =
  | { resumed: true; stepIndex: number; stepStatus: "success" | "running"; durationMs: number }
  | { resumed: false; reason: "lock_held" | "not_running" | "no_session" | "no_pending_step" | "no_workflow" | "error"; message?: string };

/**
 * Acquire the run's resume lock atomically. Returns the run row on
 * success, or null if the lock is held by someone else.
 */
async function acquireLock(runId: string) {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - LOCK_TTL_MS).toISOString();

  // Take the lock with a single UPDATE...WHERE so check + set is atomic.
  // The .or() filter accepts either (a) lock null or (b) lock older
  // than cutoff. Returning the row gives us read access in the same
  // transaction.
  const { data: lockedRows } = await admin
    .from("workflow_runs")
    .update({ resume_lock_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running")
    .or(`resume_lock_at.is.null,resume_lock_at.lt.${cutoff}`)
    .select("*, workflows(*)");

  if (!lockedRows || lockedRows.length === 0) return null;
  return lockedRows[0];
}

async function releaseLock(runId: string) {
  const admin = createAdminClient();
  await admin
    .from("workflow_runs")
    .update({ resume_lock_at: null })
    .eq("id", runId);
}

export async function resumeStuckRun(
  runId: string,
  options: ResumeOptions = {},
): Promise<ResumeResult> {
  const pollBudgetMs = options.pollBudgetMs ?? DEFAULT_POLL_BUDGET_MS;
  const run = await acquireLock(runId);
  if (!run) {
    return { resumed: false, reason: "lock_held" };
  }

  try {
    const workflow = run.workflows as { id: string; topic?: string; steps?: { agentId: string; prompt: string }[] } | null;
    if (!workflow) {
      return { resumed: false, reason: "no_workflow" };
    }

    if (!run.session_id) {
      return { resumed: false, reason: "no_session" };
    }

    const stepResults = run.step_results as WorkflowStepResult[];
    const steps = workflow.steps || [];

    // Find first pending step. We deliberately skip "running" steps —
    // those mean Anthropic is mid-stream, recoverRun on the next sweep
    // will pick them up. Resuming would double-send the user.message.
    const stepIndex = stepResults.findIndex((s) => s.status === "pending");
    if (stepIndex === -1) {
      return { resumed: false, reason: "no_pending_step" };
    }
    const step = steps[stepIndex];
    if (!step) {
      return { resumed: false, reason: "no_pending_step" };
    }

    const agent = allAgents.find((a) => a.id === step.agentId);
    const promptFile = agent?.promptFile || "general_assistant.txt";
    const rolePrompt = await loadPromptFile(promptFile);

    // Match the prompt-build pattern from /api/workflows/execute so the
    // agent receives the same envelope it would in a fresh run: role
    // instructions + task + the topic-injection if any + the file-output
    // directive.
    const fileInstruction = `\n\nIMPORTANT: When generating ANY file (HTML, PDF, PPT, Excel, code files, etc.), you MUST save the file to /mnt/session/outputs/ so the user can download it.`;
    const effectiveTopic = workflow.topic;
    const taskBlock = effectiveTopic
      ? `Topic/Task: ${effectiveTopic}\n\n${step.prompt}${fileInstruction}`
      : `${step.prompt}${fileInstruction}`;
    const message = rolePrompt
      ? `## Role Instructions\n${rolePrompt}\n\n## Task\n${taskBlock}`
      : taskBlock;

    const startTime = Date.now();
    const admin = createAdminClient();

    // Mark the step "running" before sending to Anthropic so the next
    // sweep won't try to resume it again (resumer only kicks "pending").
    stepResults[stepIndex] = { ...stepResults[stepIndex], status: "running" };
    await admin
      .from("workflow_runs")
      .update({ current_step: stepIndex, step_results: stepResults })
      .eq("id", runId);

    const client = getAnthropicClient();

    console.log(
      `[ResumeStuckRun] Run ${runId} step ${stepIndex} (agent=${step.agentId}) → sending user.message`,
    );

    await client.beta.sessions.events.send(run.session_id, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: message }],
        },
      ],
    });

    // Pre-fetch existing event IDs so we only react to fresh ones.
    const initialEvents = await client.beta.sessions.events.list(run.session_id, {
      limit: 500,
      order: "asc",
    });
    const seenIds = new Set<string>();
    for (const e of initialEvents.data) seenIds.add(e.id);
    const knownFileIds = new Set<string>();
    for (const sr of stepResults) {
      if (sr.files) sr.files.forEach((f) => knownFileIds.add(f.fileId));
    }

    let fullText = "";
    const toolActivity: ToolActivityItem[] = [];
    const deadline = startTime + pollBudgetMs;
    let completed = false;

    pollLoop: while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const events = await client.beta.sessions.events.list(run.session_id, {
        limit: 100,
        order: "desc",
      });
      const newEvents = events.data.filter((e) => !seenIds.has(e.id)).reverse();

      for (const event of newEvents) {
        seenIds.add(event.id);

        if (event.type === "agent.tool_use") {
          const toolName = (event as { name: string }).name;
          toolActivity.push(classifyTool(toolName));
        } else if (event.type === "agent.message") {
          for (const block of (event as { content: { type: string; text?: string }[] }).content) {
            if (block.type === "text" && block.text) fullText += block.text;
          }
        } else if (event.type === "session.status_idle") {
          const stopReason = (event as { stop_reason?: { type: string } }).stop_reason;
          if (stopReason?.type === "requires_action") continue;
          completed = true;
          break pollLoop;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    if (completed) {
      // Pull files generated during this step.
      const sessionFiles = await listSessionFiles(run.session_id);
      const newFiles = sessionFiles
        .filter((f) => !knownFileIds.has(f.id))
        .map((f) => ({ fileId: f.id, filename: f.filename }));

      stepResults[stepIndex] = {
        ...stepResults[stepIndex],
        status: "success",
        output: fullText || stepResults[stepIndex].output || "(Step completed — check Deliverables for files)",
        toolActivity: toolActivity.length > 0 ? toolActivity : stepResults[stepIndex].toolActivity,
        files: newFiles.length > 0 ? [...(stepResults[stepIndex].files || []), ...newFiles] : stepResults[stepIndex].files,
        durationMs,
      };

      // If this was the last step, mark the whole run terminal. Otherwise
      // leave status="running" — next cron sweep will resume the step
      // after this one.
      const allDone = stepResults.every((s) => s.status === "success");
      const update: Record<string, unknown> = {
        step_results: stepResults,
        current_step: Math.min(stepIndex + 1, steps.length),
      };
      if (allDone) {
        update.status = "success";
        update.completed_at = new Date().toISOString();
      }
      await admin.from("workflow_runs").update(update).eq("id", runId);

      if (allDone) {
        await admin
          .from("workflows")
          .update({
            status: "ready",
            last_run_at: new Date().toISOString(),
            last_run_status: "success",
          })
          .eq("id", run.workflow_id);
      }

      console.log(
        `[ResumeStuckRun] ✅ Run ${runId} step ${stepIndex} → success (${(durationMs / 1000).toFixed(1)}s, ${newFiles.length} files, allDone=${allDone})`,
      );
      return { resumed: true, stepIndex, stepStatus: "success", durationMs };
    }

    // Polling budget exhausted but step is still running on Anthropic
    // side. Persist whatever partial output we got so the run page
    // shows progress, and leave step status="running". recoverRun will
    // detect idle on the next cron sweep and finalize.
    if (fullText.length > 0 || toolActivity.length > 0) {
      stepResults[stepIndex] = {
        ...stepResults[stepIndex],
        status: "running",
        output: fullText || stepResults[stepIndex].output,
        toolActivity: toolActivity.length > 0 ? toolActivity : stepResults[stepIndex].toolActivity,
      };
      await admin
        .from("workflow_runs")
        .update({ step_results: stepResults })
        .eq("id", runId);
    }

    console.log(
      `[ResumeStuckRun] ⏱  Run ${runId} step ${stepIndex} sent but didn't finish in ${(pollBudgetMs / 1000).toFixed(0)}s — next sweep will recover`,
    );
    return { resumed: true, stepIndex, stepStatus: "running", durationMs };
  } catch (err) {
    console.error(`[ResumeStuckRun] Run ${runId} failed:`, err);
    return {
      resumed: false,
      reason: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  } finally {
    await releaseLock(runId);
  }
}
