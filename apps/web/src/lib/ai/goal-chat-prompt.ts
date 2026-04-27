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
- Include "weekly_schedule" with concrete daily tasks (day_of_week 0=Mon to 6=Sun, with time_slot and time_estimate_minutes). The weekly_schedule is where every actionable item lives — including one-time prep/admin (e.g. "Book flights" on Mon morning) AND during-event activities.
- phases[0].milestones is a 3-6 item bird's-eye outline of what the trip / event delivers (e.g. "Arrived in Tokyo", "All restaurant reservations confirmed", "Day-2 itinerary executed"). Read-only milestone markers — NOT a checklist the user ticks off. Action happens in weekly_schedule.
- For travel: schedule should map to actual trip days with locations and activities.

LONG GOALS (> 2 weeks — ongoing learning, fitness, career, business):
- Use 3-6 phases that build progressively from foundation to mastery.
- Do NOT include weekly_schedule — user will generate per-phase later.
- Each phase should have 3-6 specific milestones — these are the sub-phase markers, the bird's-eye outline of what the user accomplishes by the end of the phase. NOT a daily / weekly checklist. Phrase them as **completed states** ("Anki deck set up and seeded", "First 30-min tutor session done", "Rolled R + 5 vowels mastered"), not verb-imperative tasks ("Set up Anki", "Book tutor"). The user does NOT tick milestones off — the weekly schedule is where day-to-day check-offs happen.
- Cross-cutting setup outcomes (workspace ready, account opened, stack picked, weekly review cadence in place) belong as phases[0].milestones. Do NOT scatter the same milestone across multiple phases.

RULES for the plan content:
- **Milestones describe outcomes**, not actions. ("Top 1000 Spanish words deck built and reviewed daily" not "Set up Anki with deck").
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
            milestones: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    description: "A milestone — a completed-state phrase describing what the user has accomplished by the end of this milestone (e.g. 'Anki deck built and reviewed daily', 'First 30-min tutor session done'). NOT an action verb.",
                  },
                },
                required: ["title"],
              },
              description: "3-6 milestones for this phase — bird's-eye sub-phase markers, read-only on the UI. NOT a daily checklist.",
              minItems: 3,
              maxItems: 6,
            },
          },
          required: ["title", "description", "estimated_weeks", "milestones"],
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

// When the user creates a goal mid-week, the SHORT-goal path generates
// a weekly_schedule covering Mon-Sun by default. That leaves "past" days
// (Mon/Tue if today is Wed) cluttered with stale tasks the user can't
// realistically do. Append a today-awareness clause to the system prompt
// so the model only generates tasks from today onward. The save layer
// (use-goal-session.ts / goal-wizard-panel.tsx) does a defensive filter
// in case the model still emits past-day items.
function buildTodayNote(todayDow: number): string {
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return `

## Current day awareness

It's already ${dayNames[todayDow]} (day_of_week=${todayDow}). When generating \`weekly_schedule\` for a SHORT GOAL, only emit tasks for \`day_of_week\` ${todayDow} through 6 (${dayNames[todayDow]} through Sunday). Do NOT emit tasks for earlier days of this week — those days are already past and the user cannot act on them.`;
}

export async function chatWithGoalCoach(
  messages: Anthropic.MessageParam[],
  todayDow?: number
) {
  const client = getAnthropicClient();

  const system =
    typeof todayDow === "number" && todayDow > 0 && todayDow <= 6
      ? SYSTEM_PROMPT + buildTodayNote(todayDow)
      : SYSTEM_PROMPT;

  const stream = await client.messages.stream({
    // Opus 4.7 — goal creation is high-stakes planning, worth the extra cost.
    model: MODELS.opus,
    max_tokens: 4096,
    system,
    tools: GOAL_CHAT_TOOLS,
    messages,
  });

  return stream;
}
