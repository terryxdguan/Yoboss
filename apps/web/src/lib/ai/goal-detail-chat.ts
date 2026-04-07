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

  return `IMPORTANT: Always address the user as "YoBoss" at the start of each conversation. Be respectful and professional.

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
- You can execute Python code to generate files (PPT, Excel, PDF, charts, etc.)
- When generating files, always create well-formatted outputs with clear structure
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
  context: GoalDetailChatContext
): ReadableStream<Uint8Array> {
  const client = getAnthropicClient();
  const systemPrompt = buildSystemPrompt(context);
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let currentMessages = [...messages];
      let continuations = 0;
      const MAX_CONTINUATIONS = 5;

      try {
        while (continuations < MAX_CONTINUATIONS) {
          const stream = client.messages.stream({
            model: MODELS.sonnet,
            max_tokens: 16000,
            system: systemPrompt,
            tools: SERVER_TOOLS,
            messages: currentMessages,
          });

          // Forward all SSE events to the client
          for await (const event of stream) {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          const finalMessage = await stream.finalMessage();

          if (finalMessage.stop_reason === "pause_turn") {
            // Server-side tool loop hit limit — continue
            currentMessages = [
              ...currentMessages,
              { role: "assistant" as const, content: finalMessage.content },
            ];
            continuations++;
            continue;
          }

          // Done — end_turn or other terminal reason
          break;
        }
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
