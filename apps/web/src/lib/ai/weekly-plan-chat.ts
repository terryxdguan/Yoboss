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

**Ask at most 3 questions, target 1-2, then commit to a plan.** The goal, phase description, and week number already give you most of what you need. Ask only the 1-3 questions whose answers would most change this week's plan. Fill every other dimension with a reasonable default and state it in \`ai_summary\` so the user can adjust. A plan with stated assumptions is more useful than another question.

## Candidate dimensions (pick the highest-leverage one or two, do NOT ask them all)

**Universal:**
- SCHEDULE — which days are free vs. busy / off-limits this week
- TIME PER DAY — hours available on a typical free day
- TIME OF DAY — morning / evening / flexible
- ENERGY — anything unusual this week (travel, recovery, peak)
- CURRENT CONTEXT — following regularly, just starting, or coming back

**Phase / category flavored** (use as a menu, not a checklist):
- Phase focus — which sub-topic matters most THIS week
- TRAVEL week: per-day locations, arrival/departure, pre-booked activities
- FITNESS week: recent load, equipment access, events this week
- LEARNING week: where they left off, mastery target, upcoming deadline
- WORK/PROJECT week: hard-due deliverables, meeting dependencies

Apply judgment for categories not listed.

## Ranking rule — which 1-3 to ask

Before asking anything, rank candidates by:
1. **How much does the answer reshape the week's schedule?** (SCHEDULE and ENERGY usually win; TIME OF DAY often guessable.)
2. **Is it already implied by the goal / phase / week number?** Skip if yes — use a sensible default.
3. **Did the user already volunteer it in the initial message?** Skip if yes.
4. **Can two dimensions be bundled into one multi-select question?** (e.g. "Which days are busy + how many hours on free days" as one question). Prefer bundling.

## Process

1. Greet the user briefly, referencing their goal / phase.
2. **Silently take stock of what's already known** from the goal title, description, phase, and week number. Most weeks, 1-2 questions are enough.
3. Call \`ask_question\` — one question per turn, 3-5 concrete options, "Other" when relevant.
4. **Before each new question, re-list what's known** (from context + prior answers). Never re-ask anything already answered, explicitly or implicitly.
5. **Hard cap: 3 questions total.** On the 3rd question (or earlier, if you have enough), the NEXT call must be \`create_weekly_plan\` — no exceptions.
6. For every dimension you did NOT ask, pick a sensible default (e.g. "assuming evenly spread across weekdays, 60-90 min per session") and mention it in \`ai_summary\`.

Exception: if the user says "just generate it", "skip", or similar — proceed immediately with \`create_weekly_plan\`, defaults noted in \`ai_summary\`.

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
    "Ask the user a structured question with selectable options. Hard cap: at most 3 questions total, target 1-2. Pick only the highest-leverage questions (those whose answers most reshape this week's schedule). Fill unasked dimensions with reasonable defaults in the final plan rather than asking more. See system prompt for the ranking rule.",
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
    "Generate a structured weekly plan with daily tasks. Call this after gathering schedule context (typically 1-2 questions, hard cap 3). For any dimension not asked, pick a sensible default and state the assumption in ai_summary so the user can adjust.",
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
