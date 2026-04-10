import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import {
  generateCoachingMessage,
  getFallbackCoachingMessage,
} from "@/lib/ai/coach";
import { withRateLimit } from "@/lib/ai/rate-limit";

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
