"use server";

import { createClient } from "./server";
import type {
  Goal,
  Phase,
  WeeklyPlan,
  DailyTask,
  CoachingMessage,
  Streak,
  GoalNote,
  GoalDeliverable,
  ChatSession,
  ChatMessage,
  TodoItem,
  TodoTag,
  UserQuota,
  AiUsageRecord,
  DashboardStats,
  DashboardTodayItem,
  DashboardWorkflowRun,
  WorkflowSummary,
} from "../types/database";
import { getWeekStart, getTodayDayOfWeek, classifyTimeSlot } from "../utils/date";
import type {
  Workflow,
  WorkflowRun,
} from "../types/workflow";
import type { Notification } from "@/lib/types/notification";

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

// ============================================================
// Goal Notes
// ============================================================

export async function getGoalNote(goalId: string): Promise<GoalNote | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("goal_notes")
    .select("*")
    .eq("goal_id", goalId)
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function upsertGoalNote(
  goalId: string,
  content: string
): Promise<GoalNote> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("goal_notes")
    .upsert(
      {
        goal_id: goalId,
        user_id: user.id,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "goal_id,user_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================
// Goal Deliverables
// ============================================================

export async function getGoalDeliverables(
  goalId: string
): Promise<GoalDeliverable[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goal_deliverables")
    .select("*")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addGoalDeliverable(data: {
  goalId: string;
  title: string;
  url?: string;
  fileType?: string;
  source?: "manual" | "ai_generated";
}): Promise<GoalDeliverable> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: deliverable, error } = await supabase
    .from("goal_deliverables")
    .insert({
      goal_id: data.goalId,
      user_id: user.id,
      title: data.title,
      url: data.url || null,
      file_type: data.fileType || null,
      source: data.source || "manual",
    })
    .select()
    .single();

  if (error) throw error;
  return deliverable;
}

export async function deleteGoalDeliverable(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("goal_deliverables")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// ============================================================
// Chat Sessions & Messages
// ============================================================

export async function getAgentSessions(agentId: string): Promise<ChatSession[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("agent_id", agentId)
    .is("goal_id", null)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createChatSession(params: {
  agentId?: string;
  goalId?: string;
  title?: string;
}): Promise<ChatSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      user_id: user.id,
      agent_id: params.agentId || null,
      goal_id: params.goalId || null,
      title: params.title || "New Chat",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw error;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId);

  if (error) throw error;
}

export async function getOrCreateGoalSession(goalId: string): Promise<ChatSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Try to find existing
  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("goal_id", goalId)
    .single();

  if (existing) return existing;

  // Create new
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      user_id: user.id,
      agent_id: "general_assistant",
      goal_id: goalId,
      title: "Goal Chat",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getSessionMessages(
  sessionId: string,
  limit = 20,
  offset = 0
): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data || [];
}

export async function getSessionMessageCount(sessionId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (error) throw error;
  return count || 0;
}

export async function saveMessage(
  sessionId: string,
  role: string,
  content: string,
  metadata?: ChatMessage["metadata"]
): Promise<ChatMessage> {
  const supabase = await createClient();

  const row: Record<string, unknown> = { session_id: sessionId, role, content };
  if (metadata) row.metadata = metadata;

  const { data, error } = await supabase
    .from("chat_messages")
    .insert(row)
    .select()
    .single();

  if (error) throw error;

  // Update session's updated_at
  await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return data;
}

export async function updateSessionSummary(
  sessionId: string,
  summary: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ summary })
    .eq("id", sessionId);

  if (error) throw error;
}

export async function getSession(sessionId: string): Promise<ChatSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

// ============================================================
// TODO Items
// ============================================================

export async function getTodos(): Promise<TodoItem[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order");

  if (error) throw error;
  return data || [];
}

