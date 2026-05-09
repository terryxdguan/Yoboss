import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, MANAGED_AGENT, listSessionFiles } from "@/lib/ai/client";
import { executeCustomTool } from "@/lib/ai/custom-tools";
import { logUsage, withRateLimit } from "@/lib/ai/rate-limit";
import { readFile } from "fs/promises";
import { join } from "path";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type { WorkflowStepResult } from "@/lib/types/workflow";

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

// Defense-in-depth filename allowlist. Today every caller resolves
// `promptFile` from the static `allAgents` registry, but the same helper
// pattern in agent-run-step takes the field directly from request JSON
// — keep the two helpers symmetric so future refactors don't reintroduce
// the path-traversal LFI.
const SAFE_PROMPT_FILE = /^[a-z0-9_-]+\.txt$/;

async function loadPromptFile(promptFile: string): Promise<string> {
  if (!SAFE_PROMPT_FILE.test(promptFile)) return "";
  const filePath = join(process.cwd(), "src", "lib", "ai", "agent-prompts", promptFile);
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

interface ToolActivityItem {
  type: string;
  label: string;
}

function classifyTool(name: string): ToolActivityItem {
  if (name.includes("web_search") || name === "web_search") return { type: "web_search", label: "Searching the web..." };
  if (name.includes("web_fetch") || name === "web_fetch") return { type: "web_fetch", label: "Fetching web page..." };
  if (name.includes("code_execution") || name === "code_execution") return { type: "code_execution", label: "Running code..." };
  if (name === "bash" || name === "terminal") return { type: "code_execution", label: "Running code..." };
  if (name === "write" || name === "file_write") return { type: "code_execution", label: "Writing file..." };
  if (name === "read" || name === "file_read") return { type: "code_execution", label: "Reading file..." };
  if (name === "edit" || name === "file_edit") return { type: "code_execution", label: "Editing file..." };
  if (name === "think" || name === "thinking") return { type: "thinking", label: "Thinking..." };
  return { type: name, label: `Using ${name}...` };
}

/** Poll a Managed Agent session until it becomes idle, returning text + tool activity.
 *  onProgress is called whenever new text arrives — caller can persist partial output to DB. */
async function pollSessionUntilIdle(
  client: ReturnType<typeof getAnthropicClient>,
  sessionId: string,
  seenIds: Set<string>,
  onToolActivity?: (tools: ToolActivityItem[]) => void,
  onProgress?: (text: string) => void,
): Promise<{ text: string; toolActivity: ToolActivityItem[] }> {
  const POLL_INTERVAL = 2000;
  const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min without any new events → timeout

  let fullText = "";
  const toolActivity: ToolActivityItem[] = [];
  let lastEventTime = Date.now();

  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    // Check idle timeout — if no events for 10 min, return what we have instead of throwing
    if (Date.now() - lastEventTime > IDLE_TIMEOUT_MS) {
      console.log(`[WorkflowExec] Idle timeout reached. Returning partial output (${fullText.length} chars).`);
      return { text: fullText || "(Step completed but output was not captured — check Deliverables for files)", toolActivity };
    }

    const events = await client.beta.sessions.events.list(sessionId, {
      limit: 100,
      order: "desc",
    });

    const newEvents = events.data.filter((e) => !seenIds.has(e.id)).reverse();

    if (newEvents.length > 0) {
      lastEventTime = Date.now();
    }

    for (const event of newEvents) {
      seenIds.add(event.id);

      if (event.type === "agent.tool_use") {
        const toolName = (event as { name: string }).name;
        const activity = classifyTool(toolName);
        toolActivity.push(activity);
        console.log(`[WorkflowExec] Tool: ${toolName} → ${activity.label}`);
        if (onToolActivity) onToolActivity([...toolActivity]);
      } else if (event.type === "agent.custom_tool_use") {
        const toolName = (event as { name: string }).name;
        const toolInput = (event as { input: Record<string, unknown> }).input;
        const activity = classifyTool(toolName);
        toolActivity.push(activity);
        console.log(`[WorkflowExec] Custom tool: ${toolName} → ${activity.label}`);
        if (onToolActivity) onToolActivity([...toolActivity]);

        const result = await executeCustomTool(toolName, toolInput);
        await client.beta.sessions.events.send(sessionId, {
          events: [
            {
              type: "user.custom_tool_result",
              custom_tool_use_id: event.id,
              content: result.content as Array<{ type: "text"; text: string }>,
              is_error: result.is_error || false,
            },
          ],
        });
      } else if (event.type === "agent.message") {
        for (const block of event.content) {
          if (block.type === "text" && block.text) {
            fullText += block.text;
          }
          const blockType = (block as { type: string }).type;
          if (blockType === "tool_use" || blockType === "server_tool_use") {
            const toolName = (block as { name?: string }).name || "unknown";
            const activity = classifyTool(toolName);
            toolActivity.push(activity);
            if (onToolActivity) onToolActivity([...toolActivity]);
          }
        }
        // Persist partial output to DB so it's not lost if idle event is missed
        if (onProgress && fullText.length > 0) {
          onProgress(fullText);
        }
      } else if (event.type === "session.status_idle") {
        const stopReason = (event as { stop_reason?: { type: string } }).stop_reason;
        if (stopReason?.type === "requires_action") continue;
        return { text: fullText, toolActivity };
      }
    }
  }
}

