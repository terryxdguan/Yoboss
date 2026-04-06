import { getAnthropicClient, MODELS } from "./client";

// Goal decomposition: takes a user's goal description and breaks it into 3-6 phases.
// Uses Opus for complex reasoning about ambiguous goals.
// Called via /api/ai/plan route (streaming).

const SYSTEM_PROMPT = `You are an AI goal coach. The user will describe an ambitious personal goal.
Your job is to decompose it into 3-6 actionable phases that build on each other.

Each phase should:
- Have a clear title (2-5 words)
- Have a description explaining what the user will accomplish
- Have an estimated duration in weeks (1-8 weeks per phase)
- Build logically on the previous phase

Think about the goal holistically. Consider:
- What foundational skills or knowledge come first?
- What's the natural progression from beginner to advanced?
- What milestones mark real progress?

Be specific and actionable. "Get better at X" is not a phase. "Build conversational fluency through daily 15-minute practice sessions" is.`;

const DECOMPOSE_TOOL = {
  name: "create_goal_plan" as const,
  description:
    "Create a structured goal plan with phases. Call this when you have enough information to decompose the goal.",
  input_schema: {
    type: "object" as const,
    properties: {
      goal_title: {
        type: "string",
        description:
          "A concise title for the goal (e.g., 'Speak English Like a Native')",
      },
      goal_description: {
        type: "string",
        description:
          "A 1-2 sentence summary of what the user wants to achieve and why",
      },
      phases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Phase title (2-5 words)" },
            description: {
              type: "string",
              description: "What the user will accomplish in this phase",
            },
            estimated_weeks: {
              type: "number",
              description: "Estimated weeks to complete (1-8)",
            },
          },
          required: ["title", "description", "estimated_weeks"],
        },
        minItems: 3,
        maxItems: 6,
        description: "3-6 phases that build on each other",
      },
    },
    required: ["goal_title", "goal_description", "phases"],
  },
};

export interface DecomposedGoal {
  goal_title: string;
  goal_description: string;
  phases: {
    title: string;
    description: string;
    estimated_weeks: number;
  }[];
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// Non-streaming: for when the AI decides to decompose after conversation
export async function decomposeGoal(
  conversationHistory: ConversationMessage[]
): Promise<DecomposedGoal> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: MODELS.opus,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [DECOMPOSE_TOOL],
    messages: conversationHistory,
  });

  // Extract tool use result
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (toolUse && toolUse.type === "tool_use") {
    return toolUse.input as DecomposedGoal;
  }

  throw new Error("AI did not produce a structured goal plan");
}

// Streaming conversation: for the clarification chat flow
// Returns a stream of text (clarifying questions) or ends with a tool_use (decomposition)
export async function chatWithCoach(
  conversationHistory: ConversationMessage[]
) {
  const client = getAnthropicClient();

  const stream = await client.messages.stream({
    model: MODELS.opus,
    max_tokens: 4096,
    system: `${SYSTEM_PROMPT}

When the user first describes their goal, ask 1-2 clarifying questions to understand:
- Their current level / starting point
- Their timeline or urgency
- What success looks like to them

Keep questions conversational and warm. Don't ask more than 2 questions at a time.
When you have enough context (usually after 1-2 rounds of questions), call the create_goal_plan tool.
If the user says something like "just do it" or "that's enough info", proceed with what you have.`,
    tools: [DECOMPOSE_TOOL],
    messages: conversationHistory,
  });

  return stream;
}
