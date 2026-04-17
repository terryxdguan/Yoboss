import { getAnthropicClient, MODELS } from "./client";
import type Anthropic from "@anthropic-ai/sdk";

export interface GoalDetailChatContext {
  goalTitle: string;
  goalDescription: string;
  phases: {
    title: string;
    description: string;
    status: string;
    estimatedWeeks: number;
  }[];
  weeklyTasks: {
    dayOfWeek: number;
    title: string;
    timeSlot: string | null;
    completed: boolean;
  }[];
  weekSummary: string | null;
}

function buildSystemPrompt(context: GoalDetailChatContext): string {
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const phasesText = context.phases
    .map((p, i) => `  Phase ${i + 1} [${p.status}]: ${p.title} — ${p.description} (~${p.estimatedWeeks}w)`)
    .join("\n");

  const tasksText = context.weeklyTasks.length > 0
    ? context.weeklyTasks
      .map((t) => `  ${dayNames[t.dayOfWeek]}: ${t.completed ? "[done]" : "[todo]"} ${t.title}${t.timeSlot ? ` (${t.timeSlot})` : ""}`)
      .join("\n")
    : "  No tasks scheduled yet.";

  return `IMPORTANT: Always address the user as "Hi Boss" at the start of each conversation. Be respectful and professional.

You are a friendly and knowledgeable AI goal coach. The user is working on a specific goal and you have full context about their progress.

GOAL: ${context.goalTitle}
${context.goalDescription ? `DESCRIPTION: ${context.goalDescription}` : ""}

ROADMAP:
${phasesText}

THIS WEEK'S SCHEDULE:
${context.weekSummary ? `Summary: ${context.weekSummary}` : ""}
${tasksText}

YOUR ROLE:
- Answer any questions about their goal, roadmap, or weekly tasks
- Help break down tasks, brainstorm approaches, or provide advice
- Offer encouragement and practical tips
- If they ask about a specific task, help them think through it
- Be concise, warm, and actionable
- Don't generate a weekly plan unless specifically asked — this is a free-form conversation

CAPABILITIES:
- You can search the web for real-time information (flights, hotels, restaurants, events, prices, etc.)
- You can fetch specific web pages to get detailed content
- You can execute code to generate files (PPT, Excel, PDF, charts, HTML, etc.)
- When generating ANY file, you MUST copy it to the $OUTPUT_DIR directory so the user can download it.
  Example: first create the file, then run: cp /tmp/myfile.html $OUTPUT_DIR/myfile.html
  The $OUTPUT_DIR environment variable is pre-set in the execution environment — just reference it directly.
- DO NOT just print file content to stdout or return it as a markdown code block. Only files copied to $OUTPUT_DIR will be downloadable.
- For presentations, use python-pptx; for spreadsheets, use openpyxl; for PDFs, use matplotlib or reportlab
- After generating a file, tell the user what you created and that they can download it`;
}

// Server-side tools that Anthropic executes
const SERVER_TOOLS: Anthropic.Messages.ToolUnion[] = [
  { type: "web_search_20260209" as const, name: "web_search" as const },
  { type: "web_fetch_20260209" as const, name: "web_fetch" as const },
  { type: "code_execution_20260120" as const, name: "code_execution" as const },
];

/**
 * Stream the goal detail chat with server-side tools.
 * Handles the agentic loop: if stop_reason is "pause_turn",
 * continues the conversation automatically.
 * Returns a ReadableStream of SSE events for the client.
 */
export function streamGoalDetailChat(
  messages: Anthropic.MessageParam[],
  context: GoalDetailChatContext,
  onUsage?: (inputTokens: number, outputTokens: number) => void
): ReadableStream<Uint8Array> {
  const client = getAnthropicClient();
  const systemPrompt = buildSystemPrompt(context);
  const encoder = new TextEncoder();

  // Single-turn stream: run exactly ONE messages.stream() call and
  // emit a synthetic turn_complete event at the end. The client-side
  // useContinuationStream hook handles the pause_turn → re-fetch
  // loop, giving each turn its own Vercel timeout budget.
  return new ReadableStream({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: MODELS.opus,
          max_tokens: 16000,
          system: systemPrompt,
          tools: SERVER_TOOLS,
          messages,
        });

        for await (const event of stream) {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        const finalMessage = await stream.finalMessage();

        // Log usage per-turn.
        if (onUsage && finalMessage.usage) {
          try {
            onUsage(
              finalMessage.usage.input_tokens,
              finalMessage.usage.output_tokens
            );
          } catch { /* non-blocking */ }
        }

        // Emit synthetic turn_complete so the client knows whether
        // to auto-continue (pause_turn) or finalize (end_turn etc).
        const turnComplete = JSON.stringify({
          type: "turn_complete",
          stop_reason: finalMessage.stop_reason,
          finalContent: finalMessage.content,
        });
        controller.enqueue(encoder.encode(`data: ${turnComplete}\n\n`));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const errorEvent = JSON.stringify({
          type: "error",
          error: { message: errorMsg },
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
      } finally {
        controller.close();
      }
    },
  });
}
