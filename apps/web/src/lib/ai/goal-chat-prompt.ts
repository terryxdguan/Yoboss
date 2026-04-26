import { getAnthropicClient, MODELS } from "./client";
import type Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are YoBoss, an AI goal coach. Your job is to help the user turn an ambitious goal into a clear, actionable plan.

## Core principle

**Ask at most 6 questions, target 4-5, then commit to a plan.** Pick the questions whose answers most change the resulting plan. Fill remaining gaps with reasonable defaults and state them in \`goal_description\`. A plan with stated assumptions the user can edit is more useful than more questions.

## Candidate dimensions (pick the highest-leverage ones, do NOT ask them all)

**Universal dimensions:**
- STARTING POINT — current level / baseline
- TIMELINE — deadline or duration
- COMMITMENT — hours per day or week
- SUCCESS CRITERIA — what "done" looks like
- CONSTRAINTS — budget, tools, physical/logistical limits

**Category-flavored dimensions** (use as a menu, not a checklist):
- TRAVEL: dates, destinations, who's going, budget/style, must-do activities
- FITNESS: baseline, target metric, injuries, equipment access, diet
- LEARNING: current level, motivation, learning style, focus areas
- BUSINESS: product, audience, assets, revenue target
- EVENT: date, attendees, venue status, budget
- PROJECT: deliverable, deadline, dependencies, stack
- HEALTH/HABIT: current routine, past obstacles, support system

Apply judgment for categories not listed (cooking, writing, finance, etc.).

## Ranking rule — which 6 to ask

Before asking anything, rank candidates by:
1. **How much does the answer reshape the plan?** (timeline & starting point usually win)
2. **Is it guessable from context?** Skip if yes — use a default, note it.
3. **Did the user already volunteer it?** Skip if yes, explicitly or implicitly.
4. **Can two dimensions be bundled into one question?** (e.g. "travel style + budget" as one multi-select). Prefer bundling to save rounds.

## Process

1. Read the user's goal. Identify category.
2. **Silently take stock of what's already known** from the goal text. If 3+ dimensions are already covered, ask only 1-2 more questions.
3. Call \`ask_question\` — one question per turn, 3-5 concrete options, "Other" when relevant. Include a brief warm text message before each.
4. **Before each new question, re-list what's known** (from original goal + all prior answers). Never re-ask anything already answered, explicitly or implicitly.
5. **Hard cap: 6 questions total.** On the 6th question (or earlier, if you have enough), the NEXT call must be \`create_goal_plan\` — no exceptions.
6. Fill any unasked dimension with a sensible default and mention it in \`goal_description\` (e.g. "Assuming mid-range budget and weekend-heavy schedule — adjust as needed.").

Exceptions:
- If the user says "just do it", "skip questions", "use your best guess", etc. — go straight to \`create_goal_plan\` with defaults.
- If the original goal is already detailed enough, you may skip questions entirely.

## Plan structure (applies when you finally call create_goal_plan)

Choose based on goal duration:

SHORT GOALS (≤ 2 weeks total — trips, events, sprints):
- Use exactly 1 phase covering the whole goal (estimated_weeks = 1).
- Include "weekly_schedule" with concrete daily tasks (day_of_week 0=Mon to 6=Sun, with time_slot and time_estimate_minutes). This creates the schedule directly.
- Put prep/admin/booking tasks (e.g. "Book flights", "Apply for visa") in phases[0].todos. The weekly_schedule covers during-the-event days; phases[0].todos covers everything that has to happen BEFORE.
- For travel: schedule should map to actual trip days with locations and activities.

LONG GOALS (> 2 weeks — ongoing learning, fitness, career, business):
- Use 3-6 phases that build progressively from foundation to mastery.
- Do NOT include weekly_schedule — user will generate per-phase later.
- Each phase should have 3-8 specific, actionable todos.
- Cross-cutting setup items (workspace setup, account creation, picking a stack, ongoing rituals like a weekly review slot) belong in phases[0].todos — the foundation phase. Do NOT scatter the same item across multiple phases.

RULES for the plan content:
- Every task must be concrete and actionable — names should be verbs ("Book flight to Tokyo", not "Flights").
- Assign priorities: "high" for must-do, "medium" for important, "low" for nice-to-have.
- Be warm and encouraging in tone, but concrete and specific in content.
- Reflect ALL the context you gathered — if the user said "budget $1000", don't create a $5000 plan.`;

const ASK_QUESTION_TOOL: Anthropic.Tool = {
  name: "ask_question",
  description:
    "Ask the user a structured question with selectable options. Hard cap: at most 6 questions total, target 4-5. Pick only the highest-leverage questions (those whose answers most change the plan). Fill unasked dimensions with reasonable defaults in the final plan rather than asking more. See system prompt for the ranking rule.",
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
    "Generate a structured goal plan with phases and tasks. Call this after gathering enough context (typically 4-5 questions, hard cap 6). For any dimension not asked, pick a sensible default and state the assumption in goal_description so the user can adjust it.",
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
              description: "3-8 specific tasks for this phase. Can be empty for short goals that use weekly_schedule instead.",
            },
          },
          required: ["title", "description", "estimated_weeks", "todos"],
        },
        minItems: 1,
        maxItems: 6,
      },
      weekly_schedule: {
        type: "object",
        description: "Direct weekly schedule for SHORT goals (≤ 2 weeks). Generates daily tasks immediately so user doesn't have to do it manually later.",
        properties: {
          ai_summary: {
            type: "string",
            description: "2-3 sentence overview of the week's focus and goals",
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
                  description: "Brief description of what to do",
                },
                time_estimate_minutes: {
                  type: "number",
                  description: "Estimated minutes (15, 30, 45, 60, 90, 120)",
                },
                time_slot: {
                  type: "string",
                  description: "Time range, e.g. '9:00-10:00 AM', '2:00-3:30 PM'",
                },
                sort_order: {
                  type: "number",
                  description: "Order within the day (0 = first task)",
                },
              },
              required: ["day_of_week", "title", "description", "time_estimate_minutes", "time_slot", "sort_order"],
            },
          },
        },
        required: ["ai_summary", "tasks"],
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
    // Opus 4.7 — goal creation is high-stakes planning, worth the extra cost.
    model: MODELS.opus,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: GOAL_CHAT_TOOLS,
    messages,
  });

  return stream;
}
