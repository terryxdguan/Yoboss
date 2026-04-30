// Server-only context builders. Inject the user's long-term memory and
// active-goal/today-todo snapshot into the system prompt so agents share
// a consistent picture across Goal coach / Goal-creation wizard / Team
// agent chat without the user having to re-state things.
//
// Both helpers return a markdown-style string ready to concatenate into
// the system prompt. Empty input → empty string (cheap no-op).

import "server-only";
import { createClient } from "@/lib/db/server";
import { touchUserMemoryUsedAt } from "@/lib/db/actions";
import type { UserMemory, UserMemoryImportance } from "@/lib/types/database";

// Mirror of the rank in actions.ts. Postgres sorts importance text
// alphabetically (high < low < medium) so we order in JS instead.
const IMPORTANCE_RANK: Record<UserMemoryImportance, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Compute the user's local date as YYYY-MM-DD given an IANA timezone. We
// avoid dragging in a date library; Intl + sv-SE locale gives us the exact
// shape Postgres wants for date columns.
function localDateInTz(tz: string): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

// Postgres day_of_week mapping used by daily_tasks.day_of_week:
// 0=Mon, 1=Tue, ..., 6=Sun (verified in lib/utils/date.ts).
function localDayOfWeekInTz(tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  });
  const day = fmt.format(new Date());
  const map: Record<string, number> = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };
  return map[day] ?? 0;
}

/**
 * Build the long-term user memory block. Returns empty string when there's
 * no memory yet so callers can `${block}` directly without conditionals.
 *
 * Side effect: bumps `last_used_at` on the rows we return so LRU eviction
 * stays honest. Fire-and-forget — failure here is harmless.
 */
export async function buildUserMemoryContext(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "";

  const { data, error } = await supabase
    .from("user_memory")
    .select("*")
    .eq("user_id", user.id)
    .order("last_used_at", { ascending: false });

  if (error || !data || data.length === 0) return "";

  // Sort by importance rank in JS — Postgres alphabetical sort would put
  // medium before high (see IMPORTANCE_RANK note above).
  const memories = (data as UserMemory[]).sort((a, b) => {
    const ra = IMPORTANCE_RANK[a.importance] ?? 0;
    const rb = IMPORTANCE_RANK[b.importance] ?? 0;
    if (ra !== rb) return rb - ra;
    return b.last_used_at.localeCompare(a.last_used_at);
  });

  // Bump last_used_at; don't await, this is bookkeeping.
  touchUserMemoryUsedAt(memories.map((m) => m.id)).catch(() => {});

  const lines = memories.map((m) => {
    const tag = m.category ? `[${m.category}] ` : "";
    return `- ${tag}${m.content}`;
  });

  return `## What you know about this user (long-term memory)
${lines.join("\n")}
`;
}

/**
 * Build the dynamic Active Goals + Today's To-Dos block. Pulls everything
 * in one round-trip via Supabase joins, then formats. Skips workflows by
 * design — those have their own intra-run state.
 *
 * Result format:
 *   ## Your active goals
 *   - "Goal title" — current phase: "Phase 2: Build" (4 weeks)
 *     Description: ...
 *     Milestones in current phase:
 *       - Milestone 1
 *       - Milestone 2 ✓
 *
 *   ## Today (Wed 2026-04-29)
 *   - [ ] (B2C product) Interview 5 target users — morning
 *   - [✓] (personal) Pick up dry cleaning
 */
