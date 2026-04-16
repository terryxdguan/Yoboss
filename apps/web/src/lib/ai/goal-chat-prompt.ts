import { getAnthropicClient, MODELS } from "./client";
import type Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are YoBoss, an AI goal coach. Your job is to help the user turn an ambitious goal into a clear, actionable plan.

## Core principle

Ask clarifying questions until you have **every detail needed to build a concrete, useful plan**. Do not guess. A plan with missing context is worse than a short delay to gather it. Quality over speed.

## Before calling create_goal_plan, you MUST know ALL of the following:

**Universal details (every goal):**
- STARTING POINT: where the user is now (beginner, experienced, advanced)
- TIMELINE: target deadline or target duration
- COMMITMENT: hours per day or per week the user can dedicate
- SUCCESS CRITERIA: what "done" looks like for them — specific outcomes
- CONSTRAINTS: budget, tools available, physical/logistical limits

**Goal-category-specific details — ask ALL that apply:**

For TRAVEL / TRIP goals:
- Exact departure and arrival dates (or "flexible but roughly when")
- Destination(s) — which cities, countries
- Trip duration — how many days total
- Who is going — solo, couple, family with kids (which ages), group
- Budget — total trip budget or per-day
- Travel style — luxury, mid-range, backpacking
- Must-do activities or interests (food, hiking, museums, etc.)
- Accommodation preferences — hotel, hostel, airbnb
- Transportation preferences — flights, trains, driving

For FITNESS goals:
- Current fitness baseline (weight, can they run 5km, etc.)
- Target metric (weight, strength, event like marathon)
- Any injuries or health constraints
- Access to gym / equipment
- Diet constraints or preferences

For LEARNING / SKILL goals:
- Current level (none, hobby, professional)
- Why they want this (job, hobby, exam)
- Preferred learning style (books, video, hands-on projects)
- Time dedication pattern (daily sessions? weekend sprints?)
- Any specific sub-skills or topics they care about most

For BUSINESS / LAUNCH goals:
- Product/service specifics
- Target audience or market
- Existing assets (skills, capital, team)
- Revenue goal and timeline
- Legal/regulatory environment

For EVENT goals:
- Exact date(s) of the event
- Expected attendee count
- Venue status (secured? searching?)
- Budget
- Key milestones already committed

For PROJECT / SPRINT goals:
- Deliverable definition
- Hard deadline
- Dependencies on other people/systems
- Tools / stack

For HEALTH / HABIT goals:
- Current routine
- Obstacles they've hit before
- Support system
- Any medical context (only if volunteered)

Apply your judgment — add category-specific questions for any goal category the user raises (cooking, writing, relationships, finance, etc.). The list above is examples, not exhaustive.

## Process

1. Read the user's goal carefully. Identify the goal's category.
2. Call ask_question as many times as needed — one question per turn — until you have every required detail for that category PLUS the universal details above.
3. Each question should be sharp, specific, and have 3-5 concrete options (plus "Other" when relevant).
4. Each question must be meaningfully different from previous ones. Don't repeat.
5. Include a brief warm text message before each ask_question.
6. Only after the goal is FULLY SPECIFIED, call create_goal_plan.

There is NO fixed question count. Some goals need 3 questions, others need 8. Stop asking only when you have enough information to produce a plan that would genuinely help the user execute.

Exceptions:
- If the user explicitly says "just do it", "skip questions", "use your best guess", or similar — proceed immediately to create_goal_plan with reasonable defaults and note the assumptions in the goal_description.
- If the user answers a question with enough context to answer 2-3 other questions implicitly, don't re-ask them.

## Plan structure (applies when you finally call create_goal_plan)

Choose based on goal duration:

SHORT GOALS (≤ 2 weeks total — trips, events, sprints):
- Use exactly 1 phase covering the whole goal (estimated_weeks = 1).
- Include "weekly_schedule" with concrete daily tasks (day_of_week 0=Mon to 6=Sun, with time_slot and time_estimate_minutes). This creates the schedule directly.
- Put prep/admin/booking tasks in "goal_todos".
- Phase todos can be empty since weekly_schedule replaces them.
- For travel: schedule should map to actual trip days with locations and activities.

LONG GOALS (> 2 weeks — ongoing learning, fitness, career, business):
- Use 3-6 phases that build progressively from foundation to mastery.
- Do NOT include weekly_schedule — user will generate per-phase later.
- Each phase should have 3-8 specific, actionable todos.
- Optionally include "goal_todos" for overall prep tasks.

RULES for the plan content:
- Every task must be concrete and actionable — names should be verbs ("Book flight to Tokyo", not "Flights").
- Assign priorities: "high" for must-do, "medium" for important, "low" for nice-to-have.
- Be warm and encouraging in tone, but concrete and specific in content.
- Reflect ALL the context you gathered — if the user said "budget $1000", don't create a $5000 plan.`;

const ASK_QUESTION_TOOL: Anthropic.Tool = {
  name: "ask_question",
  description:
    "Ask the user a structured question with selectable options. Use this to gather information about their goal before creating the plan. Call this as many times as needed until you have every detail required — there is no fixed question count. See the system prompt for the full required-context checklist including category-specific questions (travel dates, fitness baseline, etc.).",
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
      goal_todos: {
        type: "array",
        description: "Prep tasks, admin items, or things to do before/alongside the main plan. Auto-generated as Goal To-Dos.",
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
