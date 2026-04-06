import { getAnthropicClient, MODELS } from "./client";
import type Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are YoBoss, an AI goal coach. Your job is to help the user turn an ambitious goal into a clear, actionable plan.

When a user describes their goal, follow this process:

STEP 1: Call ask_question to understand their STARTING POINT.
- Where are they now relative to this goal? (beginner, some experience, advanced)
- What have they already tried?

STEP 2: Call ask_question to understand their TIMELINE and COMMITMENT.
- How much time can they dedicate? (hours per day/week)
- What's their target deadline?

STEP 3: Call ask_question to understand their SUCCESS CRITERIA.
- What does "done" look like for them?
- What specific outcomes do they want?

STEP 4 (optional): Call ask_question about CONSTRAINTS or PREFERENCES.
- Any limitations (budget, tools, location)?
- Any preferences for approach?

AFTER gathering enough context (3-4 questions), call create_goal_plan to generate a structured plan with 3-6 phases.

RULES:
- Ask 3-4 questions total. Each question should have 3-5 concrete, specific options.
- Include a brief encouraging text message BEFORE each ask_question call.
- Each question must be meaningfully different — don't repeat similar questions.
- Options should be specific and actionable, not vague.
- If the user says "just do it" or "skip questions", proceed immediately with create_goal_plan using reasonable defaults.
- When generating the plan, make phases build progressively from foundation to mastery.
- Each phase should have 3-8 specific, actionable todos.
- Assign priorities: "high" for must-do tasks, "medium" for important tasks, "low" for nice-to-have.
- Be warm and encouraging in tone, but concrete and specific in content.`;

const ASK_QUESTION_TOOL: Anthropic.Tool = {
  name: "ask_question",
  description:
    "Ask the user a structured question with selectable options. Use this to gather information about their goal before creating the plan. Call this 3-4 times to understand starting point, timeline, success criteria, and constraints.",
  input_schema: {
    type: "object" as const,
    properties: {
      question: {
        type: "string",
        description: "The question to ask the user",
      },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Display text for this option",
            },
            value: {
              type: "string",
              description: "Value identifier for this option",
            },
          },
          required: ["label", "value"],
        },
        description: "3-5 selectable options",
      },
      allow_multiple: {
        type: "boolean",
        description: "True if user can select multiple options",
      },
      allow_other: {
        type: "boolean",
        description: "True to show an 'Other' option with free text input",
      },
    },
    required: ["question", "options", "allow_multiple", "allow_other"],
  },
};

const CREATE_GOAL_PLAN_TOOL: Anthropic.Tool = {
  name: "create_goal_plan",
  description:
    "Generate a structured goal plan with phases and tasks. Call this after gathering enough context from the user (3-4 questions answered).",
  input_schema: {
    type: "object" as const,
    properties: {
      goal_title: {
        type: "string",
        description: "Concise title for the goal (2-8 words)",
      },
      goal_description: {
        type: "string",
        description: "1-2 sentence summary of what the user wants to achieve",
      },
      phases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Phase title (e.g. 'Phase 1: Foundation')",
            },
            description: {
              type: "string",
              description: "What the user will accomplish in this phase",
            },
            estimated_weeks: {
              type: "number",
              description: "Estimated weeks to complete (1-8)",
            },
            todos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "Specific, actionable task",
                  },
                  priority: {
                    type: "string",
                    enum: ["high", "medium", "low"],
                  },
                },
                required: ["title", "priority"],
              },
              description: "3-8 specific tasks for this phase",
            },
          },
          required: ["title", "description", "estimated_weeks", "todos"],
        },
        minItems: 3,
        maxItems: 6,
      },
    },
    required: ["goal_title", "goal_description", "phases"],
  },
};

export const GOAL_CHAT_TOOLS = [ASK_QUESTION_TOOL, CREATE_GOAL_PLAN_TOOL];

export async function chatWithGoalCoach(
  messages: Anthropic.MessageParam[]
) {
  const client = getAnthropicClient();

  const stream = await client.messages.stream({
    model: MODELS.opus,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: GOAL_CHAT_TOOLS,
    messages,
  });

  return stream;
}
