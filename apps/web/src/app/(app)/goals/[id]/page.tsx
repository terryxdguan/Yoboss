"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/db/client";
import type { Goal, Phase, WeeklyPlan, DailyTask } from "@/lib/types/database";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

function getTodayDayOfWeek(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1; // 0=Mon, 6=Sun
}

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<(WeeklyPlan & { daily_tasks: DailyTask[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePhase = phases.find((p) => p.status === "active");

  const loadData = useCallback(async () => {
    const supabase = createClient();

    const { data: goalData } = await supabase
      .from("goals")
      .select("*")
      .eq("id", id)
      .single();
    setGoal(goalData);

    const { data: phasesData } = await supabase
      .from("phases")
      .select("*")
      .eq("goal_id", id)
      .order("sort_order");
    setPhases(phasesData || []);

    // Load weekly plan for current week
    const weekStart = getWeekStart();
    const { data: planData } = await supabase
      .from("weekly_plans")
      .select("*, daily_tasks(*)")
      .eq("week_start", weekStart)
      .order("sort_order", { referencedTable: "daily_tasks" });

    // Filter to plans for this goal's phases
    const phaseIds = (phasesData || []).map((p) => p.id);
    const matchingPlan = (planData || []).find((p: WeeklyPlan) =>
      phaseIds.includes(p.phase_id)
    ) as (WeeklyPlan & { daily_tasks: DailyTask[] }) | undefined;

    setWeeklyPlan(matchingPlan || null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateWeeklyPlan = async () => {
    if (!activePhase || !goal) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "weekly",
          context: {
            goalTitle: goal.title,
            goalDescription: goal.description || "",
            phase: activePhase,
            weekNumber: 1,
            isFirstWeek: true,
            isMidWeekStart: getTodayDayOfWeek() > 0,
            startDayOfWeek: getTodayDayOfWeek(),
          },
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const plan = await res.json();

      // Save to DB
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data: weeklyPlanRecord, error: wpErr } = await supabase
        .from("weekly_plans")
        .insert({
          phase_id: activePhase.id,
          user_id: user.id,
          week_start: getWeekStart(),
          ai_summary: plan.ai_summary,
        })
        .select()
        .single();
      if (wpErr) throw wpErr;

      // Save tasks
      const tasksToInsert = plan.tasks.map((t: { day_of_week: number; title: string; description: string; time_estimate_minutes: number; time_slot: string; sort_order: number }) => ({
        weekly_plan_id: weeklyPlanRecord.id,
        day_of_week: t.day_of_week,
        title: t.title,
        description: t.description,
        time_estimate_minutes: t.time_estimate_minutes,
        time_slot: t.time_slot,
        sort_order: t.sort_order,
      }));

      const { error: taskErr } = await supabase
        .from("daily_tasks")
        .insert(tasksToInsert);
      if (taskErr) throw taskErr;

      // Reload data
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Generate weekly plan error:", msg);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    const supabase = createClient();
    await supabase
      .from("daily_tasks")
      .update({
        completed: !completed,
        completed_at: !completed ? new Date().toISOString() : null,
      })
      .eq("id", taskId);

    // Update local state
    if (weeklyPlan) {
      setWeeklyPlan({
        ...weeklyPlan,
        daily_tasks: weeklyPlan.daily_tasks.map((t) =>
          t.id === taskId
            ? { ...t, completed: !completed, completed_at: !completed ? new Date().toISOString() : null }
            : t
        ),
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-[#8C939B]">Loading...</div>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="text-center py-24">
        <p className="text-[#626A73]">Goal not found</p>
        <button
          onClick={() => router.push("/goals")}
          className="text-sm text-[#4C7CF0] mt-2 hover:underline"
        >
          Back to Goals
        </button>
      </div>
    );
  }

  const totalWeeks = phases.reduce((sum, p) => sum + (p.estimated_weeks || 0), 0);
  const todayIdx = getTodayDayOfWeek();

  // Group tasks by day
  const tasksByDay: Record<number, DailyTask[]> = {};
  if (weeklyPlan) {
    for (const task of weeklyPlan.daily_tasks) {
      if (!tasksByDay[task.day_of_week]) tasksByDay[task.day_of_week] = [];
      tasksByDay[task.day_of_week].push(task);
    }
  }

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => router.push("/goals")}
        className="flex items-center gap-1.5 text-sm text-[#626A73] hover:text-[#1E2227] transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Goals
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1E2227]">{goal.title}</h1>
        {goal.description && (
          <p className="text-sm text-[#626A73] mt-1">{goal.description}</p>
        )}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-[#4D8B6A]/10 text-[#4D8B6A]">
            {goal.status}
          </span>
          <span className="text-xs text-[#8C939B]">
            {phases.length} phases, ~{totalWeeks} weeks
          </span>
        </div>
      </div>

      {/* Phase timeline */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {phases.map((phase, idx) => (
          <div key={phase.id} className="flex items-center">
            <div
              className={`flex items-center justify-center shrink-0 w-10 h-10 rounded-xl text-sm font-semibold ${
                phase.status === "completed"
                  ? "bg-[#4D8B6A] text-white"
                  : phase.status === "active"
                    ? "bg-[#4C7CF0] text-white"
                    : "bg-[#E6E1D8] text-[#8C939B]"
              }`}
            >
              {phase.status === "completed" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                idx + 1
              )}
            </div>
            {idx < phases.length - 1 && (
              <div
                className={`w-8 h-0.5 ${
                  phase.status === "completed" ? "bg-[#4D8B6A]" : "bg-[#E6E1D8]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Phase cards */}
      <div className="space-y-4">
        {phases.map((phase, idx) => (
          <div
            key={phase.id}
            className={`rounded-[18px] border bg-white p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)] ${
              phase.status === "active" ? "border-[#4C7CF0]/30" : "border-[#E6E1D8]"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      phase.status === "active"
                        ? "bg-[#4C7CF0]/10 text-[#4C7CF0]"
                        : phase.status === "completed"
                          ? "bg-[#4D8B6A]/10 text-[#4D8B6A]"
                          : "bg-[#F1EEE8] text-[#8C939B]"
                    }`}
                  >
                    Phase {idx + 1}
                  </span>
                  {phase.status === "active" && (
                    <span className="text-xs text-[#4C7CF0] font-medium">Current</span>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-[#1E2227] mt-1">{phase.title}</h3>
                {phase.description && (
                  <p className="text-sm text-[#626A73] mt-0.5">{phase.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#8C939B]">
                <Clock className="h-3.5 w-3.5" />
                {phase.estimated_weeks} week{phase.estimated_weeks !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Weekly plan section (active phase only) */}
            {phase.status === "active" && (
              <div className="mt-4 pt-4 border-t border-[#E6E1D8]">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-[#1E2227]">
                    Weekly Plan
                    {weeklyPlan?.ai_summary && (
                      <span className="font-normal text-[#626A73] ml-2">
                        — {weeklyPlan.ai_summary}
                      </span>
                    )}
                  </h4>
                  {!weeklyPlan && (
                    <button
                      onClick={handleGenerateWeeklyPlan}
                      disabled={generating}
                      className="flex items-center gap-1.5 text-xs text-[#4C7CF0] font-medium hover:underline disabled:opacity-50"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Generate with AI
                        </>
                      )}
                    </button>
                  )}
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-[#C65B52]/5 rounded-lg text-sm text-[#C65B52]">
                    {error}
                  </div>
                )}

                {!weeklyPlan && !generating && (
                  <div className="text-center py-8">
                    <Circle className="h-8 w-8 text-[#E6E1D8] mx-auto mb-2" />
                    <p className="text-sm text-[#8C939B]">No weekly plan yet</p>
                    <p className="text-xs text-[#8C939B] mt-1">
                      Click &quot;Generate with AI&quot; to create this week&apos;s schedule
                    </p>
                  </div>
                )}

                {generating && (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 text-[#4C7CF0] mx-auto mb-2 animate-spin" />
                    <p className="text-sm text-[#626A73]">Generating your weekly plan...</p>
                  </div>
                )}

                {/* Task list grouped by day */}
                {weeklyPlan && (
                  <div className="space-y-4">
                    {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
                      const tasks = tasksByDay[dayIdx];
                      if (!tasks || tasks.length === 0) return null;

                      const isToday = dayIdx === todayIdx;
                      const completedCount = tasks.filter((t) => t.completed).length;

                      return (
                        <div
                          key={dayIdx}
                          className={`rounded-lg border p-4 ${
                            isToday
                              ? "border-[#4C7CF0]/30 bg-[#EAF0FF]/20"
                              : "border-[#E6E1D8] bg-[#F1EEE8]/50"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-semibold text-[#1E2227]">
                                {DAY_NAMES[dayIdx]}
                              </h5>
                              {isToday && (
                                <span className="text-[10px] font-semibold text-[#4C7CF0] bg-[#4C7CF0]/10 px-1.5 py-0.5 rounded">
                                  TODAY
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[#8C939B]">
                              {completedCount}/{tasks.length} done
                            </span>
                          </div>

                          <ul className="space-y-2">
                            {tasks.map((task) => (
                              <li
                                key={task.id}
                                className="flex items-start gap-3 cursor-pointer group"
                                onClick={() => handleToggleTask(task.id, task.completed)}
                              >
                                {task.completed ? (
                                  <CheckCircle2 className="h-5 w-5 text-[#4D8B6A] shrink-0 mt-0.5 fill-[#4D8B6A] stroke-white" />
                                ) : (
                                  <Circle className="h-5 w-5 text-[#8C939B] shrink-0 mt-0.5 group-hover:text-[#4C7CF0] transition-colors" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p
                                    className={`text-sm ${
                                      task.completed
                                        ? "text-[#8C939B] line-through"
                                        : "text-[#1E2227]"
                                    }`}
                                  >
                                    {task.title}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {task.time_slot && (
                                      <span className="text-[11px] text-[#8C939B]">
                                        {task.time_slot}
                                      </span>
                                    )}
                                    {task.time_estimate_minutes && (
                                      <span className="text-[11px] text-[#8C939B]">
                                        {task.time_estimate_minutes} min
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