export async function buildActiveGoalsContext(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "";

  // Pull the user's timezone for "today" calculation. Falls back to UTC
  // if unset — the daily-email path already migrated everyone to a real
  // tz, but defensive default is cheap.
  const { data: userRow } = await supabase
    .from("users")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const tz = userRow?.timezone || "UTC";
  const todayDate = localDateInTz(tz);
  const todayDow = localDayOfWeekInTz(tz);

  // Active goals + their phases (we only show the active phase's
  // milestones to keep the block small).
  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, description, phases(id, title, description, status, estimated_weeks, sort_order)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const activeGoals =
    (goals as Array<{
      id: string;
      title: string;
      description: string | null;
      phases: Array<{
        id: string;
        title: string;
        description: string | null;
        status: string;
        estimated_weeks: number | null;
        sort_order: number;
      }>;
    }> | null) || [];

  // For each active goal, find the current active phase's milestones.
  const activePhaseIds = activeGoals
    .map((g) => g.phases.find((p) => p.status === "active")?.id)
    .filter((id): id is string => !!id);

  const { data: phaseTasksData } =
    activePhaseIds.length > 0
      ? await supabase
          .from("phase_tasks")
          .select("id, phase_id, title, completed, sort_order")
          .in("phase_id", activePhaseIds)
          .order("sort_order")
      : { data: [] };

  const phaseTasksByPhase = new Map<
    string,
    Array<{ title: string; completed: boolean }>
  >();
  for (const t of (phaseTasksData || []) as Array<{
    phase_id: string;
    title: string;
    completed: boolean;
  }>) {
    if (!phaseTasksByPhase.has(t.phase_id)) phaseTasksByPhase.set(t.phase_id, []);
    phaseTasksByPhase.get(t.phase_id)!.push({ title: t.title, completed: t.completed });
  }

  // Today's daily_tasks across all active goals' weekly plans, scoped to
  // today's day_of_week. We don't need to filter by week_start since the
  // chat panels' Coach already operates on the latest plan; here we just
  // care "what's on today's list" and a stale plan is unlikely.
  const goalIds = activeGoals.map((g) => g.id);
  const allPhaseIds = activeGoals.flatMap((g) => g.phases.map((p) => p.id));

  const { data: todayDailyTasks } =
    allPhaseIds.length > 0
      ? await supabase
          .from("daily_tasks")
          .select(
            "id, title, completed, time_slot, weekly_plans!inner(phase_id, phases!inner(goal_id, title))",
          )
          .eq("day_of_week", todayDow)
          .in("weekly_plans.phase_id", allPhaseIds)
      : { data: [] };

  // Personal todos (or goal-tagged todos) due today — match the dashboard's
  // semantics: personal items have null goal_id, deadline = today.
  const { data: todayTodos } = await supabase
    .from("todos")
    .select("id, title, completed, deadline, goal_id, priority")
    .eq("user_id", user.id)
    .eq("deadline", todayDate);

  // ---- Format ----

  const sections: string[] = [];

  if (activeGoals.length > 0) {
    const goalLines = activeGoals.map((g) => {
      const phasesSorted = [...g.phases].sort((a, b) => a.sort_order - b.sort_order);
      const activePhase = phasesSorted.find((p) => p.status === "active");
      const phaseLabel = activePhase
        ? `${activePhase.title}${activePhase.estimated_weeks ? ` (${activePhase.estimated_weeks} weeks)` : ""}`
        : "(no active phase)";
      const lines: string[] = [];
      lines.push(`- "${g.title}" — current phase: ${phaseLabel}`);
      if (g.description) lines.push(`  Description: ${g.description}`);
      if (activePhase?.description)
        lines.push(`  Phase focus: ${activePhase.description}`);
      const milestones = activePhase
        ? phaseTasksByPhase.get(activePhase.id) || []
        : [];
      if (milestones.length > 0) {
        lines.push(`  Milestones in current phase:`);
        for (const m of milestones) {
          lines.push(`    - ${m.completed ? "✓ " : ""}${m.title}`);
        }
      }
      return lines.join("\n");
    });
    sections.push(`## Your active goals\n${goalLines.join("\n\n")}`);
  }

  // Today's items — merge daily_tasks (goal-scoped) + todos (personal /
  // goal-tagged). Group display by status so the agent can see at a glance
  // what's outstanding.
  type TodayItem = {
    title: string;
    source: string; // "B2C product" or "personal"
    completed: boolean;
    timeSlot?: string | null;
  };
  const todayItems: TodayItem[] = [];

  // Supabase typed Joins can return either object or array shape for the
  // foreign side depending on FK direction; normalise both.
  type DailyTaskWithGoal = {
    title: string;
    completed: boolean;
    time_slot: string | null;
    weekly_plans:
      | { phases: { goal_id: string } | Array<{ goal_id: string }> }
      | Array<{ phases: { goal_id: string } | Array<{ goal_id: string }> }>;
  };
  const dailyTasks = (todayDailyTasks || []) as unknown as DailyTaskWithGoal[];
  for (const dt of dailyTasks) {
    const wp = Array.isArray(dt.weekly_plans) ? dt.weekly_plans[0] : dt.weekly_plans;
    const ph = Array.isArray(wp?.phases) ? wp.phases[0] : wp?.phases;
    const goalId = ph?.goal_id;
    const goal = activeGoals.find((g) => g.id === goalId);
    todayItems.push({
      title: dt.title,
      source: goal?.title || "goal",
      completed: dt.completed,
      timeSlot: dt.time_slot,
    });
  }

  for (const t of (todayTodos as Array<{
    title: string;
    completed: boolean;
    goal_id: string | null;
  }> | null) || []) {
    const goal = activeGoals.find((g) => g.id === t.goal_id);
    todayItems.push({
      title: t.title,
      source: goal?.title || "personal",
      completed: t.completed,
    });
  }

  if (todayItems.length > 0) {
    const todayHeader = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }).format(new Date());
    const itemLines = todayItems.map((i) => {
      const check = i.completed ? "[✓]" : "[ ]";
      const slot = i.timeSlot ? ` — ${i.timeSlot}` : "";
      return `- ${check} (${i.source}) ${i.title}${slot}`;
    });
    sections.push(`## Today (${todayHeader})\n${itemLines.join("\n")}`);
  }

  if (sections.length === 0) return "";
  return `${sections.join("\n\n")}\n`;
}

/**
 * Convenience wrapper: fetch both blocks in parallel and stitch them. The
 * order matches the design — long-term memory first (more general), then
 * Active Goals (more current).
 */
export async function buildUserContext(): Promise<string> {
  const [memory, goals] = await Promise.all([
    buildUserMemoryContext(),
    buildActiveGoalsContext(),
  ]);
  return [memory, goals].filter(Boolean).join("\n");
}
