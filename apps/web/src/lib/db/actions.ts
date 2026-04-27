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
  GoalWithPhases,
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

export async function getGoalsWithPhases(): Promise<GoalWithPhases[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select("*, phases(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as GoalWithPhases[];
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

// Generic goal field update (title / description). Keeps updated_at in sync.
// Used by the inline double-click-to-edit UI on the goal detail page.
export async function updateGoal(
  goalId: string,
  patch: { title?: string; description?: string | null }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("goals")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", goalId);
  if (error) throw error;
}

// ============================================================
// Phases (no denormalized user_id in v3, RLS via goals join)
// ============================================================

export async function createPhases(
  goalId: string,
  phases: {
    title: string;
    description: string;
    estimated_weeks: number;
    /** Per-phase milestones — read-only sub-phase markers shown on the
     *  goal detail page. Persisted into phase_tasks (legacy table name;
     *  semantic is now milestone, not actionable todo). Empty array → no
     *  milestones for that phase. */
    milestones?: { title: string }[];
  }[]
): Promise<Phase[]> {
  const supabase = await createClient();

  const phasesWithMeta = phases.map((p, i) => ({
    title: p.title,
    description: p.description,
    estimated_weeks: p.estimated_weeks,
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
  if (!data) return [];

  // Bulk-insert milestones into phase_tasks. data is returned in insert
  // order so phases[i] aligns with the ith input.
  const milestoneRows = data.flatMap((phase, i) => {
    const milestones = phases[i]?.milestones ?? [];
    return milestones.map((m, j) => ({
      phase_id: phase.id,
      title: m.title,
      // priority column is not nullable but defaults to 'medium' in DB —
      // milestones don't carry a real priority, the column is legacy.
      sort_order: j,
    }));
  });
  if (milestoneRows.length > 0) {
    const { error: tasksErr } = await supabase
      .from("phase_tasks")
      .insert(milestoneRows);
    if (tasksErr) throw tasksErr;
  }

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

// Generic phase field update (title / description). Used by inline editing
// on the goal detail page. Kept separate from updatePhaseStatus so callers
// don't accidentally overwrite status transitions.
export async function updatePhase(
  phaseId: string,
  patch: { title?: string; description?: string | null }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("phases")
    .update(patch)
    .eq("id", phaseId);
  if (error) throw error;
}

// ============================================================
// Phase Tasks (per-phase sub-tasks: the 1.1 / 1.2 / ... checklist)
// ============================================================

export async function getPhaseTasksByGoalId(
  goalId: string,
): Promise<import("@/lib/types/database").PhaseTask[]> {
  const supabase = await createClient();
  // Pull all phase_tasks for phases under this goal in a single query.
  // We use a join filter through phases.goal_id.
  const { data, error } = await supabase
    .from("phase_tasks")
    .select("*, phases!inner(goal_id)")
    .eq("phases.goal_id", goalId)
    .order("phase_id", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  // Strip the joined phases column from the returned shape — callers only
  // want the task fields.
  return (data ?? []).map((row: Record<string, unknown>) => {
    const { phases: _phases, ...task } = row;
    return task as unknown as import("@/lib/types/database").PhaseTask;
  });
}

// Append a new milestone to the end of a phase's milestone list. sort_order
// is computed as max(existing) + 1, or 0 if the phase is empty. Returns the
// full inserted row so the caller can append to local state with the real id.
export async function createPhaseTask(
  phaseId: string,
  title: string,
): Promise<import("@/lib/types/database").PhaseTask> {
  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("phase_tasks")
    .select("sort_order")
    .eq("phase_id", phaseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("phase_tasks")
    .insert({ phase_id: phaseId, title, sort_order: nextSortOrder })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as import("@/lib/types/database").PhaseTask;
}

// Patch a milestone's title and/or sort_order. Other columns
// (priority, completed) are intentionally not exposed — the goal-detail UI
// doesn't surface them and we don't want callers to accidentally mutate them.
export async function updatePhaseTask(
  taskId: string,
  patch: { title?: string; sort_order?: number },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("phase_tasks")
    .update(patch)
    .eq("id", taskId);
  if (error) throw error;
}

export async function deletePhaseTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("phase_tasks")
    .delete()
    .eq("id", taskId);
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

  // Purge any existing weekly_plan for the same (phase_id, week_start)
  // before inserting. There's no UNIQUE constraint on those columns, so
  // repeated "Generate with Team" attempts (or an interrupted save that
  // wrote the header but not the tasks) silently accumulate duplicate
  // rows. The goal page then picks whichever one Postgres happens to
  // return first — often a stale empty row — and shows "No weekly plan
  // yet" even though the user just saved a plan. daily_tasks cascades
  // via ON DELETE CASCADE.
  await supabase
    .from("weekly_plans")
    .delete()
    .eq("user_id", user.id)
    .eq("phase_id", data.phase_id)
    .eq("week_start", data.week_start);

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

export async function deleteTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("daily_tasks")
    .delete()
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

/** Map common file extensions to MIME types so the panel's icon picker
 *  (which keys off file_type) can render the right glyph for chat-
 *  generated files where we only know the filename. */
function inferFileType(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    html: "text/html",
    md: "text/markdown",
    zip: "application/zip",
  };
  return map[ext] ?? null;
}

export async function getGoalDeliverables(
  goalId: string
): Promise<GoalDeliverable[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  // 1. Manually-added deliverables.
  const { data: manualRows, error: manualErr } = await supabase
    .from("goal_deliverables")
    .select("*")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: false });
  if (manualErr) throw manualErr;
  const manual = manualRows || [];

  // 2. Files generated inside any chat session attached to this goal.
  //    Aggregated read-time so old/new generated files surface
  //    automatically without a parallel write path. Synthetic id
  //    "chat:{fileId}" tells the panel these are derived (not deletable
  //    via goal_deliverables — they live in chat_messages metadata).
  const { data: sessions } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("goal_id", goalId);
  const sessionIds = (sessions || []).map((s) => s.id);

  let aiGenerated: GoalDeliverable[] = [];
  if (sessionIds.length > 0) {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("metadata, created_at")
      .in("session_id", sessionIds)
      .not("metadata", "is", null);

    type FileEntry = { fileId: string; filename: string; createdAt: string };
    const byFileId = new Map<string, FileEntry>();
    for (const m of msgs || []) {
      const meta = m.metadata as { generatedFiles?: { fileId?: string; filename?: string }[] } | null;
      const files = meta?.generatedFiles;
      if (!Array.isArray(files)) continue;
      for (const f of files) {
        if (!f?.fileId) continue;
        const existing = byFileId.get(f.fileId);
        const ts = m.created_at;
        // Keep the earliest occurrence (when the file was first generated).
        if (!existing || new Date(ts).getTime() < new Date(existing.createdAt).getTime()) {
          byFileId.set(f.fileId, {
            fileId: f.fileId,
            filename: f.filename || "download",
            createdAt: ts,
          });
        }
      }
    }

    // Backfill real filenames for entries persisted before we added
    // metadata-resolution to the chat panel — those still say "download".
    // Single round of parallel Anthropic Files API calls; each lookup is
    // cheap and unbilled, and we don't write back so this stays a pure
    // read.
    const arr = Array.from(byFileId.values());
    const unresolved = arr.filter((f) => !f.filename || f.filename === "download");
    if (unresolved.length > 0) {
      const { getAnthropicClient } = await import("@/lib/ai/client");
      const client = getAnthropicClient();
      await Promise.all(
        unresolved.map(async (f) => {
          try {
            const meta = await client.beta.files.retrieveMetadata(f.fileId);
            if (meta.filename) f.filename = meta.filename;
          } catch {
            /* keep "download" fallback */
          }
        })
      );
    }

    aiGenerated = arr.map((f) => ({
      id: `chat:${f.fileId}`,
      goal_id: goalId,
      user_id: userId,
      title: f.filename,
      url: `/api/ai/files/${f.fileId}`,
      file_type: inferFileType(f.filename),
      source: "ai_generated" as const,
      created_at: f.createdAt,
    }));
  }

  // 3. Merge, newest first.
  const all = [...manual, ...aiGenerated];
  all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return all;
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

/** Find the canonical chat session for a goal, or create an empty stub if
 *  this goal pre-dates the unified-session refactor.
 *
 *  After Task 1.1 of the unified-session plan, new goals get their session
 *  bound at confirm time (markGoalDraftConfirmed sets goal_id on the draft
 *  row). This helper covers two cases:
 *
 *    UUID goalId (real goals): look up by goal_id. The unique partial index
 *    `unique(user_id, goal_id) WHERE goal_id IS NOT NULL` guarantees at most
 *    one row exists. For legacy goals confirmed BEFORE the refactor, no
 *    bound row exists; we lazily create a stub. The stub has no message
 *    history, so the model starts that goal's conversation cold but with
 *    goal+phase context injected via the system prompt at request time.
 *
 *    Non-UUID goalId (e.g. "__dashboard__", "__todo__"): treated as a
 *    virtual session for the dashboard / todos task-assistant flows. Looked
 *    up by a derived agent_id with goal_id=null. Out of scope of the
 *    unified-goal-session refactor; existing behavior preserved. */
export async function getOrCreateGoalSession(goalId: string): Promise<ChatSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Non-UUID goalIds (e.g. "__dashboard__", "__todo__") use agent_id for lookup instead
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(goalId);

  if (isUUID) {
    // Goal-based session: lookup by goal_id
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("goal_id", goalId)
      .maybeSingle();

    if (existing) return existing;

    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        agent_id: "__goal-draft__",
        goal_id: goalId,
        title: "Goal session",
        metadata: {
          intent: "goal-active",
          confirmedAt: new Date().toISOString(),
          resultGoalId: goalId,
        },
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Virtual session (dashboard, todos): lookup by agent_id
    const agentId = `task_assistant_${goalId}`;
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("agent_id", agentId)
      .is("goal_id", null)
      .single();

    if (existing) return existing;

    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        agent_id: agentId,
        goal_id: null,
        title: "Task Assistant",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export async function getSessionMessages(
  sessionId: string,
  limit = 20,
  offset = 0
): Promise<ChatMessage[]> {
  const supabase = await createClient();
  // Fetch the most recent `limit` messages (descending), then reverse so
  // callers see chronological order. The previous ascending ordering was
  // a real bug: once a session crossed `limit` total messages it silently
  // returned only the oldest `limit` and cut off the actual recent
  // history that the user wants to see on reopen. With this change,
  // offset = "skip the N newest" — none of the current callers use it.
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return (data || []).reverse();
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

/**
 * Incremental upsert for a streaming assistant message.
 *
 * Called repeatedly during an SSE stream so that if the Vercel function
 * is killed mid-stream (or the user closes the tab) the partial content
 * is already persisted and can be rehydrated on the next page load.
 * Without this, the old saveMessage-on-completion pattern lost the entire
 * assistant turn on any interruption.
 *
 * - First call: pass messageId=null, returns a freshly inserted row id.
 *   The row starts with metadata.partial=true so the UI can badge it.
 * - Subsequent calls: pass the same messageId, updates content + metadata
 *   in place. Caller is responsible for throttling (don't hammer every
 *   SSE delta — flush every ~2s is plenty).
 * - Final call: pass messageId + full content + metadata.partial=false
 *   (and optional metadata.interrupted=true on the error path).
 */
export async function upsertAssistantMessage(params: {
  sessionId: string;
  messageId: string | null;
  content: string;
  metadata?: ChatMessage["metadata"];
}): Promise<{ id: string }> {
  const supabase = await createClient();

  if (params.messageId) {
    // Update the existing row's content + metadata. We don't touch the
    // session's updated_at on every flush — it's refreshed only on the
    // first insert and on the final flush to avoid 30 writes per chat turn.
    const { data, error } = await supabase
      .from("chat_messages")
      .update({
        content: params.content,
        metadata: params.metadata ?? { partial: true },
      })
      .eq("id", params.messageId)
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id };
  }

  // First call — create the row with partial=true
  const row: Record<string, unknown> = {
    session_id: params.sessionId,
    role: "assistant",
    content: params.content,
    metadata: params.metadata ?? { partial: true },
  };
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;

  await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.sessionId);

  return { id: data.id };
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
// Goal / Weekly Plan Draft Chats
// ============================================================
//
// Goal and weekly plan creation chats are multi-turn Claude conversations that
// happen BEFORE any real goal/phase/weekly_plan row exists. A_class persistence
// (agent chat, workflow follow-up) could lean on an existing parent row to
// attach messages to. B_class — goal drafts — has no such parent, so we reuse
// chat_sessions with a reserved agent_id and stamp the intent into metadata.
//
// Lifecycle:
//   1. User starts a new goal chat          → createGoalDraft({ title })
//   2. Each assistant streaming turn         → upsertAssistantMessage(...)
//   3. Each user answer / message            → saveMessage(sessionId, "user", ...)
//      (tool_result user messages set metadata.toolResultFor for rehydration)
//   4. Confirm successfully writes real rows → markGoalDraftConfirmed(id, goalId)
//      At this point the draft session's goal_id column is set to the new goal,
//      promoting it to the canonical chat session for that goal. The
//      `unique(user_id, goal_id) WHERE goal_id IS NOT NULL` index guarantees
//      at most one such session per (user, goal). All subsequent
//      weekly-planning turns — and (Phase 2) coach turns — append to the same
//      chat_sessions row, so the goal has a single long-running conversation.
//   5. Unconfirmed drafts show on Continue   → listOpenGoalDrafts()
//
// Reserved agent_id literals (also exported from ./draft-constants.ts for
// client-side consumers that need to reference them outside a server action):
//   __goal-draft__    — goal creation draft chat
//   __weekly-draft__  — weekly plan draft chat

export async function createGoalDraft(params?: {
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
      agent_id: "__goal-draft__",
      goal_id: null,
      title: params?.title || "New Goal Draft",
      metadata: { intent: "goal-creation" },
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listOpenGoalDrafts(): Promise<ChatSession[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("agent_id", "__goal-draft__")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  // Drafts with confirmedAt set are hidden. Filter in JS — the Continue draft
  // list is tiny (<10 rows typical) so a partial index is overkill.
  return (data || []).filter(
    (s) => !(s.metadata && (s.metadata as ChatSession["metadata"])?.confirmedAt)
  );
}

export async function loadDraftSession(sessionId: string): Promise<{
  session: ChatSession;
  messages: ChatMessage[];
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: session, error: sErr } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();
  if (sErr || !session) return null;

  const { data: messages, error: mErr } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;

  return { session, messages: messages || [] };
}

export async function markGoalDraftConfirmed(
  sessionId: string,
  goalId: string
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch-then-write to merge JSONB (supabase-js has no partial jsonb update).
  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  const merged = {
    ...((existing?.metadata as ChatSession["metadata"]) || {}),
    confirmedAt: new Date().toISOString(),
    resultGoalId: goalId,
  };

  const { error } = await supabase
    .from("chat_sessions")
    .update({
      metadata: merged,
      goal_id: goalId, // NEW — promotes draft to the goal's main session
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (error) throw error;
}

/**
 * @deprecated Phase 1 of the unified-session refactor: weekly planning now
 * appends to the goal's main session (created/found via
 * `getOrCreateGoalSession`). Existing `__weekly-draft__` rows in the DB
 * are still readable via `loadDraftSession`, but no new ones should be
 * created — the last caller (`useWeeklyPlanChat`) was deleted in Task 1.8.
 * Will be removed in Phase 3.
 */
export async function createWeeklyDraft(params: {
  weeklyContext: NonNullable<ChatSession["metadata"]>["weeklyContext"];
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
      agent_id: "__weekly-draft__",
      goal_id: null,
      title: params.title || "New Weekly Plan Draft",
      metadata: {
        intent: "weekly-plan-creation",
        weeklyContext: params.weeklyContext,
      },
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listOpenWeeklyDrafts(): Promise<ChatSession[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("agent_id", "__weekly-draft__")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data || []).filter(
    (s) => !(s.metadata && (s.metadata as ChatSession["metadata"])?.confirmedAt)
  );
}

export async function markWeeklyDraftConfirmed(
  sessionId: string,
  weeklyPlanId: string
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  const merged = {
    ...((existing?.metadata as ChatSession["metadata"]) || {}),
    confirmedAt: new Date().toISOString(),
    resultWeeklyPlanId: weeklyPlanId,
  };

  const { error } = await supabase
    .from("chat_sessions")
    .update({ metadata: merged, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function deleteDraftSession(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Cascade deletes chat_messages thanks to FK ON DELETE CASCADE.
  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (error) throw error;
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
    .is("goal_id", null)
    .order("sort_order");

  if (error) throw error;
  return data || [];
}

export async function addTodo(text: string, tag?: string, priority?: string, deadline?: string | null, goalId?: string): Promise<TodoItem> {
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
      goal_id: goalId || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getGoalTodos(goalId: string): Promise<TodoItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("goal_id", goalId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
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
    const defaults = ["Work", "Life", "Other"];
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

export async function reorderTodoTags(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    await supabase.from("todo_tags").update({ sort_order: i }).eq("id", orderedIds[i]);
  }
}

// ============================================================
// Workflows
// ============================================================

export async function getWorkflows(): Promise<Workflow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Alphabetical by name. The workflows page applies its own client-side
  // sort (name vs. last_run_at) on top of this; dashboard favorites are
  // ordered by a localStorage list, not DB order. A stable alphabetical
  // default prevents cards from reshuffling whenever a run bumps
  // updated_at (the previous order field).
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error) throw error;
  const workflows = data || [];

  // Auto-heal stuck "running" workflows: if no active run exists, reset to "ready"
  const stuckRunning = workflows.filter(w => w.status === "running");
  for (const wf of stuckRunning) {
    const { data: runs } = await supabase
      .from("workflow_runs")
      .select("id")
      .eq("workflow_id", wf.id)
      .eq("status", "running")
      .limit(1);
    if (!runs || runs.length === 0) {
      await supabase.from("workflows").update({ status: "ready" }).eq("id", wf.id);
      wf.status = "ready";
    }
  }

  return workflows;
}

export async function createWorkflow(input: {
  name: string;
  description?: string;
  topic?: string;
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
      topic: input.topic || null,
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
  patch: Partial<Pick<Workflow, "name" | "description" | "topic" | "steps" | "status" | "last_run_at" | "last_run_status" | "is_template" | "schedule_enabled" | "schedule_cron" | "schedule_timezone" | "schedule_next_run_at">>
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

export async function getWorkflowRunById(runId: string): Promise<WorkflowRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (error) return null;
  return data;
}

export async function updateWorkflowRun(
  id: string,
  patch: Partial<Pick<WorkflowRun, "status" | "current_step" | "step_results" | "completed_at" | "follow_up_messages" | "session_id">>
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

export type DashboardOnboardingStage =
  | "stage1"   // 0 goals
  | "stage2"   // 1+ goals, 0 weekly plans
  | "stage3"   // 1+ goals, 1+ weekly plans, 0 todos
  | "done";    // all three present

export interface DashboardOnboarding {
  stage: DashboardOnboardingStage;
  /** Used by Stage 2's smart CTA — null if 0 or 2+ goals (the smart-route
   *  logic falls back to /goals list in those cases). When exactly 1 goal,
   *  this is its id so the banner can route directly to /goals/{id}/plan-week. */
  singleGoalId: string | null;
  /** Goal count for Stage 2 routing decision (1 → plan-week direct, 2+ → /goals list). */
  goalCount: number;
  /** Number of weekly plans the user has. Drives Step 2's done indicator
   *  independently of the sequential `stage`. */
  weeklyPlanCount: number;
  /** Number of personal (non-goal) to-dos. Drives Step 3's done indicator
   *  independently of the sequential `stage`. */
  personalTodoCount: number;
}

export async function getDashboardData(): Promise<{
  stats: DashboardStats;
  todayItems: DashboardTodayItem[];
  highPriorityItems: DashboardTodayItem[];
  goalsWithPhases: GoalWithPhases[];
  onboarding: DashboardOnboarding;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      stats: {
        activeGoals: 0, totalGoals: 0, goalProgressPercent: 0,
        pendingGoalTodos: 0, pendingPersonalTodos: 0, totalWorkflows: 0, todayRunCount: 0, todayRuns: [], totalTeamMembers: 0,
      },
      todayItems: [],
      highPriorityItems: [],
      goalsWithPhases: [],
      onboarding: { stage: "stage1", goalCount: 0, singleGoalId: null, weeklyPlanCount: 0, personalTodoCount: 0 },
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
    goalsWithPhasesRes,
  ] = await Promise.all([
    // Q1: Goals
    supabase.from("goals").select("id, title, status").eq("user_id", user.id),
    // Q2+Q5: Weekly plans with phase→goal info (for task completion + today items)
    supabase
      .from("weekly_plans")
      .select("id, week_start, phases(id, goal_id, status, goals(id, title))")
      .eq("user_id", user.id),
    // Q3+Q6: All todos
    supabase
      .from("todos")
      .select("id, text, tag, completed, priority, deadline, completed_at, sort_order, goal_id")
      .eq("user_id", user.id),
    // Q4a: Workflows (all — template/specific merged)
    supabase
      .from("workflows")
      .select("id, name, description, last_run_status, last_run_at")
      .eq("user_id", user.id),
    // Q4b: Today's workflow runs
    supabase
      .from("workflow_runs")
      .select("id, workflow_id, status, triggered_by, started_at, completed_at, workflows(name)")
      .eq("user_id", user.id)
      .gte("started_at", `${todayStr}T00:00:00`)
      .order("started_at", { ascending: false }),
    // Q5: Goals with phases (for Important Goals section)
    supabase
      .from("goals")
      .select("*, phases(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const goals = (goalsRes.data || []) as { id: string; title: string; status: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans = (plansRes.data || []) as any[];
  const todos = (todosRes.data || []) as TodoItem[];
  const workflows = (workflowsRes.data || []) as Array<{
    id: string; name: string; description: string | null;
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

  // latestPlanIds is used by today-items rendering further down to pull
  // each active goal's current weekly schedule. Pick the newest plan per
  // phase by sorting plans by week_start desc and taking the first one we
  // haven't seen yet.
  // (Previously there was also an orphan goalPhaseMap built here that was
  // never read — removed.)
  const latestPlanIds: string[] = [];
  const seenPhases = new Set<string>();
  const sortedPlans = [...plans].sort((a, b) => (b.week_start || "").localeCompare(a.week_start || ""));
  for (const p of sortedPlans) {
    const ph = Array.isArray(p.phases) ? p.phases[0] : p.phases;
    if (!ph || !activeGoalIds.has(ph.goal_id)) continue;
    if (seenPhases.has(ph.id)) continue; // already have a newer plan for this phase
    seenPhases.add(ph.id);
    latestPlanIds.push(p.id);
  }

  // TO-DOS card counts are filled in below, after `todayItems` is built —
  // they need to be derived from the same merged stream that the Today's
  // To-Do List section renders (today's pending daily_tasks for active
  // goals + todos with deadline today), otherwise the top card and the
  // list visibly disagree. Splitting goal vs personal happens via the
  // already-set `source` field on each todayItem.
  let pendingGoalTodos = 0;
  let pendingPersonalTodos = 0;

  // Workflows stats
  const totalWorkflows = workflows.length;
  const todayRuns: DashboardWorkflowRun[] = runs.map((r: Record<string, unknown>) => {
    const wf = Array.isArray(r.workflows) ? r.workflows[0] : r.workflows;
    return {
      id: r.id as string,
      workflowId: r.workflow_id as string,
      workflowName: (wf as { name?: string })?.name || "Unknown",
      status: r.status as "running" | "success" | "failed" | "cancelled",
      triggeredBy: r.triggered_by as "manual" | "scheduled",
      startedAt: r.started_at as string,
      completedAt: r.completed_at as string | null,
    };
  });

  const stats: DashboardStats = {
    activeGoals,
    totalGoals,
    goalProgressPercent,
    pendingGoalTodos,
    pendingPersonalTodos,
    totalWorkflows,
    todayRunCount: todayRuns.length,
    todayRuns,
    totalTeamMembers: 0, // Computed client-side from localStorage
  };

  // --- Onboarding stage ---
  //
  // Drives the WelcomeBanner. Pure derivation from the same data we
  // already loaded — no extra round-trips. Stage progression assumes the
  // user follows the natural Goal → Weekly Plan → Personal To-Do path.
  // Step 3 only counts Personal to-dos (goal_id IS NULL); todos created
  // from a Goal don't fulfill the "create your first to-do" step because
  // those are auto-generated from the weekly plan.
  const goalCount = goals.length;
  const weeklyPlanCount = plans.length;
  const personalTodoCount = todos.filter((t) => !t.goal_id).length;

  let stage: DashboardOnboardingStage;
  if (goalCount === 0) stage = "stage1";
  else if (weeklyPlanCount === 0) stage = "stage2";
  else if (personalTodoCount === 0) stage = "stage3";
  else stage = "done";

  const onboarding: DashboardOnboarding = {
    stage,
    goalCount,
    singleGoalId: goalCount === 1 ? goals[0].id : null,
    weeklyPlanCount,
    personalTodoCount,
  };

  // --- Today Items ---

  // Build planId → goalTitle and planId → goalId maps. The id map lets the
  // dashboard "Send to Team" button route the chat into the goal's session
  // instead of the generic dashboard task-assistant session.
  const planGoalMap = new Map<string, string>();
  const planGoalIdMap = new Map<string, string>();
  for (const p of plans) {
    const ph = Array.isArray(p.phases) ? p.phases[0] : p.phases;
    if (!ph) continue;
    const goal = Array.isArray(ph.goals) ? ph.goals[0] : ph.goals;
    if (goal?.title) planGoalMap.set(p.id, goal.title);
    if (goal?.id) planGoalIdMap.set(p.id, goal.id);
  }

  const todayItems: DashboardTodayItem[] = [];

  // Goal daily tasks for today (from latest plan per goal)
  if (latestPlanIds.length > 0) {
    const { data: todayTasks } = await supabase
      .from("daily_tasks")
      .select("id, title, description, completed, time_slot, day_of_week, weekly_plan_id")
      .in("weekly_plan_id", latestPlanIds)
      .eq("day_of_week", todayDow)
      .order("sort_order");

    if (todayTasks) {
      for (const t of todayTasks) {
        todayItems.push({
          id: t.id,
          title: t.title,
          description: t.time_slot || t.description,
          completed: t.completed,
          timeSlot: classifyTimeSlot(t.time_slot),
          source: "goal",
          sourceLabel: planGoalMap.get(t.weekly_plan_id) || "Goal",
          sourceType: "daily_task",
          deadline: null,
          priority: "medium" as const,
          tag: "Goal",
          goalId: planGoalIdMap.get(t.weekly_plan_id) || null,
        });
      }
    }
  }

  // Build goal_id → title map from goals query
  const goalTitleMap = new Map<string, string>();
  for (const g of goals) goalTitleMap.set(g.id, g.title);

  // Personal & goal todos with deadline today (or completed today)
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
      const isGoalTodo = !!(t.goal_id && goalTitleMap.has(t.goal_id));
      todayItems.push({
        id: t.id,
        title: t.text,
        description: null,
        completed: t.completed,
        timeSlot,
        source: isGoalTodo ? "goal" : "personal",
        sourceLabel: isGoalTodo ? goalTitleMap.get(t.goal_id!)! : (t.tag || "Personal"),
        sourceType: "todo",
        deadline: t.deadline,
        priority: t.priority,
        tag: t.tag || "Personal",
        goalId: isGoalTodo ? t.goal_id! : null,
      });
    }
  }

  // Now that todayItems is fully assembled (goal daily_tasks + todos
  // with deadline today), derive the TO-DOS card counts from it so the
  // top stat and the Today's To-Do List section can never disagree.
  pendingGoalTodos = todayItems.filter(
    (i) => i.source === "goal" && !i.completed,
  ).length;
  pendingPersonalTodos = todayItems.filter(
    (i) => i.source === "personal" && !i.completed,
  ).length;
  stats.pendingGoalTodos = pendingGoalTodos;
  stats.pendingPersonalTodos = pendingPersonalTodos;

  // Goals with phases for Active Goals section
  const goalsWithPhases = (goalsWithPhasesRes.data || []) as GoalWithPhases[];

  // High priority pending todos (across all todos, not just today)
  const highPriorityItems: DashboardTodayItem[] = todos
    .filter(t => t.priority === "high" && !t.completed && !t.goal_id)
    .map(t => ({
      id: t.id,
      title: t.text,
      description: null,
      completed: false,
      timeSlot: "afternoon" as const,
      source: "personal" as const,
      sourceLabel: t.tag || "Personal",
      sourceType: "todo" as const,
      deadline: t.deadline,
      priority: t.priority,
      tag: t.tag || "Personal",
      goalId: null,
    }));

  return { stats, todayItems, highPriorityItems, goalsWithPhases, onboarding };
}

// ============================================================
// Billing — subscription state + credit transactions
// ============================================================

export async function getBillingState() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: quota } = await supabase
    .from("user_quotas")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!quota) {
    // Auto-create default row
    const { data: created } = await supabase
      .from("user_quotas")
      .insert({ user_id: user.id })
      .select()
      .single();
    return created;
  }

  return quota;
}

export async function getRecentCreditTransactions(limit = 20) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}
