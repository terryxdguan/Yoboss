import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyTimeSlot } from "@/lib/utils/date";
import {
  addDays,
  getLocalDate,
  getLocalDayOfWeek,
} from "./timezone";

export type DigestItem = {
  title: string;
  sourceLabel: string;
  timeSlot: "morning" | "afternoon" | "evening";
};

export type DigestData = {
  todayLocalDate: string;     // YYYY-MM-DD in user's tz, used as idempotency key
  yesterdayLocalDate: string;
  todayItems: DigestItem[];
  yesterdayCompleted: DigestItem[];
};

const TIME_SLOT_ORDER: Record<DigestItem["timeSlot"], number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
};

function deadlineHourTimeSlot(deadline: string | null): DigestItem["timeSlot"] {
  if (!deadline) return "afternoon";
  // deadline is stored as "YYYY-MM-DDTHH:mm" local-ish text; pull the hour.
  const m = deadline.match(/T(\d{2}):/);
  if (!m) return "afternoon";
  const h = parseInt(m[1], 10);
  if (h > 0 && h < 12) return "morning";
  if (h >= 17) return "evening";
  return "afternoon";
}

function sortByTimeSlotThenTitle(items: DigestItem[]): DigestItem[] {
  return [...items].sort((a, b) => {
    const slotDelta =
      TIME_SLOT_ORDER[a.timeSlot] - TIME_SLOT_ORDER[b.timeSlot];
    if (slotDelta !== 0) return slotDelta;
    return a.title.localeCompare(b.title);
  });
}

export async function buildDailyDigestData(
  supabase: SupabaseClient,
  userId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<DigestData> {
  const todayLocalDate = getLocalDate(now, timezone);
  const yesterdayLocalDate = addDays(todayLocalDate, -1);
  const todayDow = getLocalDayOfWeek(now, timezone);

  // Active goals → latest weekly_plan per phase → today's daily_tasks
  const { data: goals } = await supabase
    .from("goals")
    .select("id, title")
    .eq("user_id", userId)
    .eq("status", "active");

  const goalTitleById = new Map<string, string>();
  for (const g of goals || []) goalTitleById.set(g.id, g.title);

  const { data: plans } = await supabase
    .from("weekly_plans")
    .select("id, week_start, phases(id, goal_id)")
    .eq("user_id", userId)
    .order("week_start", { ascending: false });

  // Pick the newest plan per phase for active goals
  const latestPlanIds: string[] = [];
  const planGoalLabel = new Map<string, string>();
  const seenPhases = new Set<string>();
  for (const p of (plans || []) as Array<{
    id: string;
    week_start: string | null;
    phases: { id: string; goal_id: string } | { id: string; goal_id: string }[] | null;
  }>) {
    const ph = Array.isArray(p.phases) ? p.phases[0] : p.phases;
    if (!ph) continue;
    if (!goalTitleById.has(ph.goal_id)) continue;
    if (seenPhases.has(ph.id)) continue;
    seenPhases.add(ph.id);
    latestPlanIds.push(p.id);
    planGoalLabel.set(p.id, goalTitleById.get(ph.goal_id)!);
  }

  const todayItems: DigestItem[] = [];
  const yesterdayCompleted: DigestItem[] = [];

  if (latestPlanIds.length > 0) {
    // Today's incomplete daily_tasks for this day_of_week
    const { data: todayTasks } = await supabase
      .from("daily_tasks")
      .select("title, time_slot, completed, weekly_plan_id")
      .in("weekly_plan_id", latestPlanIds)
      .eq("day_of_week", todayDow)
      .eq("completed", false)
      .order("sort_order");

    for (const t of todayTasks || []) {
      todayItems.push({
        title: t.title,
        sourceLabel: planGoalLabel.get(t.weekly_plan_id) || "Goal",
        timeSlot: classifyTimeSlot(t.time_slot),
      });
    }

    // Yesterday's completed daily_tasks across the same plans, regardless of
    // day_of_week (a task could have been carried over and completed late).
    const { data: yTasks } = await supabase
      .from("daily_tasks")
      .select("title, completed_at, weekly_plan_id, time_slot")
      .in("weekly_plan_id", latestPlanIds)
      .eq("completed", true)
      .not("completed_at", "is", null);

    for (const t of yTasks || []) {
      if (!t.completed_at) continue;
      const localDay = getLocalDate(new Date(t.completed_at), timezone);
      if (localDay !== yesterdayLocalDate) continue;
      yesterdayCompleted.push({
        title: t.title,
        sourceLabel: planGoalLabel.get(t.weekly_plan_id) || "Goal",
        timeSlot: classifyTimeSlot(t.time_slot),
      });
    }
  }

  // Todos: today (deadline today, incomplete) + yesterday (completed yesterday)
  const { data: todos } = await supabase
    .from("todos")
    .select("text, tag, completed, deadline, completed_at, goal_id")
    .eq("user_id", userId);

  for (const t of (todos || []) as Array<{
    text: string;
    tag: string | null;
    completed: boolean;
    deadline: string | null;
    completed_at: string | null;
    goal_id: string | null;
  }>) {
    const sourceLabel =
      (t.goal_id && goalTitleById.get(t.goal_id)) || t.tag || "Personal";

    if (!t.completed && t.deadline && t.deadline.startsWith(todayLocalDate)) {
      todayItems.push({
        title: t.text,
        sourceLabel,
        timeSlot: deadlineHourTimeSlot(t.deadline),
      });
    }

    if (t.completed && t.completed_at) {
      const localDay = getLocalDate(new Date(t.completed_at), timezone);
      if (localDay === yesterdayLocalDate) {
        yesterdayCompleted.push({
          title: t.text,
          sourceLabel,
          timeSlot: deadlineHourTimeSlot(t.deadline),
        });
      }
    }
  }

  return {
    todayLocalDate,
    yesterdayLocalDate,
    todayItems: sortByTimeSlotThenTitle(todayItems),
    yesterdayCompleted: sortByTimeSlotThenTitle(yesterdayCompleted),
  };
}
