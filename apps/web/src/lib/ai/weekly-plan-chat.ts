import { getAnthropicClient, MODELS } from "./client";
import type Anthropic from "@anthropic-ai/sdk";

export interface WeeklyPlanChatContext {
  goalTitle: string;
  goalDescription: string;
  phaseTitle: string;
  phaseDescription: string;
  weekNumber: number;
  estimatedWeeks: number;
  isMidWeekStart: boolean;
  startDayOfWeek?: number;
}

const SYSTEM_PROMPT = `You are YoBoss, an AI goal coach helping the user plan their week.
You already know their goal and current phase (provided in the first message). Your job is to generate a practical, personalized weekly plan.

PROCESS:
1. Greet the user briefly, referencing their goal/phase. Then call ask_question to learn about their SCHEDULE this week — what days/times they're free, any busy days or commitments.
2. Based on their answer, call create_weekly_plan to generate daily tasks.

If the user says "just generate it", "skip", or anything indicating they want to skip questions — proceed immediately with create_weekly_plan using reasonable defaults (spread tasks across all available days, morning & afternoon slots).

RULES:
- Ask at most 1-2 questions. Keep it fast — the user wants their plan quickly.
- Generate 2-4 tasks per day.
- Each task should be concrete and completable in one session.
- Include time estimates in minutes (15, 30, 45, 60, 90, 120).
- Vary tasks across the week — don't repeat the same task every day.
- Balance difficulty: mix easy wins with challenging tasks.
- Assign logical time slots: morning for lighter tasks, afternoon for focused work.
- Be warm but concise.`;

const ASK_QUESTION_TOOL: Anthropic.Tool = {
  name: "ask_question",
  description:
    "Ask the user a structured question with selectable options. Use this to learn about their schedule or preferences before generating the plan.",
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

const CREATE_WEEKLY_PLAN_TOOL: Anthropic.Tool = {
  name: "create_weekly_plan",
  description:
    "Generate a structured weekly plan with daily tasks. Call this after gathering schedule context from the user (or immediately if they want to skip questions).",
  input_schema: {
    type: "object" as const,
    properties: {
      ai_summary: {
        type: "string",
        description:
          "A 2-3 sentence overview of this week's focus and goals",
      },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            day_of_week: {
              type: "number",
              description: "0=Monday, 1=Tuesday, ..., 6=Sunday",
            },
            title: {
              type: "string",
              description: "Specific, actionable task title",
            },
            description: {
              type: "string",
              description: "Brief description with any helpful details",
            },
            time_estimate_minutes: {
              type: "number",
              description: "Estimated minutes (15, 30, 45, 60, 90, 120)",
            },
            time_slot: {
              type: "string",
              description:
                "Suggested time slot (e.g. '9:00-9:30 AM', '2:00-3:00 PM')",
            },
            sort_order: {
              type: "number",
              description:
                "Order within the day (0=first task of the day, 1=second, etc.)",
            },
          },
          required: [
            "day_of_week",
            "title",
            "description",
            "time_estimate_minutes",
            "time_slot",
            "sort_order",
          ],
        },
        description: "All tasks for the week",
      },
    },
    required: ["ai_summary", "tasks"],
  },
};

export function buildInitialMessage(context: WeeklyPlanChatContext): string {
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const midWeekNote = context.isMidWeekStart
    ? `\nNote: It's already ${dayNames[context.startDayOfWeek!]}, so only plan from ${dayNames[context.startDayOfWeek!]} through Sunday.`
    : "";

  return `Help me plan this week for my goal.

Goal: ${context.goalTitle}
${context.goalDescription ? `Description: ${context.goalDescription}` : ""}
Current Phase: ${context.phaseTitle} — ${context.phaseDescription}
Week ${context.weekNumber} of estimated ${context.estimatedWeeks} weeks${midWeekNote}`;
}

export async function chatWithWeeklyPlanCoach(
  messages: Anthropic.MessageParam[]
) {
  const client = getAnthropicClient();

  const stream = await client.messages.stream({
    model: MODELS.sonnet,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [ASK_QUESTION_TOOL, CREATE_WEEKLY_PLAN_TOOL],
    messages,
  });

  return stream;
}
