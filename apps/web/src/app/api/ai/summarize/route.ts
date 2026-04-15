import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { generateSessionSummary } from "@/lib/ai/session-memory";
import { withRateLimit, logUsage } from "@/lib/ai/rate-limit";

// Rolling session summary — usually short but protect against the
// Hobby 60s default in case of a slow Claude response or a very long
// chat history.
export const maxDuration = 300;

// POST /api/ai/summarize — generate rolling session summary
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = await withRateLimit(user.id, "summarize");
  if (!rateCheck.allowed) return rateCheck.response;

  const { oldSummary, messages } = await request.json();

  try {
    const result = await generateSessionSummary(oldSummary, messages);
    if (result.usage) {
      logUsage(user.id, "summarize", "claude-haiku-4-5", result.usage.input_tokens, result.usage.output_tokens).catch(() => {});
    }
    return NextResponse.json({ summary: result.summary });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
