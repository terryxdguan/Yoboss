import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, MANAGED_AGENT, listSessionFiles } from "@/lib/ai/client";
import { executeCustomTool } from "@/lib/ai/custom-tools";
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

/** Poll a Managed Agent session until it becomes idle, returning the text output. */
async function pollSessionUntilIdle(
  client: ReturnType<typeof getAnthropicClient>,
  sessionId: string,
  seenIds: Set<string>,
): Promise<string> {
  const POLL_INTERVAL = 2000;
  const MAX_POLLS = 150; // 5 min

  let fullText = "";

  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const events = await client.beta.sessions.events.list(sessionId, {
      limit: 100,
      order: "desc",
    });

    const newEvents = events.data.filter((e) => !seenIds.has(e.id)).reverse();

    for (const event of newEvents) {
      seenIds.add(event.id);

      if (event.type === "agent.custom_tool_use") {
        // Execute custom tool server-side
        const toolName = (event as { name: string }).name;
        const toolInput = (event as { input: Record<string, unknown> }).input;
        console.log(`[WorkflowExec] Custom tool: ${toolName}`);

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
        }
      } else if (event.type === "session.status_idle") {
        const stopReason = (event as { stop_reason?: { type: string } }).stop_reason;
        if (stopReason?.type === "requires_action") continue;
        return fullText;
      }
    }
  }

  throw new Error("Step timed out after 5 minutes");
}

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workflowId, userId, triggeredBy } = (await request.json()) as {
    workflowId: string;
    userId: string;
    triggeredBy: "scheduled" | "manual";
  };

  const supabase = createAdminClient();

  const { data: workflow, error: wfErr } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();
  if (wfErr || !workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const steps = workflow.steps as { id: string; agentId: string; prompt: string }[];
  const stepResults: WorkflowStepResult[] = steps.map((s) => ({
    stepId: s.id,
    status: "pending" as const,
  }));

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

  const runId = run.id;
  const client = getAnthropicClient();

  try {
    // Create a single Managed Agent session for the entire workflow run.
    // The session maintains conversation context across steps automatically.
    const session = await client.beta.sessions.create({
      agent: MANAGED_AGENT.agentId,
      environment_id: MANAGED_AGENT.environmentId,
    });

    // Track all seen event IDs across steps (session accumulates events)
    const seenIds = new Set<string>();
    const initialEvents = await client.beta.sessions.events.list(session.id, {
      limit: 500,
      order: "asc",
    });
    for (const e of initialEvents.data) seenIds.add(e.id);

    // Track known file IDs to find new files per step
    const knownFileIds = new Set<string>();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const agent = allAgents.find((a) => a.id === step.agentId);
      const promptFile = agent?.promptFile || "general_assistant.txt";
      const startTime = Date.now();

      stepResults[i].status = "running";
      await supabase
        .from("workflow_runs")
        .update({ current_step: i, step_results: stepResults })
        .eq("id", runId);

      // Build message with role instructions
      const fileInstruction = `\n\nIMPORTANT: When generating ANY file (HTML, PDF, PPT, Excel, code files, etc.), you MUST save the file to /mnt/session/outputs/ so the user can download it.`;
      const rolePrompt = await loadPromptFile(promptFile);
      const message = rolePrompt
        ? `## Role Instructions\n${rolePrompt}\n\n## Task\n${step.prompt}${fileInstruction}`
        : step.prompt + fileInstruction;

      // Send message to the session
      await client.beta.sessions.events.send(session.id, {
        events: [
          {
            type: "user.message",
            content: [{ type: "text", text: message }],
          },
        ],
      });

      // Poll until idle
      const fullText = await pollSessionUntilIdle(client, session.id, seenIds);

      // Extract new files from session
      const stepFiles: { fileId: string; filename: string }[] = [];
      try {
        const sessionFiles = await listSessionFiles(session.id);
        for (const f of sessionFiles) {
          if (!knownFileIds.has(f.id)) {
            knownFileIds.add(f.id);
            stepFiles.push({ fileId: f.id, filename: f.filename });
          }
        }
      } catch {
        // Non-blocking
      }

      const durationMs = Date.now() - startTime;
      stepResults[i] = {
        stepId: step.id,
        status: "success",
        output: fullText,
        durationMs,
        files: stepFiles.length > 0 ? stepFiles : undefined,
      };

      await supabase
        .from("workflow_runs")
        .update({ step_results: stepResults })
        .eq("id", runId);
    }

    await supabase
      .from("workflow_runs")
      .update({
        status: "success",
        step_results: stepResults,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await supabase
      .from("workflows")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
        status: "ready",
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
      stepResults[failedIdx] = {
        ...stepResults[failedIdx],
        status: "failed",
        error: errorMsg,
      };
    }

    await supabase
      .from("workflow_runs")
      .update({
        status: "failed",
        step_results: stepResults,
        completed_at: new Date().toISOString(),
      })
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
