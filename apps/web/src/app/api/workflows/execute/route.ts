import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, MANAGED_AGENT, listSessionFiles } from "@/lib/ai/client";
import { executeCustomTool } from "@/lib/ai/custom-tools";
import { logUsage } from "@/lib/ai/rate-limit";
import { readFile } from "fs/promises";
import { join } from "path";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type { WorkflowStepResult } from "@/lib/types/workflow";

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

async function loadPromptFile(promptFile: string): Promise<string> {
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

export const maxDuration = 300; // 5 min per step (Vercel Hobby cap; Pro allows up to 900)

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

      // Poll with real-time tool activity updates to DB
      let toolWritePending = false;
      let toolWriteQueued: ToolActivityItem[] | null = null;

      const flushToolActivity = async (tools: ToolActivityItem[]) => {
        if (toolWritePending) {
          toolWriteQueued = tools; // Queue latest, will flush after current write
          return;
        }
        toolWritePending = true;
        stepResults[i] = { ...stepResults[i], status: "running", toolActivity: tools };
        try {
          await supabase.from("workflow_runs").update({ step_results: stepResults }).eq("id", runId);
        } catch (err) {
          console.error("[WorkflowExec] Tool activity DB write failed:", err);
        }
        toolWritePending = false;
        // Flush queued update if any
        if (toolWriteQueued) {
          const queued = toolWriteQueued;
          toolWriteQueued = null;
          await flushToolActivity(queued);
        }
      };

      // Track partial output writes (same queue pattern as tool activity)
      let outputWritePending = false;
      let outputWriteQueued: string | null = null;

      const flushOutput = async (text: string) => {
        if (outputWritePending) { outputWriteQueued = text; return; }
        outputWritePending = true;
        stepResults[i] = { ...stepResults[i], status: "running", output: text };
        try {
          await supabase.from("workflow_runs").update({ step_results: stepResults }).eq("id", runId);
        } catch { /* non-blocking */ }
        outputWritePending = false;
        if (outputWriteQueued) {
          const queued = outputWriteQueued;
          outputWriteQueued = null;
          await flushOutput(queued);
        }
      };

      const stepResult = await pollSessionUntilIdle(client, session.id, seenIds,
        (tools) => { flushToolActivity(tools); },
        (text) => { flushOutput(text); },
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

    await supabase
      .from("workflows")
      .update({ last_run_at: new Date().toISOString(), last_run_status: "success", status: "ready" })
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
