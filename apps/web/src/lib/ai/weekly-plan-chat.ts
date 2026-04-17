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

## Core principle

Ask clarifying questions until you have every detail needed to build a concrete, personalized weekly plan. A generic plan the user won't follow is worse than a short delay to gather context. Quality over speed.

## Before calling create_weekly_plan, you MUST know:

**Universal:**
- SCHEDULE: which days the user is free this week, which days are busy / off-limits
- TIME PER DAY: how many hours they can dedicate on a typical free day this week
- TIME OF DAY: morning person, evening person, or flexible
- ENERGY: anything unusual this week (travel, low energy, recovery week, peak week)
- CURRENT CONTEXT: have they been following the goal regularly? Just starting? Coming back after a break?

**Phase-specific:**
- What sub-topics or sub-tasks from the current phase are most important to the user THIS WEEK?
- Any specific milestones they want to hit before next week?
- Any resources (tools, materials, people) they have or lack this week?

**Goal-category-specific — ask when relevant:**

For TRAVEL / TRIP weeks (the user is actively on or about to start a trip):
- Exact dates and locations for each day of the week
- Arrival / departure times
- Pre-booked activities
- Accommodation locations (affects which activities are feasible)
- Who they're with (affects pacing)

For FITNESS weeks:
- Recent training load / recovery state
- Access to equipment this week (home? gym? travel?)
- Any events this week (race, competition, test)

For LEARNING weeks:
- Where they left off last week
- What they want to have mastered by end of week
- Upcoming deadline or exam

For WORK / PROJECT weeks:
- Which deliverables are hard-due
- Meetings / collaboration dependencies
- Context-switching risks

Apply your judgment for other categories.

## Process

1. Greet the user briefly, referencing their goal / phase.
2. Call ask_question as many times as needed — one per turn — to gather the required context above.
3. Each question should be sharp, specific, with 3-5 concrete options (plus "Other" when relevant).
4. Each question must differ meaningfully from previous ones.
5. Only after you have enough detail to build a personalized plan, call create_weekly_plan.

There is NO fixed question count. Some weeks need 1 question, others need 4-5. Stop asking only when the plan you'd produce is specific enough that the user can execute it tomorrow without guessing.

Exception: if the user explicitly says "just generate it", "skip", or similar — proceed immediately with create_weekly_plan using reasonable defaults and note your assumptions in the ai_summary.

## Plan content rules

- Generate 2-4 tasks per day (fewer if the day is busy; more if it's open and the user said they want a packed week).
- Each task concrete and completable in one session.
- Time estimates in minutes (15, 30, 45, 60, 90, 120).
- Vary tasks across the week — don't repeat identical tasks daily.
- Balance difficulty: mix easy wins with challenging tasks.
- Assign time slots based on user's stated preference (morning person vs evening).
- Task titles are action-oriented verbs ("Run 5km at easy pace", not "Running").
- Be warm but concise in the ai_summary.
- Reflect ALL the context you gathered — if the user said "Wednesday is a full office day", don't schedule 3 hours of work on Wednesday.`;

const ASK_QUESTION_TOOL: Anthropic.Tool = {
  name: "ask_question",
  description:
    "Ask the user a structured question with selectable options. Use this to learn about their schedule, energy, context, and any phase-specific details needed before generating the plan. Call as many times as needed — see the system prompt for the required-context checklist. There is no fixed question count.",
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
  messages: Anthropic.MessageParam[],
  weeklyContext?: WeeklyPlanChatContext
) {
  const client = getAnthropicClient();
  const systemPrompt = weeklyContext
    ? `${SYSTEM_PROMPT}\n\nCURRENT CONTEXT:\n${buildContextBlock(weeklyContext)}`
    : SYSTEM_PROMPT;

  const stream = await client.messages.stream({
    // Opus 4.7 — weekly plan conversations benefit from stronger
    // reasoning when deciding which clarifying questions to ask.
    model: MODELS.opus,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [ASK_QUESTION_TOOL, CREATE_WEEKLY_PLAN_TOOL],
    messages,
  });

  return stream;
}

function buildContextBlock(c: WeeklyPlanChatContext): string {
  return `Goal: ${c.goalTitle}
${c.goalDescription ? `Description: ${c.goalDescription}\n` : ""}Current Phase: ${c.phaseTitle} — ${c.phaseDescription}
Week ${c.weekNumber} of estimated ${c.estimatedWeeks} weeks${c.isMidWeekStart ? `\nNote: It's already ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][c.startDayOfWeek!]}, so only plan from that day through Sunday.` : ""}`;
}
