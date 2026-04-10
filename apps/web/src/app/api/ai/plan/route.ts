import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { withRateLimit } from "@/lib/ai/rate-limit";
import { chatWithCoach } from "@/lib/ai/decompose";
import { chatWithGoalCoach } from "@/lib/ai/goal-chat-prompt";
import { generateWeeklyPlan } from "@/lib/ai/weekly-plan";
import { chatWithWeeklyPlanCoach } from "@/lib/ai/weekly-plan-chat";
import { streamGoalDetailChat, type GoalDetailChatContext } from "@/lib/ai/goal-detail-chat";
import { generateWeeklyReview } from "@/lib/ai/review";
import type { ConversationMessage } from "@/lib/ai/decompose";
import type Anthropic from "@anthropic-ai/sdk";

// POST /api/ai/plan
// Handles three actions: chat (goal creation), weekly (plan generation), review
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
      // Conversational goal creation (streaming)
      const { messages } = body as {
        messages: ConversationMessage[];
      };

      const stream = await chatWithCoach(messages);

      // Return as streaming response
      return new Response(stream.toReadableStream(), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (action === "weekly") {
      // Weekly plan generation (non-streaming, returns JSON)
      const { context } = body;
      const plan = await generateWeeklyPlan(context);
      return NextResponse.json(plan);
    }

    if (action === "review") {
      // Weekly review (streaming)
      const { context } = body;
      const stream = await generateWeeklyReview(context);

      return new Response(stream.toReadableStream(), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (action === "weekly-chat") {
      // Weekly plan generation with chat (streaming + tool_use)
      const { messages } = body as { messages: Anthropic.MessageParam[] };
      const stream = await chatWithWeeklyPlanCoach(messages);

      return new Response(stream.toReadableStream(), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (action === "goal-detail-chat") {
      // General goal discussion with server-side tools (web search, code execution)
      const { messages, context } = body as {
        messages: Anthropic.MessageParam[];
        context: GoalDetailChatContext;
      };
      const readableStream = streamGoalDetailChat(messages, context);

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    if (action === "goal-chat") {
      // Goal creation with structured questions (streaming + tool_use)
      const { messages } = body as { messages: Anthropic.MessageParam[] };
      const stream = await chatWithGoalCoach(messages);

      return new Response(stream.toReadableStream(), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
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
