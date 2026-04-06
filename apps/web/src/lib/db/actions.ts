"use server";

import { createClient } from "./server";
import type {
  Goal,
  Phase,
  WeeklyPlan,
  DailyTask,
  CoachingMessage,
  Streak,
} from "../types/database";

// ============================================================
// Goals
// ============================================================

export async function createGoal(data: {
  title: string;
  description: string;
}): Promise<Goal> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Use authenticated user or fallback for dev
  const userId = user?.id;
  if (!userId) throw new Error("Not authenticated. Please log in first.");

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({ ...data, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return goal;
}

export async function getGoals(): Promise<Goal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getGoalWithPhases(goalId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select("*, phases(*)")
    .eq("id", goalId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateGoalStatus(
  goalId: string,
  status: "active" | "completed" | "archived"
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("goals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", goalId);

  if (error) throw error;
}

// ============================================================
// Phases (no denormalized user_id in v3, RLS via goals join)
// ============================================================

export async function createPhases(
  goalId: string,
  phases: { title: string; description: string; estimated_weeks: number }[]
): Promise<Phase[]> {
  const supabase = await createClient();

  const phasesWithMeta = phases.map((p, i) => ({
    ...p,
    goal_id: goalId,
    sort_order: i,
    status: i === 0 ? "active" : ("upcoming" as const),
    started_at: i === 0 ? new Date().toISOString() : null,
  }));

  const { data, error } = await supabase
    .from("phases")
    .insert(phasesWithMeta)
    .select();

  if (error) throw error;
  return data;
}

export async function updatePhaseStatus(
  phaseId: string,
  status: "upcoming" | "active" | "completed"
) {
  const supabase = await createClient();
  const updates: Record<string, string | null> = { status };

  if (status === "active") updates.started_at = new Date().toISOString();
  if (status === "completed") updates.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from("phases")
    .update(updates)
    .eq("id", phaseId);

  if (error) throw error;
}

// ============================================================
// Weekly Plans
// ============================================================

export async function createWeeklyPlan(data: {
  phase_id: string;
  week_start: string;
  ai_summary: string;
}): Promise<WeeklyPlan> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: plan, error } = await supabase
    .from("weekly_plans")
    .insert({ ...data, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return plan;
}

export async function getWeeklyPlanForWeek(
  userId: string,
  weekStart: string
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_plans")
    .select("*, daily_tasks(*)")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function saveWeeklyReview(planId: string, review: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("weekly_plans")
    .update({ review_summary: review })
    .eq("id", planId);

  if (error) throw error;
}

// ============================================================
// Daily Tasks (no denormalized user_id in v3, RLS via weekly_plans join)
// ============================================================

export async function createDailyTasks(
  weeklyPlanId: string,
  tasks: {
    day_of_week: number;
    title: string;
    description: string;
    time_slot?: string;
    time_estimate_minutes: number;
    sort_order: number;
  }[]
): Promise<DailyTask[]> {
  const supabase = await createClient();

  const tasksWithMeta = tasks.map((t) => ({
    ...t,
    weekly_plan_id: weeklyPlanId,
  }));

  const { data, error } = await supabase
    .from("daily_tasks")
    .insert(tasksWithMeta)
    .select();

  if (error) throw error;
  return data;
}

export async function toggleTask(taskId: string, completed: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_tasks")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", taskId);

  if (error) throw error;
}

export async function getTodayTasks(userId: string, weekStart: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_tasks")
    .select("*, weekly_plans!inner(week_start, phase_id)")
    .eq("weekly_plans.user_id", userId)
    .eq("weekly_plans.week_start", weekStart)
    .order("day_of_week")
    .order("sort_order");

  if (error) throw error;
  return data;
}

// ============================================================
// Coaching Messages
// ============================================================

export async function saveCoachingMessage(data: {
  goal_id: string;
  content: string;
  trigger: string;
  tokens_used?: number;
}): Promise<CoachingMessage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: message, error } = await supabase
    .from("coaching_messages")
    .insert({ ...data, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return message;
}

export async function getTodayCoachingMessage(
  userId: string,
  goalId: string
) {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("coaching_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("goal_id", goalId)
    .eq("trigger", "daily_open")
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

// ============================================================
// Streaks
// ============================================================

export async function getStreak(userId: string): Promise<Streak | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("streaks")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function updateStreak(userId: string, date: string) {
  const supabase = await createClient();

  const { data: streak } = await supabase
    .from("streaks")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!streak) return;

  const lastDate = streak.last_completed_date;
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak: number;
  if (lastDate === date) {
    return; // Already updated today
  } else if (lastDate === yesterdayStr) {
    newStreak = streak.current_streak + 1;
  } else {
    newStreak = 1; // Streak broken, start fresh
  }

  const { error } = await supabase
    .from("streaks")
    .update({
      current_streak: newStreak,
      longest_streak: Math.max(newStreak, streak.longest_streak),
      last_completed_date: date,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw error;
}
