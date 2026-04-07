import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { generateSessionSummary } from "@/lib/ai/session-memory";

// POST /api/ai/summarize — generate rolling session summary
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { oldSummary, messages } = await request.json();

  try {
    const summary = await generateSessionSummary(oldSummary, messages);
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