/** Check if run was cancelled by user */
async function isRunCancelled(supabase: ReturnType<typeof createAdminClient>, runId: string): Promise<boolean> {
  const { data } = await supabase
    .from("workflow_runs")
    .select("status")
    .eq("id", runId)
    .single();
  return data?.status === "cancelled";
}

// Vercel Pro caps function duration at 800s (~13 min). We use the full
// budget here because workflow steps that combine web_search + multi-turn
// reasoning + code_execution to produce a deliverable file routinely run
// 6–12 minutes on real research tasks. With 300s we silently truncated
// the polling loop right when the agent was about to `cp` the output
// file to $OUTPUT_DIR — agent finished saying "saved as a standalone
// HTML file" but the file never actually appeared in deliverables.
//
// 13 min still isn't enough for the longest tasks. The
// `/api/workflows/recover` route + a future recover-stale-runs cron
// pull files from Anthropic's session after the function dies, which is
// the proper backstop for anything > 13 min.
export const maxDuration = 800;

export async function POST(request: NextRequest) {
  // Dual auth: CRON_SECRET for scheduled runs, user session for manual runs
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  let userId: string;
  let triggeredBy: "scheduled" | "manual";
  let workflowId: string;
  let existingRunId: string | undefined;
  let topic: string | undefined;

  if (isCronAuth) {
    const body = await request.json();
    userId = body.userId;
    workflowId = body.workflowId;
    triggeredBy = body.triggeredBy || "scheduled";
    existingRunId = body.runId;
    topic = body.topic;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
    const body = await request.json();
    workflowId = body.workflowId;
    triggeredBy = "manual";
    existingRunId = body.runId;
    topic = body.topic;
  }

  const supabase = createAdminClient();

  const { data: workflow, error: wfErr } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();
  if (wfErr || !workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  // Ownership gate. Required for both branches:
  // - Manual: closes the IDOR where any authed user could POST another
  //   user's workflowId and run it (billed to the attacker, but executing
  //   the victim's prompt steps and writing into the attacker's history).
  // - Cron: a leaked CRON_SECRET would otherwise let an attacker pass any
  //   userId/workflowId pair and run user A's workflow against user B's
  //   quota. With this check, the worst a leaked secret can do is run the
  //   workflow under its actual owner's quota.
  // Returning 404 (not 403) avoids leaking workflow existence.
  if (workflow.user_id !== userId) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  // If the caller passed an existingRunId, verify it actually belongs to
  // this user and this workflow. Otherwise a leaked CRON_SECRET (or a
  // crafted manual call) could update someone else's run row.
  if (existingRunId) {
    const { data: existingRun } = await supabase
      .from("workflow_runs")
      .select("user_id, workflow_id")
      .eq("id", existingRunId)
      .single();
    if (
      !existingRun ||
      existingRun.user_id !== userId ||
      existingRun.workflow_id !== workflowId
    ) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
  }

  // Quota gate. Without this, scheduled workflows kept billing the project
  // (we pay Anthropic) for users whose monthly cap was already exhausted —
  // see PR adding consecutive_quota_failures + cron-level pre-skip for
  // the full mitigation. Manual triggers see the same 402 but don't strike
  // out the schedule (counter only ticks on triggered_by === "scheduled").
  const rateCheck = await withRateLimit(userId, "workflow-execute");
  if (!rateCheck.allowed) {
    const isQuotaError = rateCheck.response.status === 402;

    // Persist a failed run record so it shows up in the user's history
    // with a real reason — otherwise the schedule "silently doesn't run"
    // and the user has no signal in-app. We don't have `steps` shaped yet
    // (topic injection happens after the quota gate), so fall back to the
    // raw stored steps for the total count.
    const rawStepsForCount = (workflow.steps as { id: string }[] | null) ?? [];
    await supabase.from("workflow_runs").insert({
      workflow_id: workflowId,
      user_id: userId,
      status: "failed",
      current_step: 0,
      total_steps: rawStepsForCount.length,
      step_results: [],
      triggered_by: triggeredBy,
      error: isQuotaError ? "Monthly allowance exhausted" : "Rate limit",
      completed_at: new Date().toISOString(),
    });

    if (isQuotaError && triggeredBy === "scheduled") {
      // Strike the schedule. Three consecutive quota failures auto-disables
      // it so we stop spamming this user every 5 min until they top up.
      const failures = (workflow.consecutive_quota_failures ?? 0) + 1;
      const update: { consecutive_quota_failures: number; schedule_enabled?: boolean } = {
        consecutive_quota_failures: failures,
      };
      if (failures >= 3) update.schedule_enabled = false;
      await supabase.from("workflows").update(update).eq("id", workflowId);

      await supabase.from("notifications").insert({
        user_id: userId,
        type: failures >= 3 ? "scheduled_run_disabled" : "scheduled_run_quota_exceeded",
        title:
          failures >= 3
            ? `${workflow.name} schedule paused — out of credits`
            : `${workflow.name} skipped — out of credits`,
        metadata: { workflowId, consecutiveFailures: failures },
      });
    }

    return rateCheck.response;
  }

  // Use topic from request, falling back to workflow's saved topic
  const effectiveTopic = topic || workflow.topic;
  const rawSteps = workflow.steps as { id: string; agentId: string; prompt: string }[];
  // Inject topic into each step's prompt if provided
  const steps = effectiveTopic
    ? rawSteps.map(s => ({ ...s, prompt: `Topic/Task: ${effectiveTopic}\n\n${s.prompt}` }))
    : rawSteps;
  const stepResults: WorkflowStepResult[] = steps.map((s) => ({
    stepId: s.id,
    status: "pending" as const,
  }));

  // Use existing run record if provided, otherwise create new
  let runId: string;
  if (existingRunId) {
    runId = existingRunId;
  } else {
    const { data: run, error: runErr } = await supabase
      .from("workflow_runs")
      .insert({
        workflow_id: workflowId,
        user_id: userId,
        status: "running",
        current_step: 0,
        total_steps: steps.length,
        step_results: stepResults,
        triggered_by: triggeredBy,
      })
      .select()
      .single();
    if (runErr || !run) {
      return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
    }
    runId = run.id;
  }

  // Update workflow status to running
  await supabase.from("workflows").update({ status: "running" }).eq("id", workflowId);

  const client = getAnthropicClient();

  try {
    const session = await client.beta.sessions.create({
      agent: MANAGED_AGENT.agentId,
      environment_id: MANAGED_AGENT.environmentId,
    });

    // Save session_id so the run can be tracked
    await supabase.from("workflow_runs").update({ session_id: session.id }).eq("id", runId);

    const seenIds = new Set<string>();
    const initialEvents = await client.beta.sessions.events.list(session.id, {
      limit: 500,
      order: "asc",
    });
    for (const e of initialEvents.data) seenIds.add(e.id);

    const knownFileIds = new Set<string>();

    for (let i = 0; i < steps.length; i++) {
      // Check if user requested stop
      if (await isRunCancelled(supabase, runId)) {
        // Mark remaining steps as pending, finalize as cancelled
        await supabase.from("workflow_runs").update({
          status: "cancelled",
          step_results: stepResults,
          completed_at: new Date().toISOString(),
        }).eq("id", runId);
        await supabase.from("workflows").update({ status: "ready" }).eq("id", workflowId);
        return NextResponse.json({ runId, status: "cancelled" });
      }

      const step = steps[i];
      const agent = allAgents.find((a) => a.id === step.agentId);
      const promptFile = agent?.promptFile || "general_assistant.txt";
      const startTime = Date.now();

      stepResults[i].status = "running";
      await supabase
        .from("workflow_runs")
        .update({ current_step: i, step_results: stepResults })
        .eq("id", runId);

      const fileInstruction = `\n\nIMPORTANT: When generating ANY file (HTML, PDF, PPT, Excel, code files, etc.), you MUST save the file to /mnt/session/outputs/ so the user can download it.`;
      const rolePrompt = await loadPromptFile(promptFile);
      const message = rolePrompt
        ? `## Role Instructions\n${rolePrompt}\n\n## Task\n${step.prompt}${fileInstruction}`
        : step.prompt + fileInstruction;

      await client.beta.sessions.events.send(session.id, {
        events: [
          {
            type: "user.message",
            content: [{ type: "text", text: message }],
          },
        ],
      });

      // Stream partial tool activity + output to DB while the agent works.
      // Both fields live in the same workflow_runs.step_results jsonb row,
      // so we share one throttle: at most one DB write per
      // MIN_FLUSH_INTERVAL_MS regardless of event rate. A long agentic
      // step routinely emits hundreds of events; previously each one
      // triggered a full-row jsonb UPDATE on an unindexed table while the
      // 2s client poll was reading the same row — the hottest write path
      // in the app. The final state is always captured by the post-step
      // `update({ step_results })` await below, so dropping intermediates
      // only delays the progress UI by ≤ MIN_FLUSH_INTERVAL_MS.
      const MIN_FLUSH_INTERVAL_MS = 1500;
      let lastFlushAt = 0;

      const flushIfDue = async () => {
        if (Date.now() - lastFlushAt < MIN_FLUSH_INTERVAL_MS) return;
        lastFlushAt = Date.now();
        try {
          await supabase
            .from("workflow_runs")
            .update({ step_results: stepResults })
            .eq("id", runId);
        } catch (err) {
          console.error("[WorkflowExec] Throttled DB flush failed:", err);
        }
      };

      const flushToolActivity = (tools: ToolActivityItem[]) => {
        stepResults[i] = { ...stepResults[i], status: "running", toolActivity: tools };
        void flushIfDue();
      };

      const flushOutput = (text: string) => {
        stepResults[i] = { ...stepResults[i], status: "running", output: text };
        void flushIfDue();
      };

      const stepResult = await pollSessionUntilIdle(
        client,
        session.id,
        seenIds,
        flushToolActivity,
        flushOutput,
      );

      const stepFiles: { fileId: string; filename: string }[] = [];
      try {
        const sessionFiles = await listSessionFiles(session.id);
        for (const f of sessionFiles) {
          if (!knownFileIds.has(f.id)) {
            knownFileIds.add(f.id);
            stepFiles.push({ fileId: f.id, filename: f.filename });
          }
        }
      } catch { /* Non-blocking */ }

      const durationMs = Date.now() - startTime;

      const estInputTokens = Math.ceil(message.length / 4);
      const estOutputTokens = Math.ceil(stepResult.text.length / 4);
      logUsage(userId, "workflow-execute", "managed-agent", estInputTokens, estOutputTokens).catch(() => {});

      stepResults[i] = {
        stepId: step.id,
        status: "success",
        output: stepResult.text,
        durationMs,
        files: stepFiles.length > 0 ? stepFiles : undefined,
        toolActivity: stepResult.toolActivity.length > 0 ? stepResult.toolActivity : undefined,
      };

      await supabase
        .from("workflow_runs")
        .update({ step_results: stepResults })
        .eq("id", runId);
    }

    await supabase
      .from("workflow_runs")
      .update({ status: "success", step_results: stepResults, completed_at: new Date().toISOString() })
      .eq("id", runId);

    // Successful run resets the strike counter — only consecutive failures
    // are interesting for auto-pausing a schedule.
    await supabase
      .from("workflows")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
        status: "ready",
        consecutive_quota_failures: 0,
      })
      .eq("id", workflowId);

    await supabase.from("notifications").insert({
      user_id: userId,
      type: "scheduled_run_complete",
      title: `${workflow.name} completed`,
      metadata: { workflowId, runId, status: "success" },
    });

    return NextResponse.json({ runId, status: "success" });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    const failedIdx = stepResults.findIndex((s) => s.status === "running");
    if (failedIdx >= 0) {
      stepResults[failedIdx] = { ...stepResults[failedIdx], status: "failed", error: errorMsg };
    }

    await supabase
      .from("workflow_runs")
      .update({ status: "failed", step_results: stepResults, completed_at: new Date().toISOString() })
      .eq("id", runId);

    await supabase
      .from("workflows")
      .update({ last_run_status: "failed", status: "ready" })
      .eq("id", workflowId);

    await supabase.from("notifications").insert({
      user_id: userId,
      type: "scheduled_run_failed",
      title: `${workflow.name} failed`,
      metadata: { workflowId, runId, status: "failed" },
    });

    return NextResponse.json({ runId, status: "failed", error: errorMsg });
  }
}
