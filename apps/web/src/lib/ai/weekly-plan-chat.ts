import { getAnthropicClient, MODELS } from "./client";
import { PERSONA } from "./persona";
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
  /** All milestones for the CURRENT phase. Drives what the week's daily
   *  tasks should be advancing toward. Read-only outline; the AI breaks
   *  these into concrete daily activities. */
  phaseMilestones?: string[];
  /** The full roadmap for the goal (every phase title + description +
   *  estimated_weeks). Lets the AI place this week within the larger arc:
   *  knowing the next phase coming up affects pacing and habit-building
   *  choices in the current week. */
  roadmap?: {
    title: string;
    description: string;
    estimated_weeks: number;
  }[];
}

const SYSTEM_PROMPT = `${PERSONA}
You are YoBoss, an AI goal coach helping the user plan their week.
You already know their goal, the full roadmap, the current phase, and that phase's milestones (provided in the first message + CURRENT CONTEXT). Your job is to generate a practical, personalized weekly plan that moves the user toward THIS phase's milestones — and that fits naturally into the larger roadmap.

The weekly schedule is the user's SOLE check-off surface. Every action — one-time setup, decisions, recurring habits, daily practice — must appear here as a concrete daily task. Phase milestones are read-only outline markers; the user does not tick them. So if a milestone says "Anki deck set up and seeded", the daily tasks must include the actual setup ("Create Anki account + import Top-1000 deck" on day 1) plus the recurring practice ("Anki: 10 new cards + reviews" on every weekday).

## Core principle

**Ask at most 4 questions, target 3, then commit to a plan.** The goal, full roadmap, phase milestones, and week number already give you most of what you need. Ask only the questions whose answers would most change this week's plan. Fill every other dimension with a reasonable default and state it in \`ai_summary\` so the user can adjust. A plan with stated assumptions is more useful than another question.

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

## Ranking rule — which questions to ask

Before asking anything, rank candidates by:
1. **How much does the answer reshape the week's schedule?** (SCHEDULE and ENERGY usually win; TIME OF DAY often guessable.)
2. **Is it already implied by the goal / phase / milestones / week number?** Skip if yes — use a sensible default.
3. **Did the user already volunteer it in the initial message?** Skip if yes.
4. **Can two dimensions be bundled into one multi-select question?** (e.g. "Which days are busy + how many hours on free days" as one question). Prefer bundling.

## Process

1. Greet the user briefly, referencing their goal / phase.
2. **Silently take stock of what's already known** from the goal, roadmap, current phase, milestones, and week number. Use the milestones to anchor your sense of what THIS week needs to deliver.
3. Call \`ask_question\` — one question per turn, 3-5 concrete options, "Other" when relevant.
4. **Before each new question, re-list what's known** (from context + prior answers). Never re-ask anything already answered, explicitly or implicitly.
5. **Hard cap: 4 questions total, target 3.** On the 4th question (or earlier, if you have enough), the NEXT call must be \`create_weekly_plan\` — no exceptions.
6. For every dimension you did NOT ask, pick a sensible default (e.g. "assuming evenly spread across weekdays, 60-90 min per session") and mention it in \`ai_summary\`.

Exception: if the user says "just generate it", "skip", or similar — proceed immediately with \`create_weekly_plan\`, defaults noted in \`ai_summary\`.

## Plan content rules

- The schedule must collectively make tangible progress on the phase's milestones this week. If a milestone is a one-time setup (e.g. "Anki deck built"), schedule the setup task on a specific day. If it's a recurring habit (e.g. "Pronunciation drills mastered"), schedule the habit across multiple days.
- Generate 2-4 tasks per day (fewer if the day is busy; more if it's open and the user said they want a packed week).
- Each task concrete and completable in one session.
- Time estimates in minutes (15, 30, 45, 60, 90, 120).
- Vary tasks across the week — don't repeat identical tasks daily unless it's a deliberate daily habit (Anki, journaling, etc).
- Balance difficulty: mix easy wins with challenging tasks.
- Assign time slots based on user's stated preference (morning person vs evening).
- Task titles are action-oriented verbs ("Run 5km at easy pace", not "Running").
- Be warm but concise in the ai_summary; explicitly call out which milestones the week advances and any defaults you assumed.
- Reflect ALL the context you gathered — if the user said "Wednesday is a full office day", don't schedule 3 hours of work on Wednesday.`;

