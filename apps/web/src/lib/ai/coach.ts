import { getAnthropicClient, MODELS } from "./client";
import { PERSONA } from "./persona";
import type { DailyTask, Phase } from "../types/database";

// Daily coaching message: generates a personalized message when the user opens the app.
// Uses Sonnet. Streamed to the client.
// Context: yesterday's progress, today's tasks, streak, phase progress.

const SYSTEM_PROMPT = `${PERSONA}
You are a warm, supportive AI goal coach. Generate a short daily coaching message (3-5 sentences).

Your tone:
- Warm and personal, like a text from a supportive friend
- Specific: reference actual tasks, not generic encouragement
- Honest: if they missed tasks, acknowledge it without guilt
- Forward-looking: always end with what to focus on today

Patterns:
- Great day yesterday → celebrate, build momentum
- Mixed day → acknowledge effort, suggest adjustment
- Missed everything → empathetic, "tough days happen", re-engage
- Streak milestone → recognize the consistency

Never say: "I'm an AI", "As your coach", "Remember that..." (patronizing)
Do say: reference specific tasks by name, connect to the bigger goal, give one concrete tip`;

interface CoachingContext {
  goalTitle: string;
  phaseTitle: string;
  streakDays: number;
  yesterdayTasks: Pick<DailyTask, "title" | "completed">[];
  todayTasks: Pick<DailyTask, "title" | "time_estimate_minutes">[];
  weekCompletionRate: number; // 0-1
  phaseProgress: { currentWeek: number; totalWeeks: number };
}

export async function generateCoachingMessage(context: CoachingContext) {
  const client = getAnthropicClient();

  const yesterdaySummary =
    context.yesterdayTasks.length > 0
      ? context.yesterdayTasks
          .map(
            (t) => `- ${t.title}: ${t.completed ? "done" : "not completed"}`
          )
          .join("\n")
      : "No tasks yesterday (weekend or first day).";

  const todayList = context.todayTasks
    .map((t) => `- ${t.title} (${t.time_estimate_minutes} min)`)
    .join("\n");

  const userMessage = `Goal: ${context.goalTitle}
Phase: ${context.phaseTitle} (week ${context.phaseProgress.currentWeek}/${context.phaseProgress.totalWeeks})
Streak: ${context.streakDays} days
Week completion rate: ${Math.round(context.weekCompletionRate * 100)}%

Yesterday:
${yesterdaySummary}

Today's tasks:
${todayList}

Generate today's coaching message.`;

  const stream = await client.messages.stream({
    model: MODELS.sonnet,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  return stream;
}

// Fallback message when AI is unavailable
export function getFallbackCoachingMessage(
  todayTasks: Pick<DailyTask, "title">[]
): string {
  const taskCount = todayTasks.length;
  if (taskCount === 0) return "Welcome back! Check your goals to get started.";
  return `You have ${taskCount} task${taskCount > 1 ? "s" : ""} today. Let's make it count!`;
}
