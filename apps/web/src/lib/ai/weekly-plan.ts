import { getAnthropicClient, MODELS } from "./client";
import type { Phase, DailyTask } from "../types/database";

// Weekly plan generation: takes a phase and generates daily tasks for the current week.
// Uses Sonnet for structured but less creative generation.
// Classifies each task as USER_ACTION, AI_EXECUTABLE, or AI_ASSISTED.

const SYSTEM_PROMPT = `You are an AI goal coach generating a weekly plan.
Given a goal phase and context about the user's progress, create specific daily tasks for this week.

Guidelines:
- Generate 3-5 tasks per day (Mon-Sun, day_of_week 0-6)
- Each task should be concrete and completable in one session
- Include time estimates in minutes (15, 30, 45, 60, 90, 120)
- Vary tasks across the week (don't repeat the same task every day)
- Balance difficulty: mix easy wins with challenging tasks
- Group tasks logically: morning tasks first (lighter), afternoon (focused work), evening (review/practice)

Task classification:
- USER_ACTION: only the user can do this (practice speaking, attend a meeting, exercise, read)
- AI_EXECUTABLE: AI can produce a deliverable (create flashcards, research a topic, generate study materials, compile a report)
- AI_ASSISTED: AI can help but user finishes (draft an email, outline a presentation, suggest conversation topics)`;

const WEEKLY_PLAN_TOOL = {
  name: "create_weekly_plan" as const,
  description: "Create a structured weekly plan with daily tasks",
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
            execution_type: {
              type: "string",
              enum: ["user_action", "ai_executable", "ai_assisted"],
              description: "Who does this task?",
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

export interface GeneratedWeeklyPlan {
  ai_summary: string;
  tasks: {
    day_of_week: number;
    title: string;
    description: string;
    time_estimate_minutes: number;
    time_slot: string;
    sort_order: number;
  }[];
}

interface WeeklyPlanContext {
  goalTitle: string;
  goalDescription: string;
  phase: Phase;
  weekNumber: number;
  previousWeekTasks?: Pick<DailyTask, "title" | "completed">[];
  isFirstWeek: boolean;
  isMidWeekStart: boolean;
  startDayOfWeek?: number; // 0-6, only if mid-week start
}

export async function generateWeeklyPlan(
  context: WeeklyPlanContext
): Promise<GeneratedWeeklyPlan> {
  const client = getAnthropicClient();

  const previousWeekSummary = context.previousWeekTasks
    ? `Last week's tasks:\n${context.previousWeekTasks
        .map((t) => `- ${t.title}: ${t.completed ? "completed" : "not done"}`)
        .join("\n")}`
    : "This is the first week.";

  const midWeekNote = context.isMidWeekStart
    ? `\nIMPORTANT: The user started mid-week. Only generate tasks for day_of_week ${context.startDayOfWeek} through 6 (${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][context.startDayOfWeek!]} through Sunday).`
    : "";

  const userMessage = `Goal: ${context.goalTitle}
Description: ${context.goalDescription}
Current Phase: ${context.phase.title} — ${context.phase.description}
Week ${context.weekNumber} of estimated ${context.phase.estimated_weeks} weeks

${previousWeekSummary}${midWeekNote}

Generate this week's plan with daily tasks.`;

  const response = await client.messages.create({
    model: MODELS.sonnet,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [WEEKLY_PLAN_TOOL],
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (toolUse && toolUse.type === "tool_use") {
    return toolUse.input as GeneratedWeeklyPlan;
  }

  throw new Error("AI did not produce a structured weekly plan");
}
