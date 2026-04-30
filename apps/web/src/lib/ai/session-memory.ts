import { getAnthropicClient } from "./client";

const SUMMARY_MODEL = "claude-haiku-4-5";
// Keep the last N turns in-flight to the model. Older turns get folded
// into a rolling Haiku summary every N turns. Shared across
// useGoalSession (goal-creation + weekly-planning), GoalChatPanel
// (coach), and the team agent chat — bumping this bumps all three.
const MAX_RECENT_MESSAGES = 10;

export type MemoryCandidate = {
  category: string | null;
  content: string;
  importance: "low" | "medium" | "high";
};

/**
 * Generate a rolling summary of conversation history.
 * Combines the old summary with messages that are about to be "compressed".
 * Uses Haiku for speed and low cost.
 */
export async function generateSessionSummary(
  oldSummary: string | null,
  messagesToCompress: { role: string; content: string }[]
): Promise<{ summary: string; usage?: { input_tokens: number; output_tokens: number } }> {
  const client = getAnthropicClient();

  const conversationText = messagesToCompress
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = oldSummary
    ? `Previous conversation summary:\n${oldSummary}\n\nNew messages:\n${conversationText}\n\nWrite a concise 2-3 sentence summary combining the previous summary with the new messages. Capture the key topics, decisions made, and any important details. Write in the same language the user used.`
    : `Conversation:\n${conversationText}\n\nWrite a concise 2-3 sentence summary of this conversation. Capture the key topics, decisions made, and any important details. Write in the same language the user used.`;

  const response = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return {
    summary: textBlock?.text || oldSummary || "",
    usage: response.usage,
  };
}

/**
 * Build the messages array for an API call with session memory.
 * Returns: [summary context message (if any)] + last 5 messages
 */
export function buildMessagesWithMemory(
  summary: string | null,
  allMessages: { role: string; content: string | object[] }[],
): { role: string; content: string | object[] }[] {
  const recent = allMessages.slice(-MAX_RECENT_MESSAGES);

  if (summary && allMessages.length > MAX_RECENT_MESSAGES) {
    // Inject summary as the first user message context
    // We prepend it as a system-like context note before the recent messages
    const summaryNote = `[Previous conversation summary: ${summary}]`;

    // If the first recent message is from user, prepend summary to it
    if (recent.length > 0 && recent[0].role === "user") {
      const first = recent[0];
      if (typeof first.content === "string") {
        return [
          { role: "user", content: `${summaryNote}\n\n${first.content}` },
          ...recent.slice(1),
        ];
      }
    }

    // Otherwise, add as a separate user message at the start
    return [
      { role: "user", content: summaryNote },
      { role: "assistant", content: "Understood, I have the context from our previous conversation." },
      ...recent,
    ];
  }

  return recent;
}

/**
 * Combined rollover: in one Haiku call, regenerate the rolling session
 * summary AND extract any new user-level memory candidates. Saves an LLM
 * call vs. running these as two separate prompts. The model is told what
 * the user already has in long-term memory so it doesn't propose dupes.
 *
 * Returns memoryCandidates as an array (possibly empty) of {category,
 * content, importance}. The caller is responsible for persisting both the
 * summary and any candidates via the user_memory DB helpers.
 */
export async function generateSummaryAndMemory(params: {
  oldSummary: string | null;
  messagesToCompress: { role: string; content: string }[];
  existingMemory: { content: string }[];
}): Promise<{
  summary: string;
  memoryCandidates: MemoryCandidate[];
  usage?: { input_tokens: number; output_tokens: number };
}> {
  const { oldSummary, messagesToCompress, existingMemory } = params;
  const client = getAnthropicClient();

  const conversationText = messagesToCompress
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const existingMemoryBlock =
    existingMemory.length > 0
      ? existingMemory.map((m) => `- ${m.content}`).join("\n")
      : "(none yet)";

  const prompt = `You are maintaining two pieces of state for an AI coach product:

1. A rolling session summary — 2-3 sentences capturing key topics, decisions, and details from the conversation. Combines with any prior summary.
2. User memory — long-term, stable preferences that apply ACROSS sessions (communication style, work context, ongoing goals/projects, recurring constraints, format preferences). NOT one-off task details, NOT short-term context.

## Existing user memory (do NOT duplicate these as new entries)
${existingMemoryBlock}

## Prior session summary (combine with new content below)
${oldSummary || "(none yet)"}

## New messages to incorporate
${conversationText}

## Your task
Return a JSON object with this exact shape (and nothing else — no prose, no markdown fences):

{
  "summary": "<2-3 sentence rolling summary in the user's language>",
  "memory_candidates": [
    {
      "category": "<one of: communication_style | work_context | preferences | goals_focus | background | other, or null>",
      "content": "<one fact about the user, verbatim in the user's language, ~10-25 words>",
      "importance": "<low | medium | high>"
    }
  ]
}

Rules for memory_candidates:
- Output ONLY entries that are TRULY user-level (would still be true next month, in any session, with any agent). Most rollovers should produce 0-2 candidates, sometimes 0.
- Skip anything already covered by existing memory above (even if phrased differently).
- Skip ephemeral details (today's task list, this week's plan, current chat topic).
- "high" = critical preferences the agent should always consider (e.g., language, accessibility, hard time constraints).
- "medium" = stable but not critical (e.g., prefers concise replies, works in fintech).
- "low" = useful color but easy to relearn (e.g., owns a dog named Max).
- If nothing qualifies, return an empty array.

Return ONLY the JSON, no other text.`;

  const response = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock?.text?.trim() || "";

  // Defensive parse: model sometimes wraps JSON in ```json ... ``` fences
  // despite "no markdown fences". Strip them before parsing.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: { summary?: string; memory_candidates?: MemoryCandidate[] } = {};
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    console.error("[session-memory] failed to parse rollover JSON", { raw, err });
    // Fall back to keeping the old summary and producing no candidates
    // rather than dropping the user's session memory entirely.
    return {
      summary: oldSummary || "",
      memoryCandidates: [],
      usage: response.usage,
    };
  }

  // Sanitize candidates: enforce shape, drop anything malformed, cap at
  // 5 per rollover so a runaway extraction can't blow past the user-level
  // 50-entry cap in a single turn.
  const validImportance = new Set(["low", "medium", "high"]);
  const candidates: MemoryCandidate[] = Array.isArray(parsed.memory_candidates)
    ? parsed.memory_candidates
        .filter(
          (c): c is MemoryCandidate =>
            !!c &&
            typeof c.content === "string" &&
            c.content.trim().length > 0 &&
            validImportance.has(c.importance),
        )
        .map((c) => ({
          category: typeof c.category === "string" ? c.category : null,
          content: c.content.trim(),
          importance: c.importance,
        }))
        .slice(0, 5)
    : [];

  return {
    summary: parsed.summary?.trim() || oldSummary || "",
    memoryCandidates: candidates,
    usage: response.usage,
  };
}

export { MAX_RECENT_MESSAGES };
