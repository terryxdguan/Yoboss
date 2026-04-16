import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getAnthropicClient, MODELS } from "@/lib/ai/client";
import { withRateLimit, logUsage } from "@/lib/ai/rate-limit";
import { readFile } from "fs/promises";
import { join } from "path";
import type Anthropic from "@anthropic-ai/sdk";

// Vercel Hobby serverless function default is 60s. Without this override,
// any chat that triggers multiple web_search + code_execution rounds (e.g.
// a research task that generates a downloadable file) dies silently mid-
// stream: the SSE connection drops, the client sees the partial tool-use
// chatter, no "done" signal arrives, and nothing is persisted. Extend to
// the Hobby ceiling of 300s. Still not enough for very long research
// tasks — those need Pro (900s) or a background-worker architecture.
// Single-turn now (continuation loop moved to client). Each turn is one
// messages.stream() call which typically completes in 30-60s.
export const maxDuration = 120;

const SERVER_TOOLS: Anthropic.Messages.ToolUnion[] = [
  { type: "web_search_20260209" as const, name: "web_search" as const },
  { type: "web_fetch_20260209" as const, name: "web_fetch" as const },
  { type: "code_execution_20260120" as const, name: "code_execution" as const },
];

async function loadPromptFile(promptFile: string): Promise<string> {
  const filePath = join(
    process.cwd(),
    "src",
    "lib",
    "ai",
    "agent-prompts",
    promptFile
  );
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "You are a helpful AI assistant.";
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = await withRateLimit(user.id, "agent-chat");
  if (!rateCheck.allowed) return rateCheck.response;

  const body = await request.json();
  const { promptFile, messages, extraContext, useOpus } = body as {
    promptFile: string;
    messages: Anthropic.MessageParam[];
    extraContext?: string;
    useOpus?: boolean;
  };

  try {
    const basePrompt = await loadPromptFile(promptFile);
    const yobossPrefix = `IMPORTANT: Always address the user as "Hi Boss" at the start of each conversation. Be respectful and professional.

FILE GENERATION: When generating ANY file (HTML, PDF, PPT, Excel, etc.) using code execution, you MUST copy the output file to $OUTPUT_DIR so the user can download it. Example: after creating a file, run: cp /tmp/myfile.html $OUTPUT_DIR/myfile.html. The $OUTPUT_DIR environment variable is pre-set. Only files in $OUTPUT_DIR are downloadable.

`;
    const fullPrompt = yobossPrefix + basePrompt;
    const systemPrompt = extraContext
      ? `${fullPrompt}\n\n---\nADDITIONAL CONTEXT:\n${extraContext}`
      : fullPrompt;

    const client = getAnthropicClient();
    const encoder = new TextEncoder();

    const modelName = useOpus ? MODELS.opus : MODELS.sonnet;
    // Single-turn stream: run exactly ONE messages.stream() call and
    // emit a synthetic turn_complete event at the end. The client-side
    // useContinuationStream hook handles the pause_turn → re-fetch
    // loop, giving each turn its own Vercel timeout budget.
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const apiStream = client.messages.stream({
            model: modelName,
            max_tokens: 16000,
            system: systemPrompt,
            tools: SERVER_TOOLS,
            messages,
          });

          for await (const event of apiStream) {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          const finalMessage = await apiStream.finalMessage();

          // Log usage per-turn (server-side, simpler than accumulating
          // across client-driven continuations).
          if (finalMessage.usage) {
            logUsage(
              user.id,
              "agent-chat",
              modelName,
              finalMessage.usage.input_tokens,
              finalMessage.usage.output_tokens
            ).catch(() => {});
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
          const errorMsg =
            err instanceof Error ? err.message : "Unknown error";
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

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Agent chat error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `AI service error: ${msg}` },
      { status: 500 }
    );
  }
}
