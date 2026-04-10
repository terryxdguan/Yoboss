import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, MODELS } from "@/lib/ai/client";
import { logUsage } from "@/lib/ai/rate-limit";
import { readFile } from "fs/promises";
import { join } from "path";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type Anthropic from "@anthropic-ai/sdk";
import type { WorkflowStepResult, GeneratedFile } from "@/lib/types/workflow";

const SERVER_TOOLS: Anthropic.Messages.ToolUnion[] = [
  { type: "web_search_20260209" as const, name: "web_search" as const },
  { type: "web_fetch_20260209" as const, name: "web_fetch" as const },
  { type: "code_execution_20260120" as const, name: "code_execution" as const },
];

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

async function loadPromptFile(promptFile: string): Promise<string> {
  const filePath = join(process.cwd(), "src", "lib", "ai", "agent-prompts", promptFile);
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "You are a helpful AI assistant.";
  }
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
  const previousOutputs: string[] = [];

  try {
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

      let enrichedPrompt = step.prompt;
      if (previousOutputs.length > 0) {
        enrichedPrompt += "\n\n--- PREVIOUS STEP OUTPUTS ---\n";
        previousOutputs.forEach((out, idx) => {
          enrichedPrompt += `\nStep ${idx + 1} output:\n${out}\n`;
        });
      }

      const basePrompt = await loadPromptFile(promptFile);
      const yobossPrefix = `IMPORTANT: Always address the user as "Hi Boss" at the start of each conversation. Be respectful and professional.\n\nFILE GENERATION: When generating ANY file using code execution, you MUST copy the output file to $OUTPUT_DIR. Example: cp /tmp/myfile.html $OUTPUT_DIR/myfile.html.\n\n`;
      const systemPrompt = yobossPrefix + basePrompt;

      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: enrichedPrompt },
      ];

      const client = getAnthropicClient();
      let currentMessages = [...messages];
      let fullText = "";
      const files: GeneratedFile[] = [];
      let continuations = 0;

      let totalInput = 0;
      let totalOutput = 0;

      while (continuations < 5) {
        const response = await client.messages.create({
          model: MODELS.sonnet,
          max_tokens: 16000,
          system: systemPrompt,
          tools: SERVER_TOOLS,
          messages: currentMessages,
        });

        totalInput += response.usage?.input_tokens ?? 0;
        totalOutput += response.usage?.output_tokens ?? 0;

        for (const block of response.content) {
          if (block.type === "text") {
            fullText += block.text;
          }
        }

        if (response.stop_reason === "pause_turn") {
          currentMessages = [
            ...currentMessages,
            { role: "assistant" as const, content: response.content },
          ];
          continuations++;
          continue;
        }
        break;
      }

      // Log usage for this step
      await logUsage(userId, "workflow-execute", MODELS.sonnet, totalInput, totalOutput).catch(() => {});

      const durationMs = Date.now() - startTime;
      stepResults[i] = {
        stepId: step.id,
        status: "success",
        output: fullText,
        durationMs,
        files: files.length > 0 ? files : undefined,
      };
      previousOutputs.push(fullText);

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
