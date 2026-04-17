import { getAnthropicClient, MODELS } from "./client";
import type Anthropic from "@anthropic-ai/sdk";

// Summarization is a low-stakes, cost-sensitive background task — the
// output is a fresh-reader synopsis, not a planning output. Sonnet 4.6
// produces an adequate summary at ~5× cheaper than Opus for a job the
// user never directly sees.
const SUMMARIZE_PROMPT = `Summarize the following conversation between a user and an AI goal coach into a single concise paragraph. Capture: (1) the user's goal and any decisions about phases or weekly plans they made, (2) constraints or preferences they mentioned (schedule, energy, blockers), (3) any unresolved questions. Keep it under 250 words. Output the summary text only — no preamble.`;

/** Produce a compact natural-language summary of a run of chat turns.
 *  Called by the goal-session dispatcher when a session has grown past
 *  50 turns; the result replaces the older slice of messages on the
 *  wire so token cost stays bounded. Caller persists via
 *  `setSessionSummary` so subsequent turns can reuse the same summary. */
export async function summarizeMessages(
  messages: Anthropic.MessageParam[]
): Promise<string> {
  const client = getAnthropicClient();
  const result = await client.messages.create({
    model: MODELS.sonnet,
    max_tokens: 800,
    system: SUMMARIZE_PROMPT,
    messages: [
      {
        role: "user",
        content: `Conversation transcript:\n\n${messages
          .map(
            (m) =>
              `${m.role === "user" ? "USER" : "ASSISTANT"}: ${
                typeof m.content === "string"
                  ? m.content
                  : JSON.stringify(m.content)
              }`
          )
          .join("\n\n")}`,
      },
    ],
  });
  const block = result.content[0];
  return block.type === "text" ? block.text : "";
}
