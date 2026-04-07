import { getAnthropicClient } from "./client";

const SUMMARY_MODEL = "claude-haiku-4-5";
const MAX_RECENT_MESSAGES = 5;

/**
 * Generate a rolling summary of conversation history.
 * Combines the old summary with messages that are about to be "compressed".
 * Uses Haiku for speed and low cost.
 */
export async function generateSessionSummary(
  oldSummary: string | null,
  messagesToCompress: { role: string; content: string }[]
): Promise<string> {
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
  return textBlock?.text || oldSummary || "";
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

export { MAX_RECENT_MESSAGES };