const ASK_QUESTION_TOOL: Anthropic.Tool = {
  name: "ask_question",
  description:
    "Ask the user a structured question with selectable options. Hard cap: at most 4 questions total, target 3. Pick only the highest-leverage questions (those whose answers most reshape this week's schedule). Fill unasked dimensions with reasonable defaults in the final plan rather than asking more. See system prompt for the ranking rule.",
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
    "Generate a structured weekly plan with daily tasks. Call this after gathering schedule context (typically 3 questions, hard cap 4). The schedule should collectively advance this phase's milestones — both one-time setup and recurring habits. For any dimension not asked, pick a sensible default and state the assumption in ai_summary so the user can adjust.",
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

  const milestonesBlock =
    context.phaseMilestones && context.phaseMilestones.length > 0
      ? `\nMilestones for this phase:\n${context.phaseMilestones.map((m, i) => `  ${i + 1}. ${m}`).join("\n")}`
      : "";

  const roadmapBlock =
    context.roadmap && context.roadmap.length > 0
      ? `\nFull roadmap:\n${context.roadmap
          .map(
            (p, i) =>
              `  Phase ${i + 1} (${p.estimated_weeks}w): ${p.title} — ${p.description}`,
          )
          .join("\n")}`
      : "";

  return `Help me plan this week for my goal.

Goal: ${context.goalTitle}
${context.goalDescription ? `Description: ${context.goalDescription}` : ""}
Current Phase: ${context.phaseTitle} — ${context.phaseDescription}
Week ${context.weekNumber} of estimated ${context.estimatedWeeks} weeks${midWeekNote}${milestonesBlock}${roadmapBlock}`;
}

export async function chatWithWeeklyPlanCoach(
  messages: Anthropic.MessageParam[],
  weeklyContext?: WeeklyPlanChatContext,
  // Long-term user memory + active goals; appended after the per-goal
  // weekly context. Injected by the API route via buildUserContext.
  userContext?: string,
) {
  const client = getAnthropicClient();

  // Three-block system layout for prompt caching:
  //   1. SYSTEM_PROMPT  — fully static       → cached (ephemeral, 5m)
  //   2. userContext    — per-user, stable   → cached
  //   3. weeklyContext  — per-call snapshot  → uncached
  // SYSTEM_PROMPT (~3300 t) + tools (~1000 t) easily clears the Opus 4.7
  // 4096-token minimum; userContext rides on top for free.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
  ];
  if (userContext && userContext.trim().length > 0) {
    systemBlocks.push({
      type: "text",
      text: userContext,
      cache_control: { type: "ephemeral" },
    });
  }
  if (weeklyContext) {
    systemBlocks.push({
      type: "text",
      text: `CURRENT CONTEXT:\n${buildContextBlock(weeklyContext)}`,
    });
  }

  const stream = await client.messages.stream({
    // Opus 4.7 — weekly plan conversations benefit from stronger
    // reasoning when deciding which clarifying questions to ask.
    model: MODELS.opus,
    max_tokens: 4096,
    system: systemBlocks,
    tools: [ASK_QUESTION_TOOL, CREATE_WEEKLY_PLAN_TOOL],
    messages,
  });

  return stream;
}

function buildContextBlock(c: WeeklyPlanChatContext): string {
  const milestonesBlock =
    c.phaseMilestones && c.phaseMilestones.length > 0
      ? `\nMilestones for this phase:\n${c.phaseMilestones.map((m, i) => `  ${i + 1}. ${m}`).join("\n")}`
      : "";

  const roadmapBlock =
    c.roadmap && c.roadmap.length > 0
      ? `\nFull roadmap:\n${c.roadmap
          .map(
            (p, i) =>
              `  Phase ${i + 1} (${p.estimated_weeks}w): ${p.title} — ${p.description}`,
          )
          .join("\n")}`
      : "";

  return `Goal: ${c.goalTitle}
${c.goalDescription ? `Description: ${c.goalDescription}\n` : ""}Current Phase: ${c.phaseTitle} — ${c.phaseDescription}
Week ${c.weekNumber} of estimated ${c.estimatedWeeks} weeks${c.isMidWeekStart ? `\nNote: It's already ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][c.startDayOfWeek!]}, so only plan from that day through Sunday.` : ""}${milestonesBlock}${roadmapBlock}`;
}
