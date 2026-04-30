import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { withRateLimit, logUsage } from "@/lib/ai/rate-limit";
import { chatWithGoalCoach } from "@/lib/ai/goal-chat-prompt";
import { generateWeeklyPlan } from "@/lib/ai/weekly-plan";
import { chatWithWeeklyPlanCoach, type WeeklyPlanChatContext } from "@/lib/ai/weekly-plan-chat";
import { streamGoalDetailChat, type GoalDetailChatContext } from "@/lib/ai/goal-detail-chat";
import { generateWeeklyReview } from "@/lib/ai/review";
import { buildUserContext } from "@/lib/ai/user-context";
import type Anthropic from "@anthropic-ai/sdk";

// Extend beyond the Hobby 60s default. Streaming actions like goal-chat,
// weekly plan generation, and weekly review can take 30-120s on their own.
export const maxDuration = 300;

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

    if (action === "goal-chat") {
      const { messages } = body as { messages: Anthropic.MessageParam[] };
      const userContext = await buildUserContext();
      const stream = await chatWithGoalCoach(messages, undefined, userContext);
      return new Response(
        streamWithUsageLog(stream, user.id, "goal-chat", "claude-opus-4-6"),
        { headers: SSE_HEADERS }
      );
    }

    if (action === "goal-session") {
      const { messages, intent, context, todayDow } = body as {
        messages: Anthropic.MessageParam[];
        intent: "goal-creation" | "weekly-planning" | "coach";
        context?: {
          weekly?: WeeklyPlanChatContext;
          coach?: GoalDetailChatContext;
        };
        // 0=Mon..6=Sun, derived from the client's local clock. Only used
        // by the goal-creation intent to skip past days when the SHORT
        // goal path generates weekly_schedule mid-week. weekly-planning
        // already carries this in context.weekly.startDayOfWeek.
        todayDow?: number;
      };

      // Context compression lives client-side (session-memory.ts):
      // callers already pass `summary + last 5 messages` via
      // buildMessagesWithMemory. No server-side trimming needed.

      // Long-term user memory + active goals snapshot. Built once per
      // request and threaded into whichever intent we dispatch. Same
      // value across intents — keeps the user's cross-session preferences
      // visible regardless of where they're chatting.
      const userContext = await buildUserContext();

      if (intent === "coach") {
        if (!context?.coach) {
          return NextResponse.json(
            { error: "coach intent requires context.coach" },
            { status: 400 }
          );
        }
        // streamGoalDetailChat takes its own usage logger callback; it
        // doesn't slot into streamWithUsageLog's .on("message") pattern.
        const readableStream = streamGoalDetailChat(
          messages,
          context.coach,
          (inputTokens, outputTokens) => {
            logUsage(user.id, "goal-session-coach", "claude-opus-4-7", inputTokens, outputTokens).catch(() => {});
          },
          userContext,
        );
        return new Response(readableStream, { headers: SSE_HEADERS });
      }

      let stream;
      let logRoute: string;
      if (intent === "weekly-planning") {
        if (!context?.weekly) {
          return NextResponse.json(
            { error: "weekly intent requires context.weekly" },
            { status: 400 }
          );
        }
        stream = await chatWithWeeklyPlanCoach(messages, context.weekly, userContext);
        logRoute = "goal-session-weekly";
      } else {
        stream = await chatWithGoalCoach(messages, todayDow, userContext);
        logRoute = "goal-session-creation";
      }

      return new Response(
        streamWithUsageLog(stream, user.id, logRoute, "claude-opus-4-7"),
        { headers: SSE_HEADERS }
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error(`AI plan error (${action}):`, error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
