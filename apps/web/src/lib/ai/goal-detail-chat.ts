import { getAnthropicClient, MODELS } from "./client";
import { PERSONA } from "./persona";
import type Anthropic from "@anthropic-ai/sdk";

export interface GoalDetailChatContext {
  goalTitle: string;
  goalDescription: string;
  phases: {
    title: string;
    description: string;
    status: string;
    estimatedWeeks: number;
    /** Per-phase milestone titles (the "1.1 / 1.2 / …" checklist items
     *  the AI generates inside each phase). Optional because non-goal
     *  call sites (dashboard task assistant, etc.) don't have phases. */
    milestones?: string[];
  }[];
  weeklyTasks: {
    dayOfWeek: number;
    title: string;
    timeSlot: string | null;
    completed: boolean;
  }[];
  weekSummary: string | null;
}

// ---------------------------------------------------------------------------
// System prompt is split into three blocks ordered most-stable → most-volatile
// so prompt caching maximizes hit rate:
//
//   1. Common system  — identical for every user, every goal, every call.
//                       Cached → 1000 users share one entry.
//   2. Goal context   — per-user (goal/phases/milestones). Stable for the
//                       length of a chat session.
//                       Cached → that user's repeat calls within 5m hit it.
//   3. Weekly tasks   — flips on every checkbox toggle. NOT cached so it
//                       doesn't invalidate the upstream blocks.
//
// Two cache_control breakpoints (after blocks 1 and 2) gives us a stable
// prefix when only block 3 changes.
// ---------------------------------------------------------------------------

const COMMON_SYSTEM = `${PERSONA}
IMPORTANT: Always address the user as "Hi Boss" at the start of each conversation. Be respectful and professional.

You are a friendly and knowledgeable AI goal coach. The user is working on a specific goal and you have full context about their progress.

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

function buildGoalContextBlock(context: GoalDetailChatContext): string {
  const phasesText = context.phases
    .map((p, i) => {
      const head = `  Phase ${i + 1} [${p.status}]: ${p.title} — ${p.description} (~${p.estimatedWeeks}w)`;
      if (!p.milestones || p.milestones.length === 0) return head;
      const milestones = p.milestones
        .map((m, j) => `    ${i + 1}.${j + 1} ${m}`)
        .join("\n");
      return `${head}\n${milestones}`;
    })
    .join("\n");

  return `GOAL: ${context.goalTitle}
${context.goalDescription ? `DESCRIPTION: ${context.goalDescription}` : ""}

ROADMAP:
${phasesText || "  (no phases yet)"}`;
}

function buildWeeklyContextBlock(context: GoalDetailChatContext): string {
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const tasksText =
    context.weeklyTasks.length > 0
      ? context.weeklyTasks
          .map(
            (t) =>
              `  ${dayNames[t.dayOfWeek]}: ${t.completed ? "[done]" : "[todo]"} ${t.title}${t.timeSlot ? ` (${t.timeSlot})` : ""}`
          )
          .join("\n")
      : "  No tasks scheduled yet.";
  return `THIS WEEK'S SCHEDULE:
${context.weekSummary ? `Summary: ${context.weekSummary}` : ""}
${tasksText}`;
}

function buildSystemBlocks(
  context: GoalDetailChatContext,
  userContext?: string,
): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: COMMON_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: buildGoalContextBlock(context), cache_control: { type: "ephemeral" } },
    { type: "text", text: buildWeeklyContextBlock(context) },
  ];
  // Long-term user memory + cross-goal active context. Uncached by design:
  // it changes after every 10-turn rollover and after each todo toggle, so
  // caching would invalidate too often to be useful.
  if (userContext && userContext.trim().length > 0) {
    blocks.push({ type: "text", text: userContext });
  }
  return blocks;
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
  onUsage?: (inputTokens: number, outputTokens: number) => void,
  userContext?: string,
): ReadableStream<Uint8Array> {
  const client = getAnthropicClient();
  const systemBlocks = buildSystemBlocks(context, userContext);
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
          system: systemBlocks,
          tools: SERVER_TOOLS,
          messages,
        });

        for await (const event of stream) {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        const finalMessage = await stream.finalMessage();

        // Log usage per-turn. The cache_* fields tell us prompt-caching
        // effectiveness: cache_read = bytes served from cache (10% cost),
        // cache_write = bytes that wrote new cache entries (1.25× cost).
        // Healthy ratio after warmup: cache_read >> cache_write, and
        // input_tokens shrinks toward the size of the volatile suffix.
        if (finalMessage.usage) {
          const u = finalMessage.usage;
          console.log("[goal-chat] usage", {
            input: u.input_tokens,
            output: u.output_tokens,
            cache_read: u.cache_read_input_tokens ?? 0,
            cache_write: u.cache_creation_input_tokens ?? 0,
          });
          if (onUsage) {
            try {
              onUsage(u.input_tokens, u.output_tokens);
            } catch { /* non-blocking */ }
          }
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
