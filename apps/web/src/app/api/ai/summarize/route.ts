import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { generateSummaryAndMemory } from "@/lib/ai/session-memory";
import { withRateLimit, logUsage } from "@/lib/ai/rate-limit";
import { upsertUserMemoryEntries, getUserMemory } from "@/lib/db/actions";

// Rolling session summary — usually short but protect against the
// Hobby 60s default in case of a slow Claude response or a very long
// chat history.
export const maxDuration = 300;

// POST /api/ai/summarize
//
// One Haiku call does double duty: refresh the session's rolling summary
// AND extract any new user-level long-term memory entries. Caller passes
// the prior summary + the messages to compress; we look up the user's
// existing user_memory rows server-side so the model can avoid dupes.
//
// Body: { sessionId?: string, oldSummary: string | null, messages: {role, content}[] }
// Returns: { summary, memoryAdded: number }
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

  const { oldSummary, messages, sessionId } = await request.json();

  try {
    // Pull the user's existing memory so the model doesn't propose
    // duplicates. Trimmed to {content} only since that's all the model
    // needs for dedup; full rows aren't useful here.
    const existing = await getUserMemory();
    const existingForPrompt = existing.map((m) => ({ content: m.content }));

    const result = await generateSummaryAndMemory({
      oldSummary,
      messagesToCompress: messages,
      existingMemory: existingForPrompt,
    });

    if (result.usage) {
      logUsage(
        user.id,
        "summarize",
        "claude-haiku-4-5",
        result.usage.input_tokens,
        result.usage.output_tokens,
      ).catch(() => {});
    }

    // Persist any new memory entries. Cap enforcement happens inside
    // upsertUserMemoryEntries (oldest 'low' first, then 'medium').
    let memoryAdded = 0;
    if (result.memoryCandidates.length > 0) {
      try {
        const inserted = await upsertUserMemoryEntries(
          result.memoryCandidates.map((c) => ({
            category: c.category,
            content: c.content,
            importance: c.importance,
            source_session_id: sessionId ?? null,
          })),
        );
        memoryAdded = inserted.length;
      } catch (err) {
        // Memory persistence failing shouldn't kill the summary path —
        // log and continue so the session summary still gets returned.
        console.error("[summarize] user_memory upsert failed", err);
      }
    }

    return NextResponse.json({ summary: result.summary, memoryAdded });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
