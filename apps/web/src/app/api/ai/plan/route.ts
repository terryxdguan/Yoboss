import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { withRateLimit, logUsage } from "@/lib/ai/rate-limit";
import { chatWithCoach } from "@/lib/ai/decompose";
import { chatWithGoalCoach } from "@/lib/ai/goal-chat-prompt";
import { generateWeeklyPlan } from "@/lib/ai/weekly-plan";
import { chatWithWeeklyPlanCoach } from "@/lib/ai/weekly-plan-chat";
import { streamGoalDetailChat, type GoalDetailChatContext } from "@/lib/ai/goal-detail-chat";
import { generateWeeklyReview } from "@/lib/ai/review";
import type { ConversationMessage } from "@/lib/ai/decompose";
import type Anthropic from "@anthropic-ai/sdk";

/** Attach a usage logger to an Anthropic MessageStream, then return the ReadableStream */
function streamWithUsageLog(
  stream: ReturnType<Anthropic.Messages["stream"]>,
  userId: string,
  route: string,
  model: string
): ReadableStream {
  stream.on("message", (msg: Anthropic.Message) => {
    if (msg.usage) {
      logUsage(userId, route, model, msg.usage.input_tokens, msg.usage.output_tokens).catch(() => {});
    }
  });
  return stream.toReadableStream();
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

// POST /api/ai/plan
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = await withRateLimit(user.id, "plan");
  if (!rateCheck.allowed) return rateCheck.response;

  const body = await request.json();
  const { action } = body;

  try {
    if (action === "chat") {
      const { messages } = body as { messages: ConversationMessage[] };
      const stream = await chatWithCoach(messages);
      return new Response(
        streamWithUsageLog(stream, user.id, "chat", "claude-opus-4-6"),
        { headers: SSE_HEADERS }
      );
    }

    if (action === "weekly") {
      const { context } = body;
      const plan = await generateWeeklyPlan(context);
      // Log usage from attached _usage field
      const usage = (plan as unknown as Record<string, unknown>)._usage as { input_tokens: number; output_tokens: number } | undefined;
      if (usage) {
        logUsage(user.id, "weekly", "claude-sonnet-4-6", usage.input_tokens, usage.output_tokens).catch(() => {});
        delete (plan as unknown as Record<string, unknown>)._usage;
      }
      return NextResponse.json(plan);
    }

    if (action === "review") {
      const { context } = body;
      const stream = await generateWeeklyReview(context);
      return new Response(
        streamWithUsageLog(stream, user.id, "review", "claude-sonnet-4-6"),
        { headers: SSE_HEADERS }
      );
    }

    if (action === "weekly-chat") {
      const { messages } = body as { messages: Anthropic.MessageParam[] };
      const stream = await chatWithWeeklyPlanCoach(messages);
      return new Response(
        streamWithUsageLog(stream, user.id, "weekly-chat", "claude-sonnet-4-6"),
        { headers: SSE_HEADERS }
      );
    }

    if (action === "goal-detail-chat") {
      const { messages, context } = body as {
        messages: Anthropic.MessageParam[];
        context: GoalDetailChatContext;
      };
      const readableStream = streamGoalDetailChat(messages, context, (inputTokens, outputTokens) => {
        logUsage(user.id, "goal-detail-chat", "claude-sonnet-4-6", inputTokens, outputTokens).catch(() => {});
      });

      return new Response(readableStream, { headers: SSE_HEADERS });
    }

    if (action === "goal-chat") {
      const { messages } = body as { messages: Anthropic.MessageParam[] };
      const stream = await chatWithGoalCoach(messages);
      return new Response(
        streamWithUsageLog(stream, user.id, "goal-chat", "claude-opus-4-6"),
        { headers: SSE_HEADERS }
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error(`AI plan error (${action}):`, error);
    return NextResponse.json(
      { error: "AI service error. Please try again." },
      { status: 500 }
    );
  }
}
