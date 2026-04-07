import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getAnthropicClient, MODELS } from "@/lib/ai/client";
import { readFile } from "fs/promises";
import { join } from "path";
import type Anthropic from "@anthropic-ai/sdk";

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

  const body = await request.json();
  const { promptFile, messages, extraContext } = body as {
    promptFile: string;
    messages: Anthropic.MessageParam[];
    extraContext?: string;
  };

  try {
    const basePrompt = await loadPromptFile(promptFile);
    const yobossPrefix = `IMPORTANT: Always address the user as "YoBoss" at the start of each conversation. Be respectful and professional.\n\n`;
    const fullPrompt = yobossPrefix + basePrompt;
    const systemPrompt = extraContext
      ? `${fullPrompt}\n\n---\nADDITIONAL CONTEXT:\n${extraContext}`
      : fullPrompt;

    const client = getAnthropicClient();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let currentMessages = [...messages];
        let continuations = 0;
        const MAX_CONTINUATIONS = 5;

        try {
          while (continuations < MAX_CONTINUATIONS) {
            const apiStream = client.messages.stream({
              model: MODELS.sonnet,
              max_tokens: 16000,
              system: systemPrompt,
              tools: SERVER_TOOLS,
              messages: currentMessages,
            });

            for await (const event of apiStream) {
              const data = JSON.stringify(event);
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }

            const finalMessage = await apiStream.finalMessage();

            if (finalMessage.stop_reason === "pause_turn") {
              currentMessages = [
                ...currentMessages,
                { role: "assistant" as const, content: finalMessage.content },
              ];
              continuations++;
              continue;
            }

            break;
          }
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
    return NextResponse.json(
      { error: "AI service error. Please try again." },
      { status: 500 }
    );
  }
}
