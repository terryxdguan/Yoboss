import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import {
  generateCoachingMessage,
  getFallbackCoachingMessage,
} from "@/lib/ai/coach";
import { withRateLimit, logUsage } from "@/lib/ai/rate-limit";

// Streams the daily coaching message. Extend past Hobby's 60s default so
// a slow Claude response or a few tool rounds doesn't silently truncate.
export const maxDuration = 300;

// POST /api/ai/coach
// Generates a daily coaching message (streaming)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = await withRateLimit(user.id, "coach");
  if (!rateCheck.allowed) return rateCheck.response;

  try {
    const { context } = await request.json();
    const stream = await generateCoachingMessage(context);

    stream.on("message", (msg) => {
      if (msg.usage) {
        logUsage(user.id, "coach", "claude-sonnet-4-6", msg.usage.input_tokens, msg.usage.output_tokens).catch(() => {});
      }
    });

    return new Response(stream.toReadableStream(), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Coaching message error:", error);

    // Return fallback message instead of error
    const { context } = await request.clone().json().catch(() => ({
      context: { todayTasks: [] },
    }));

    const fallback = getFallbackCoachingMessage(
      context?.todayTasks ?? []
    );

    return NextResponse.json({ content: fallback, isFallback: true });
  }
}
