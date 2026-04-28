import { getAnthropicClient, MODELS } from "./client";
import { PERSONA } from "./persona";
import type { DailyTask, Phase } from "../types/database";

// Weekly review: generates an end-of-week summary and coaching.
// Uses Sonnet. Streamed to the client.
// Includes phase transition nudge when appropriate.

const SYSTEM_PROMPT = `${PERSONA}
You are an AI goal coach generating a weekly review. Summarize the week and provide forward-looking guidance.

Structure your review as:
1. **This week's highlights** — what went well, specific tasks completed
2. **Areas for growth** — what was missed, patterns you notice (not guilt, just observation)
3. **Next week's focus** — 1-2 concrete recommendations based on this week's data
4. If completion rate is consistently high (>80% for 3+ weeks), suggest the user may be ready to advance to the next phase.

Keep it to 4-6 sentences total. Warm, specific, forward-looking.
Never generic. Always reference specific task names and numbers.`;

interface ReviewContext {
  goalTitle: string;
  phase: Phase;
  tasks: Pick<DailyTask, "title" | "completed" | "day_of_week">[];
  weekNumber: number;
  streakDays: number;
  previousWeekCompletionRate?: number;
}

export async function generateWeeklyReview(context: ReviewContext) {
  const client = getAnthropicClient();

  const completedCount = context.tasks.filter((t) => t.completed).length;
  const totalCount = context.tasks.length;
  const completionRate = totalCount > 0 ? completedCount / totalCount : 0;

  const tasksByDay = Array.from({ length: 7 }, (_, i) =>
    context.tasks
      .filter((t) => t.day_of_week === i)
      .map((t) => `${t.completed ? "[x]" : "[ ]"} ${t.title}`)
  );

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekBreakdown = tasksByDay
    .map((tasks, i) =>
      tasks.length > 0 ? `${dayNames[i]}:\n${tasks.join("\n")}` : null
    )
    .filter(Boolean)
    .join("\n\n");

  const phaseNudge =
    completionRate >= 0.8 && context.weekNumber >= (context.phase.estimated_weeks ?? 4)
      ? "\nNote: the user has been in this phase for the estimated duration and has high completion. Consider suggesting they advance to the next phase."
      : "";

  const userMessage = `Goal: ${context.goalTitle}
Phase: ${context.phase.title} — ${context.phase.description}
Week ${context.weekNumber} of estimated ${context.phase.estimated_weeks} weeks
Streak: ${context.streakDays} days
Completion: ${completedCount}/${totalCount} tasks (${Math.round(completionRate * 100)}%)
${context.previousWeekCompletionRate !== undefined ? `Last week: ${Math.round(context.previousWeekCompletionRate * 100)}%` : ""}

Task breakdown:
${weekBreakdown}
${phaseNudge}

Generate the weekly review.`;

  const stream = await client.messages.stream({
    model: MODELS.sonnet,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  return stream;
}