export async function addTodo(text: string, tag?: string, priority?: string, deadline?: string | null): Promise<TodoItem> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("todos")
    .insert({
      user_id: user.id,
      text,
      tag: tag || "Work",
      priority: priority || "medium",
      deadline: deadline || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTodo(id: string, patch: Partial<Pick<TodoItem, "text" | "tag" | "completed" | "priority" | "deadline" | "sort_order">>): Promise<void> {
  const supabase = await createClient();
  const updates: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.completed === true) updates.completed_at = new Date().toISOString();
  if (patch.completed === false) updates.completed_at = null;

  const { error } = await supabase.from("todos").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteTodo(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderTodos(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from("todos").update({ sort_order: i }).eq("id", orderedIds[i]);
  }
}

// ============================================================
// TODO Tags
// ============================================================

export async function getTodoTags(): Promise<TodoTag[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("todo_tags")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order");

  if (error) throw error;

  // Create default tags if none exist
  if (!data || data.length === 0) {
    const defaults = ["Work", "AIProject", "Life", "Other"];
    const inserts = defaults.map((name, i) => ({
      user_id: user.id,
      name,
      is_default: i === 0,
      sort_order: i,
    }));
    const { data: created, error: createErr } = await supabase
      .from("todo_tags")
      .insert(inserts)
      .select();
    if (createErr) throw createErr;
    return created || [];
  }

  return data;
}

export async function addTodoTag(name: string): Promise<TodoTag> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("todo_tags")
    .insert({ user_id: user.id, name })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTodoTag(id: string, patch: Partial<Pick<TodoTag, "name" | "color">>): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("todo_tags").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTodoTag(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("todo_tags").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// Workflows
// ============================================================

export async function getWorkflows(): Promise<Workflow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createWorkflow(input: {
  name: string;
  description?: string;
  steps: Workflow["steps"];
  isTemplate?: boolean;
}): Promise<Workflow> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      user_id: user.id,
      name: input.name,
      description: input.description || null,
      steps: input.steps,
      is_template: input.isTemplate || false,
      status: "ready",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateWorkflow(
  id: string,
  patch: Partial<Pick<Workflow, "name" | "description" | "steps" | "status" | "last_run_at" | "last_run_status" | "is_template" | "schedule_enabled" | "schedule_cron" | "schedule_timezone" | "schedule_next_run_at">>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflows")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteWorkflow(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// Workflow Runs
// ============================================================

export async function getWorkflowRuns(workflowId: string): Promise<WorkflowRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data || [];
}

export async function createWorkflowRun(input: {
  workflowId: string;
  totalSteps: number;
  stepResults: WorkflowRun["step_results"];
}): Promise<WorkflowRun> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("workflow_runs")
    .insert({
      workflow_id: input.workflowId,
      user_id: user.id,
      total_steps: input.totalSteps,
      step_results: input.stepResults,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateWorkflowRun(
  id: string,
  patch: Partial<Pick<WorkflowRun, "status" | "current_step" | "step_results" | "completed_at" | "follow_up_messages">>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workflow_runs")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteWorkflowRun(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("workflow_runs").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// Notifications
// ============================================================

export async function getUnreadNotifications(): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);
  if (error) throw error;
}

// ============================================================
// User Profile
// ============================================================

export async function getUserTimezone(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "UTC";
  const { data } = await supabase
    .from("user_profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  return data?.timezone || "UTC";
}

export async function upsertUserTimezone(timezone: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ id: user.id, timezone, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ============================================================
// AI Usage & Quotas
// ============================================================

export async function getUserQuota(): Promise<UserQuota | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_quotas")
    .select("*")
    .eq("user_id", user.id)
    .single();
  return data as UserQuota | null;
}

export async function getMonthlyUsageSummary(): Promise<{ totalRequests: number; totalCostCents: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { totalRequests: 0, totalCostCents: 0 };

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("ai_usage")
    .select("estimated_cost_cents")
    .eq("user_id", user.id)
    .gte("created_at", firstOfMonth.toISOString());

  if (!data || data.length === 0) return { totalRequests: 0, totalCostCents: 0 };

  const totalCostCents = data.reduce((sum, r) => sum + (r.estimated_cost_cents || 0), 0);
  return { totalRequests: data.length, totalCostCents };
}

export async function getRecentAiUsage(limit = 30, offset = 0): Promise<AiUsageRecord[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("ai_usage")
    .select("id, route, model, input_tokens, output_tokens, estimated_cost_cents, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (data as AiUsageRecord[]) || [];
}

// ============================================================
// Dashboard
// ============================================================

export async function getDashboardData(): Promise<{
  stats: DashboardStats;
  todayItems: DashboardTodayItem[];
  workflows: WorkflowSummary[];
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      stats: {
        taskCompletionRate: 0, activeGoals: 0, totalGoals: 0, goalProgressPercent: 0,
        pendingTodos: 0, completedTodayTodos: 0, totalWorkflows: 0, todayRunCount: 0, todayRuns: [],
      },
      todayItems: [],
      workflows: [],
    };
  }

  const weekStart = getWeekStart();
  const todayDow = getTodayDayOfWeek();
  const todayStr = new Date().toISOString().split("T")[0];

  const [
    goalsRes,
    plansRes,
    todosRes,
    workflowsRes,
    runsRes,
  ] = await Promise.all([
    // Q1: Goals
    supabase.from("goals").select("id, status").eq("user_id", user.id),
    // Q2+Q5: Weekly plans with phase→goal info (for task completion + today items)
    supabase
      .from("weekly_plans")
      .select("id, week_start, phases(id, goal_id, status, goals(id, title))")
      .eq("user_id", user.id),
    // Q3+Q6: All todos
    supabase
      .from("todos")
      .select("id, text, tag, completed, priority, deadline, completed_at, sort_order")
      .eq("user_id", user.id),
    // Q4a: Workflows
    supabase
      .from("workflows")
      .select("id, name, description, is_template, last_run_status, last_run_at")
      .eq("user_id", user.id)
      .eq("is_template", false),
    // Q4b: Today's workflow runs
    supabase
      .from("workflow_runs")
      .select("id, workflow_id, status, triggered_by, started_at, completed_at, workflows(name)")
      .eq("user_id", user.id)
      .gte("started_at", `${todayStr}T00:00:00`)
      .order("started_at", { ascending: false }),
  ]);

  const goals = (goalsRes.data || []) as { id: string; status: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans = (plansRes.data || []) as any[];
  const todos = (todosRes.data || []) as TodoItem[];
  const workflows = (workflowsRes.data || []) as Array<{
    id: string; name: string; description: string | null; is_template: boolean;
    last_run_status: string | null; last_run_at: string | null;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs = (runsRes.data || []) as any[];

  // --- Stats ---

  // Goals
  const activeGoals = goals.filter(g => g.status === "active").length;
  const totalGoals = goals.length;

  // Goal progress: % of completed phases across active goals
  // Supabase returns nested joins: phases may be object or array depending on FK direction
  const activeGoalIds = new Set(goals.filter(g => g.status === "active").map(g => g.id));
  const activePhases: { status: string; goal_id: string }[] = [];
  for (const p of plans) {
    const ph = p.phases;
    if (!ph) continue;
    // phases is a single object (many-to-one from weekly_plans)
    const phase = Array.isArray(ph) ? ph[0] : ph;
    if (phase && activeGoalIds.has(phase.goal_id)) {
      activePhases.push(phase);
    }
  }
  const completedPhases = activePhases.filter(p => p.status === "completed").length;
  const goalProgressPercent = activePhases.length > 0
    ? Math.round((completedPhases / activePhases.length) * 100) : 0;

  // Task completion rate: daily tasks + todos
  // Get all daily tasks for current week plans
  const currentWeekPlanIds = plans.filter(p => p.week_start === weekStart).map(p => p.id);
  let allTasksTotal = 0;
  let allTasksCompleted = 0;

  if (currentWeekPlanIds.length > 0) {
    const { data: allTasks } = await supabase
      .from("daily_tasks")
      .select("id, completed")
      .in("weekly_plan_id", currentWeekPlanIds);
    if (allTasks) {
      allTasksTotal += allTasks.length;
      allTasksCompleted += allTasks.filter(t => t.completed).length;
    }
  }

  // Add todos to completion rate
  allTasksTotal += todos.length;
  allTasksCompleted += todos.filter(t => t.completed).length;

  const taskCompletionRate = allTasksTotal > 0
    ? Math.round((allTasksCompleted / allTasksTotal) * 100 * 10) / 10 : 0;

  // Todos stats
  const pendingTodos = todos.filter(t => !t.completed).length;
  const completedTodayTodos = todos.filter(t =>
    t.completed && t.completed_at && t.completed_at.startsWith(todayStr)
  ).length;

  // Workflows stats
  const totalWorkflows = workflows.length;
  const todayRuns: DashboardWorkflowRun[] = runs.map((r: Record<string, unknown>) => {
    const wf = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows;
    return {
      id: r.id as string,
      workflowName: (wf as { name?: string })?.name || "Unknown",
      status: r.status as "running" | "success" | "failed",
      triggeredBy: r.triggered_by as "manual" | "scheduled",
      startedAt: r.started_at as string,
      completedAt: r.completed_at as string | null,
    };
  });

  const stats: DashboardStats = {
    taskCompletionRate,
    activeGoals,
    totalGoals,
    goalProgressPercent,
    pendingTodos,
    completedTodayTodos,
    totalWorkflows,
    todayRunCount: todayRuns.length,
    todayRuns,
  };

  // --- Today Items ---

  // Build planId → goalTitle map
  const planGoalMap = new Map<string, string>();
  for (const p of plans) {
    const ph = Array.isArray(p.phases) ? p.phases[0] : p.phases;
    if (!ph) continue;
    const goal = Array.isArray(ph.goals) ? ph.goals[0] : ph.goals;
    if (goal?.title) {
      planGoalMap.set(p.id, goal.title);
    }
  }

  const todayItems: DashboardTodayItem[] = [];

  // Goal daily tasks for today
  if (currentWeekPlanIds.length > 0) {
    const { data: todayTasks } = await supabase
      .from("daily_tasks")
      .select("id, title, description, completed, time_slot, day_of_week, weekly_plan_id")
      .in("weekly_plan_id", currentWeekPlanIds)
      .eq("day_of_week", todayDow)
      .order("sort_order");

    if (todayTasks) {
      for (const t of todayTasks) {
        todayItems.push({
          id: t.id,
          title: t.title,
          description: t.description,
          completed: t.completed,
          timeSlot: classifyTimeSlot(t.time_slot),
          source: "goal",
          sourceLabel: planGoalMap.get(t.weekly_plan_id) || "Goal",
          sourceType: "daily_task",
        });
      }
    }
  }

  // Personal todos with deadline today (or completed today)
  for (const t of todos) {
    const isDeadlineToday = t.deadline && t.deadline.startsWith(todayStr);
    const isCompletedToday = t.completed && t.completed_at && t.completed_at.startsWith(todayStr);
    if (isDeadlineToday || isCompletedToday) {
      let timeSlot: "morning" | "afternoon" | "evening" = "afternoon";
      if (t.deadline) {
        const d = new Date(t.deadline);
        const hour = d.getHours();
        if (hour > 0 && hour < 12) timeSlot = "morning";
        else if (hour >= 17) timeSlot = "evening";
      }
      todayItems.push({
        id: t.id,
        title: t.text,
        description: null,
        completed: t.completed,
        timeSlot,
        source: "personal",
        sourceLabel: t.tag || "Personal",
        sourceType: "todo",
      });
    }
  }

  // --- Workflows for favorites picker ---
  const workflowSummaries: WorkflowSummary[] = workflows.map(w => ({
    id: w.id,
    name: w.name,
    description: w.description,
    lastRunStatus: w.last_run_status as "success" | "failed" | null,
    lastRunAt: w.last_run_at,
  }));

  return { stats, todayItems, workflows: workflowSummaries };
}
