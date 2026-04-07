"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  Calendar,
  RefreshCw,
  MessageSquare,
  Paperclip,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/db/client";
import type { Goal, Phase, WeeklyPlan, DailyTask } from "@/lib/types/database";
import { WeeklyPlanChatPanel } from "@/components/goals/weekly-plan-chat";
import { GoalChatPanel } from "@/components/goals/goal-chat-panel";
import { DeliverablesPanel } from "@/components/goals/deliverables-panel";
import { NotesPanel } from "@/components/goals/notes-panel";

type RightPanel = "none" | "ai" | "plan-chat" | "deliverables" | "notes";

const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

function getWeekDates(): string[] {
  const weekStart = getWeekStart();
  const monday = new Date(weekStart + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  });
}

function getTodayDayOfWeek(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1;
}

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<(WeeklyPlan & { daily_tasks: DailyTask[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [pendingAITask, setPendingAITask] = useState<DailyTask | null>(null);

  const togglePanel = (panel: RightPanel) => {
    setRightPanel((prev) => (prev === panel ? "none" : panel));
    if (panel !== "ai") setPendingAITask(null);
  };

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

    // Default selected phase to active one
    const active = (phasesData || []).find((p) => p.status === "active");
    setSelectedPhaseId((prev) => prev || active?.id || (phasesData?.[0]?.id ?? null));

    // Load the latest weekly plan for this goal's phases
    const phaseIds = (phasesData || []).map((p) => p.id);
    const { data: planData } = await supabase
      .from("weekly_plans")
      .select("*, daily_tasks(*)")
      .in("phase_id", phaseIds)
      .order("week_start", { ascending: false })
      .order("sort_order", { referencedTable: "daily_tasks" })
      .limit(1);

    const matchingPlan = (planData && planData.length > 0)
      ? planData[0] as (WeeklyPlan & { daily_tasks: DailyTask[] })
      : undefined;

    setWeeklyPlan(matchingPlan || null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    const supabase = createClient();
    await supabase
      .from("daily_tasks")
      .update({
        completed: !completed,
        completed_at: !completed ? new Date().toISOString() : null,
      })
      .eq("id", taskId);

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

  const handleUpdateTask = async (taskId: string, field: "title" | "time_slot", value: string) => {
    const supabase = createClient();
    await supabase
      .from("daily_tasks")
      .update({ [field]: value })
      .eq("id", taskId);

    if (weeklyPlan) {
      setWeeklyPlan({
        ...weeklyPlan,
        daily_tasks: weeklyPlan.daily_tasks.map((t) =>
          t.id === taskId ? { ...t, [field]: value } : t
        ),
      });
    }
  };

  const handleAskAI = (task: DailyTask) => {
    setPendingAITask(task);
    setRightPanel("ai");
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

  const activePhase = phases.find((p) => p.status === "active");
  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) || activePhase || phases[0];
  const todayIdx = getTodayDayOfWeek();
  const weekDates = getWeekDates();
  const hasTasks = weeklyPlan && weeklyPlan.daily_tasks && weeklyPlan.daily_tasks.length > 0;

  // Progress
  const totalTasks = weeklyPlan?.daily_tasks?.length || 0;
  const completedTasks = weeklyPlan?.daily_tasks?.filter((t) => t.completed).length || 0;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Group tasks by day
  const tasksByDay: Record<number, DailyTask[]> = {};
  if (weeklyPlan) {
    for (const task of weeklyPlan.daily_tasks) {
      if (!tasksByDay[task.day_of_week]) tasksByDay[task.day_of_week] = [];
      tasksByDay[task.day_of_week].push(task);
    }
  }

  return (
    <div className="flex -mx-6 md:-mx-8 -mb-12">
      {/* Main content */}
      <div className="flex-1 min-w-0 px-6 md:px-8 pb-12">
        <div className="max-w-6xl mx-auto">
      {/* Header */}
      <button
        onClick={() => router.push("/goals")}
        className="flex items-center gap-1.5 text-sm text-[#626A73] hover:text-[#1E2227] transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Goals
      </button>

      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#1E2227]">{goal.title}</h1>
            {goal.description && (
              <p className="text-sm text-[#626A73] mt-1 max-w-2xl">{goal.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 border border-[#E6E1D8] rounded-lg p-1">
              <button
                onClick={() => togglePanel("ai")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  rightPanel === "ai"
                    ? "bg-[#4C7CF0] text-white"
                    : "text-[#626A73] hover:bg-[#F1EEE8] hover:text-[#1E2227]"
                }`}
                title="AI Coach"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                AI
              </button>
              <button
                onClick={() => togglePanel("deliverables")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  rightPanel === "deliverables"
                    ? "bg-[#4C7CF0] text-white"
                    : "text-[#626A73] hover:bg-[#F1EEE8] hover:text-[#1E2227]"
                }`}
                title="Deliverables"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => togglePanel("notes")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  rightPanel === "notes"
                    ? "bg-[#4C7CF0] text-white"
                    : "text-[#626A73] hover:bg-[#F1EEE8] hover:text-[#1E2227]"
                }`}
                title="Notes"
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#4D8B6A]/10 text-[#4D8B6A]">
              {goal.status}
            </span>
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#1E2227]">Overall Progress</h2>
          <span className="text-sm font-semibold text-[#1E2227]">{progressPct}%</span>
        </div>
        <div className="rounded-2xl border border-[#E6E1D8] bg-white p-5 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
          <div className="h-2 bg-[#E6E1D8] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4D8B6A] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-[#8C939B] mt-2">
            {completedTasks} / {totalTasks} tasks completed
          </p>
        </div>
      </div>

      {/* Roadmap */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#1E2227]">Roadmap</h2>
          <span className="text-xs text-[#8C939B]">{phases.length} phases</span>
        </div>
        <div className="rounded-2xl border border-[#E6E1D8] bg-white p-5 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {phases.map((phase, idx) => {
            const isSelected = phase.id === selectedPhaseId;
            return (
              <div key={phase.id} className="flex items-center">
                <button
                  onClick={() => setSelectedPhaseId(phase.id)}
                  className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[120px] ${
                    isSelected
                      ? "bg-[#4C7CF0]/8 ring-1 ring-[#4C7CF0]/30"
                      : "hover:bg-[#F1EEE8]"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      phase.status === "completed"
                        ? "bg-[#4D8B6A] text-white"
                        : phase.status === "active"
                          ? "bg-[#4C7CF0] text-white"
                          : "bg-[#E6E1D8] text-[#8C939B]"
                    }`}
                  >
                    {phase.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className={`text-[11px] font-medium text-center leading-tight line-clamp-2 ${
                    isSelected ? "text-[#1E2227]" : "text-[#8C939B]"
                  }`}>
                    {phase.title.replace(/^Phase \d+:\s*/, "")}
                  </span>
                </button>
                {idx < phases.length - 1 && (
                  <div
                    className={`w-6 h-0.5 shrink-0 ${
                      phase.status === "completed" ? "bg-[#4D8B6A]" : "bg-[#E6E1D8]"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Selected phase info */}
        {selectedPhase && (
          <div className="mt-4 pt-4 border-t border-[#E6E1D8]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#1E2227]">{selectedPhase.title}</h3>
                {selectedPhase.description && (
                  <p className="text-sm text-[#626A73] mt-1">{selectedPhase.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#8C939B] shrink-0">
                <Clock className="h-3.5 w-3.5" />
                {selectedPhase.estimated_weeks} week{selectedPhase.estimated_weeks !== 1 ? "s" : ""}
              </div>
            </div>
          </div>
        )}
      </div>{/* end white card */}
      </div>{/* end Roadmap section */}

      {/* Weekly Schedule */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#4C7CF0]" />
            <h2 className="text-base font-semibold text-[#1E2227]">Weekly Schedule</h2>
          </div>
          {hasTasks ? (
            <button
              onClick={() => setRightPanel("plan-chat")}
              className="flex items-center gap-1.5 text-xs text-[#4C7CF0] font-medium hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </button>
          ) : (
            <button
              onClick={() => setRightPanel("plan-chat")}
              className="flex items-center gap-1.5 text-xs text-[#4C7CF0] font-medium hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </button>
          )}
        </div>

        {!hasTasks && (
          <div className="rounded-2xl border border-dashed border-[#D8D1C6] bg-white p-12 text-center">
            <Circle className="h-8 w-8 text-[#E6E1D8] mx-auto mb-2" />
            <p className="text-sm text-[#8C939B]">No weekly plan yet</p>
            <p className="text-xs text-[#8C939B] mt-1">
              Generate a plan to see your daily schedule
            </p>
          </div>
        )}

        {hasTasks && (
          <div className="grid grid-cols-4 gap-3">
            {/* Row 1: Mon-Thu */}
            {[0, 1, 2, 3].map((dayIdx) => (
              <DayCard
                key={dayIdx}
                dayName={DAY_NAMES_SHORT[dayIdx]}
                date={weekDates[dayIdx]}
                tasks={tasksByDay[dayIdx] || []}
                isToday={dayIdx === todayIdx}
                onToggleTask={handleToggleTask}
                onUpdateTask={handleUpdateTask}
                onAskAI={handleAskAI}
              />
            ))}
            {/* Row 2: Fri-Sun */}
            {[4, 5, 6].map((dayIdx) => (
              <DayCard
                key={dayIdx}
                dayName={DAY_NAMES_SHORT[dayIdx]}
                date={weekDates[dayIdx]}
                tasks={tasksByDay[dayIdx] || []}
                isToday={dayIdx === todayIdx}
                onToggleTask={handleToggleTask}
                onUpdateTask={handleUpdateTask}
                onAskAI={handleAskAI}
              />
            ))}
          </div>
        )}
      </div>

      </div>{/* end max-w-6xl */}
      </div>{/* end main content */}

      {/* Right panels */}
      {rightPanel === "ai" && (
        <GoalChatPanel
          goalId={id}
          goalContext={{
            goalTitle: goal.title,
            goalDescription: goal.description || "",
            phases: phases.map((p) => ({
              title: p.title,
              description: p.description || "",
              status: p.status,
              estimatedWeeks: p.estimated_weeks || 0,
            })),
            weeklyTasks: weeklyPlan?.daily_tasks?.map((t) => ({
              dayOfWeek: t.day_of_week,
              title: t.title,
              timeSlot: t.time_slot,
              completed: t.completed,
            })) || [],
            weekSummary: weeklyPlan?.ai_summary || null,
          }}
          taskContext={pendingAITask}
          onClose={() => { setRightPanel("none"); setPendingAITask(null); }}
        />
      )}
      {rightPanel === "plan-chat" && activePhase && (
        <WeeklyPlanChatPanel
          open={true}
          onClose={() => setRightPanel("none")}
          context={{
            goalTitle: goal.title,
            goalDescription: goal.description || "",
            phaseTitle: activePhase.title,
            phaseDescription: activePhase.description || "",
            weekNumber: 1,
            estimatedWeeks: activePhase.estimated_weeks || 4,
            isMidWeekStart: getTodayDayOfWeek() > 0,
            startDayOfWeek: getTodayDayOfWeek(),
          }}
          phaseId={activePhase.id}
          weekStart={getWeekStart()}
          onPlanSaved={loadData}
        />
      )}
      {rightPanel === "deliverables" && (
        <DeliverablesPanel
          goalId={id}
          onClose={() => setRightPanel("none")}
        />
      )}
      {rightPanel === "notes" && (
        <NotesPanel
          goalId={id}
          onClose={() => setRightPanel("none")}
        />
      )}
    </div>
  );
}

function DayCard({
  dayName,
  date,
  tasks,
  isToday,
  onToggleTask,
  onUpdateTask,
  onAskAI,
}: {
  dayName: string;
  date: string;
  tasks: DailyTask[];
  isToday: boolean;
  onToggleTask: (taskId: string, completed: boolean) => void;
  onUpdateTask: (taskId: string, field: "title" | "time_slot", value: string) => void;
  onAskAI: (task: DailyTask) => void;
}) {
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div
      className={`rounded-xl border bg-white min-h-[140px] shadow-[0_2px_8px_rgba(30,34,39,0.04)] overflow-hidden ${
        isToday
          ? "border-[#4C7CF0]/40 ring-1 ring-[#4C7CF0]/15"
          : "border-[#E6E1D8]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E6E1D8]">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${isToday ? "text-[#4C7CF0]" : "text-[#1E2227]"}`}>
            {dayName}
            {isToday && <span className="ml-1 text-[11px] font-normal">(Today)</span>}
          </span>
        </div>
        <span className={`text-[11px] ${isToday ? "text-[#4C7CF0]" : "text-[#8C939B]"}`}>{date}</span>
      </div>

      {/* Tasks */}
      {tasks.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-xs text-[#D8D1C6] italic">No tasks</p>
        </div>
      ) : (
        <div className="divide-y divide-[#E6E1D8]">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggleTask}
              onUpdate={onUpdateTask}
              onAskAI={onAskAI}
            />
          ))}
        </div>
      )}

      {tasks.length > 0 && (
        <div className="px-4 py-2 border-t border-[#E6E1D8] bg-[#F7F5F1]/50">
          <span className={`text-[10px] font-medium ${
            completedCount === tasks.length
              ? "text-[#4D8B6A]"
              : "text-[#8C939B]"
          }`}>
            {completedCount}/{tasks.length} done
          </span>
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task,
  onToggle,
  onUpdate,
  onAskAI,
}: {
  task: DailyTask;
  onToggle: (taskId: string, completed: boolean) => void;
  onUpdate: (taskId: string, field: "title" | "time_slot", value: string) => void;
  onAskAI: (task: DailyTask) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [timeDraft, setTimeDraft] = useState(task.time_slot || "");

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, "title", trimmed);
    } else {
      setTitleDraft(task.title);
    }
  };

  const commitTime = () => {
    setEditingTime(false);
    const trimmed = timeDraft.trim();
    if (trimmed !== (task.time_slot || "")) {
      onUpdate(task.id, "time_slot", trimmed);
    } else {
      setTimeDraft(task.time_slot || "");
    }
  };

  return (
    <div className="group/item px-4 py-3 hover:bg-[#F7F5F1]/60 transition-colors relative">
      {/* Time slot */}
      {editingTime ? (
        <input
          autoFocus
          value={timeDraft}
          onChange={(e) => setTimeDraft(e.target.value)}
          onBlur={commitTime}
          onKeyDown={(e) => { if (e.key === "Enter") commitTime(); if (e.key === "Escape") { setTimeDraft(task.time_slot || ""); setEditingTime(false); } }}
          className="text-[10px] text-[#8C939B] bg-white border border-[#4C7CF0]/40 rounded px-1 py-0.5 outline-none w-full mb-1"
        />
      ) : (
        task.time_slot && (
          <p
            className="text-[10px] text-[#8C939B] mb-1 cursor-text"
            onDoubleClick={() => setEditingTime(true)}
          >
            {task.time_slot}
          </p>
        )
      )}

      {/* Title row */}
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggle(task.id, task.completed)}
          className="shrink-0 mt-0.5"
        >
          {task.completed ? (
            <CheckCircle2 className="h-4 w-4 text-[#4D8B6A] fill-[#4D8B6A] stroke-white" />
          ) : (
            <Circle className="h-4 w-4 text-[#C4BFB6] group-hover/item:text-[#4C7CF0] transition-colors" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); } }}
              className="text-xs text-[#1E2227] bg-white border border-[#4C7CF0]/40 rounded px-1 py-0.5 outline-none w-full"
            />
          ) : (
            <p
              className={`text-xs leading-snug cursor-text ${
                task.completed
                  ? "text-[#C4BFB6] line-through"
                  : "text-[#1E2227]"
              }`}
              onDoubleClick={() => setEditingTitle(true)}
            >
              {task.title}
            </p>
          )}
        </div>

        {/* AI button — visible on hover */}
        <button
          onClick={(e) => { e.stopPropagation(); onAskAI(task); }}
          className="shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded hover:bg-[#4C7CF0]/10"
          title="Ask AI Coach"
        >
          <MessageSquare className="h-3.5 w-3.5 text-[#4C7CF0]" />
        </button>
      </div>
    </div>
  );
}
