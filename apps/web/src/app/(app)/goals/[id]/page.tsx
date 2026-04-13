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
  Plus,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/db/client";
import type { Goal, Phase, WeeklyPlan, DailyTask, TodoItem } from "@/lib/types/database";
import { getGoalTodos, addTodo, updateTodo, deleteTodo } from "@/lib/db/actions";
import { WeeklyPlanChatPanel } from "@/components/goals/weekly-plan-chat";
import { GoalChatPanel } from "@/components/goals/goal-chat-panel";
import { DeliverablesPanel } from "@/components/goals/deliverables-panel";
import { NotesPanel } from "@/components/goals/notes-panel";
import { getWeekStart, getTodayDayOfWeek } from "@/lib/utils/date";
import { DateTimePicker } from "@/components/todo/date-time-picker";

type RightPanel = "none" | "ai" | "plan-chat" | "deliverables" | "notes";

const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDates(): string[] {
  const weekStart = getWeekStart();
  const monday = new Date(weekStart + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  });
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
  const [goalTodos, setGoalTodos] = useState<TodoItem[]>([]);
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoDeadline, setNewTodoDeadline] = useState("");
  const [newTodoPriority, setNewTodoPriority] = useState<"high" | "medium" | "low">("medium");

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

    // Load goal-specific todos
    try {
      const todos = await getGoalTodos(id);
      setGoalTodos(todos);
    } catch {
      // Non-blocking
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Goal todo handlers
  const handleAddGoalTodo = async () => {
    if (!newTodoText.trim()) return;
    try {
      const todo = await addTodo(
        newTodoText.trim(),
        "Goal",
        newTodoPriority,
        newTodoDeadline || null,
        id
      );
      setGoalTodos(prev => [...prev, todo]);
      setNewTodoText("");
      setNewTodoDeadline("");
      setNewTodoPriority("medium");
      setShowAddTodo(false);
    } catch (err) {
      console.error("Failed to add goal todo:", err);
    }
  };

  const handleUpdateGoalTodo = async (todoId: string, patch: Partial<Pick<TodoItem, "text" | "deadline" | "priority">>) => {
    try {
      await updateTodo(todoId, patch);
      setGoalTodos(prev => prev.map(t => t.id === todoId ? { ...t, ...patch } : t));
    } catch (err) {
      console.error("Failed to update goal todo:", err);
    }
  };

  const handleToggleGoalTodo = async (todoId: string, completed: boolean) => {
    try {
      await updateTodo(todoId, { completed: !completed });
      setGoalTodos(prev =>
        prev.map(t => t.id === todoId ? { ...t, completed: !completed } : t)
      );
    } catch (err) {
      console.error("Failed to toggle goal todo:", err);
    }
  };

  const handleDeleteGoalTodo = async (todoId: string) => {
    try {
      await deleteTodo(todoId);
      setGoalTodos(prev => prev.filter(t => t.id !== todoId));
    } catch (err) {
      console.error("Failed to delete goal todo:", err);
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
        <div className="text-sm text-[#9B948B]">Loading...</div>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="text-center py-24">
        <p className="text-[#6F6A64]">Goal not found</p>
        <button
          onClick={() => router.push("/goals")}
          className="text-sm text-[#7FAEE6] mt-2 hover:underline"
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
        <div>
      {/* Header */}
      <button
        onClick={() => router.push("/goals")}
        className="flex items-center gap-1.5 text-sm text-[#6F6A64] hover:text-[#2B2B2B] transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Goals
      </button>

      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#2B2B2B]">{goal.title}</h1>
            {goal.description && (
              <p className="text-sm text-[#6F6A64] mt-1">{goal.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 border border-[#E7DED2] rounded-lg p-1">
              <button
                onClick={() => togglePanel("ai")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  rightPanel === "ai"
                    ? "bg-[#7FAEE6] text-white"
                    : "text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B]"
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
                    ? "bg-[#7FAEE6] text-white"
                    : "text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B]"
                }`}
                title="Deliverables"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => togglePanel("notes")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  rightPanel === "notes"
                    ? "bg-[#7FAEE6] text-white"
                    : "text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B]"
                }`}
                title="Notes"
              >
                <FileText className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#7FB38A]/10 text-[#7FB38A]">
              {goal.status}
            </span>
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#2B2B2B]">Overall Progress</h2>
          <span className="text-sm font-semibold text-[#2B2B2B]">{progressPct}%</span>
        </div>
        <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
          <div className="h-2 bg-[#E7DED2] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#7FB38A] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-[#9B948B] mt-2">
            {completedTasks} / {totalTasks} tasks completed
          </p>
        </div>
      </div>

      {/* Roadmap */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#2B2B2B]">Roadmap</h2>
          <span className="text-xs text-[#9B948B]">{phases.length} phases</span>
        </div>
        <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {phases.map((phase, idx) => {
            const isSelected = phase.id === selectedPhaseId;
            return (
              <div key={phase.id} className="flex items-center">
                <button
                  onClick={() => setSelectedPhaseId(phase.id)}
                  className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[120px] ${
                    isSelected
                      ? "bg-[#7FAEE6]/8 ring-1 ring-[#7FAEE6]/30"
                      : "hover:bg-[#F1ECE4]"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      phase.status === "completed"
                        ? "bg-[#7FB38A] text-white"
                        : phase.status === "active"
                          ? "bg-[#7FAEE6] text-white"
                          : "bg-[#E7DED2] text-[#9B948B]"
                    }`}
                  >
                    {phase.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span className={`text-[11px] font-medium text-center leading-tight line-clamp-2 ${
                    isSelected ? "text-[#2B2B2B]" : "text-[#9B948B]"
                  }`}>
                    {phase.title.replace(/^Phase \d+:\s*/, "")}
                  </span>
                </button>
                {idx < phases.length - 1 && (
                  <div
                    className={`w-6 h-0.5 shrink-0 ${
                      phase.status === "completed" ? "bg-[#7FB38A]" : "bg-[#E7DED2]"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Selected phase info */}
        {selectedPhase && (
          <div className="mt-4 pt-4 border-t border-[#E7DED2]">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-[#2B2B2B]">{selectedPhase.title}</h3>
                {selectedPhase.description && (
                  <p className="text-sm text-[#6F6A64] mt-1">{selectedPhase.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#9B948B] shrink-0">
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
            <Calendar className="h-4 w-4 text-[#7FAEE6]" />
            <h2 className="text-base font-semibold text-[#2B2B2B]">Weekly Schedule</h2>
          </div>
          {hasTasks ? (
            <button
              onClick={() => setRightPanel("plan-chat")}
              className="flex items-center gap-1.5 text-xs text-[#7FAEE6] font-medium hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </button>
          ) : (
            <button
              onClick={() => setRightPanel("plan-chat")}
              className="flex items-center gap-1.5 text-xs text-[#7FAEE6] font-medium hover:underline"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </button>
          )}
        </div>

        {!hasTasks && (
          <div className="rounded-2xl border border-dashed border-[#DDD3C7] bg-[#FFFDF9] p-12 text-center">
            <Circle className="h-8 w-8 text-[#E7DED2] mx-auto mb-2" />
            <p className="text-sm text-[#9B948B]">No weekly plan yet</p>
            <p className="text-xs text-[#9B948B] mt-1">
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
            {/* Row 2: Fri-Sun + Goal Todos */}
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

            {/* Goal To-Do List — 8th slot */}
            <GoalTodoCard
              todos={goalTodos}
              onToggle={handleToggleGoalTodo}
              onDelete={handleDeleteGoalTodo}
              onUpdate={handleUpdateGoalTodo}
              showAddForm={showAddTodo}
              onShowAddForm={setShowAddTodo}
              newText={newTodoText}
              onNewTextChange={setNewTodoText}
              newDeadline={newTodoDeadline}
              onNewDeadlineChange={setNewTodoDeadline}
              newPriority={newTodoPriority}
              onNewPriorityChange={setNewTodoPriority}
              onAdd={handleAddGoalTodo}
            />
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

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-[#D5847A]",
  medium: "bg-[#D4B06A]",
  low: "bg-[#7FB38A]",
};

function formatDeadlineShort(d: string): string {
  const date = new Date(d);
  const month = date.toLocaleString("en", { month: "short" });
  const day = date.getDate();
  const h = date.getHours();
  const mins = date.getMinutes();
  if (h === 0 && mins === 0) return `${month} ${day}`;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ap = h >= 12 ? "PM" : "AM";
  return `${month} ${day} ${h12}:${String(mins).padStart(2, "0")}${ap}`;
}

function GoalTodoCard({
  todos, onToggle, onDelete, onUpdate,
  showAddForm, onShowAddForm,
  newText, onNewTextChange,
  newDeadline, onNewDeadlineChange,
  newPriority, onNewPriorityChange,
  onAdd,
}: {
  todos: TodoItem[];
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<TodoItem, "text" | "deadline" | "priority">>) => void;
  showAddForm: boolean;
  onShowAddForm: (v: boolean) => void;
  newText: string;
  onNewTextChange: (v: string) => void;
  newDeadline: string;
  onNewDeadlineChange: (v: string) => void;
  newPriority: "high" | "medium" | "low";
  onNewPriorityChange: (v: "high" | "medium" | "low") => void;
  onAdd: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [showNewDeadlinePicker, setShowNewDeadlinePicker] = useState(false);

  return (
    <div className="rounded-xl border border-[#B8D4F0] bg-[#EAF3FD] p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#3B7DD8]">
          Goal To-Dos
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#7FAEE6]">
            {todos.filter(t => t.completed).length}/{todos.length} done
          </span>
          <button
            onClick={() => onShowAddForm(true)}
            className="p-1 rounded-md bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] transition-colors"
            title="Add to-do"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Add form modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => onShowAddForm(false)} />
          <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-[#E7DED2]">
              <h2 className="text-lg font-semibold text-[#2B2B2B]">Add Goal To-Do</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">Task</label>
                <input
                  autoFocus
                  value={newText}
                  onChange={(e) => onNewTextChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newText.trim()) onAdd(); if (e.key === "Escape") onShowAddForm(false); }}
                  placeholder="What needs to be done?"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-[#7FAEE6]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">Deadline <span className="text-[#9B948B] font-normal">(optional)</span></label>
                <div className="relative">
                  <button
                    onClick={() => setShowNewDeadlinePicker(!showNewDeadlinePicker)}
                    className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-left text-[#6F6A64] hover:border-[#7FAEE6] transition-colors"
                  >
                    {newDeadline ? formatDeadlineShort(newDeadline) : "Click to set deadline..."}
                  </button>
                  {showNewDeadlinePicker && (
                    <DateTimePicker
                      value={newDeadline || null}
                      onChange={(iso) => { onNewDeadlineChange(iso); setShowNewDeadlinePicker(false); }}
                      onClose={() => setShowNewDeadlinePicker(false)}
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => onNewPriorityChange(e.target.value as "high" | "medium" | "low")}
                  className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-[#7FAEE6]"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E7DED2]">
              <button
                onClick={() => onShowAddForm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onAdd}
                disabled={!newText.trim()}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] disabled:opacity-40 transition-colors shadow-[0_2px_8px_rgba(127,174,230,0.3)]"
              >
                Add To-Do
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Todo list */}
      <div className="space-y-1 max-h-[240px] overflow-y-auto">
        {todos.length === 0 && !showAddForm && (
          <p className="text-xs text-[#7FAEE6] py-3 text-center">No items yet</p>
        )}
        {todos.map(todo => (
          <div key={todo.id} className="rounded-lg bg-white/60 px-2.5 py-2 group/item">
            {/* Row 1: checkbox + text + delete */}
            <div className="flex items-start gap-2">
              <button
                onClick={() => onToggle(todo.id, todo.completed)}
                className="mt-0.5 shrink-0"
              >
                {todo.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-[#7FB38A]" />
                ) : (
                  <Circle className="h-4 w-4 text-[#B8D4F0]" />
                )}
              </button>
              {editingId === todo.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={() => { if (editText.trim()) onUpdate(todo.id, { text: editText.trim() }); setEditingId(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { if (editText.trim()) onUpdate(todo.id, { text: editText.trim() }); setEditingId(null); }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="text-xs flex-1 bg-[#F6F3EE] border border-[#7FAEE6] rounded px-1.5 py-0.5 outline-none text-[#2B2B2B]"
                />
              ) : (
                <span
                  onDoubleClick={() => { setEditText(todo.text); setEditingId(todo.id); }}
                  className={`text-xs flex-1 cursor-text ${todo.completed ? "line-through text-[#9B948B]" : "text-[#2B2B2B]"}`}
                >
                  {todo.text}
                </span>
              )}
              <button
                onClick={() => onDelete(todo.id)}
                className="opacity-0 group-hover/item:opacity-100 p-0.5 text-[#9B948B] hover:text-[#D5847A] transition-all shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            {/* Row 2: deadline + priority */}
            <div className="mt-1 ml-6 flex items-center gap-2 text-[10px]">
              {editingDeadlineId === todo.id ? (
                <span className="relative inline-block">
                  <span className="text-xs px-1 py-0.5 rounded bg-[#F1ECE4] border border-[#7FAEE6] text-[#6F6A64] inline-block">
                    {todo.deadline ? formatDeadlineShort(todo.deadline) : "Pick date"}
                  </span>
                  <DateTimePicker
                    value={todo.deadline ?? null}
                    onChange={(iso) => { onUpdate(todo.id, { deadline: iso }); setEditingDeadlineId(null); }}
                    onClose={() => setEditingDeadlineId(null)}
                  />
                </span>
              ) : todo.deadline ? (
                <button
                  onClick={() => setEditingDeadlineId(todo.id)}
                  className="text-[#9B948B] hover:opacity-80"
                >
                  📅 {formatDeadlineShort(todo.deadline)}
                </button>
              ) : (
                <button
                  onClick={() => setEditingDeadlineId(todo.id)}
                  className="text-[#B8D4F0] hover:text-[#7FAEE6] transition-colors"
                >
                  + deadline
                </button>
              )}
              <span className="ml-auto" />
              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[todo.priority]}`} />
              <select
                value={todo.priority}
                onChange={(e) => onUpdate(todo.id, { priority: e.target.value as TodoItem["priority"] })}
                className="text-[10px] px-0.5 rounded bg-transparent border-none text-[#9B948B] outline-none cursor-pointer"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        ))}
      </div>
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
      className={`rounded-xl border bg-[#FFFDF9] min-h-[140px] shadow-[0_2px_8px_rgba(30,34,39,0.04)] overflow-hidden ${
        isToday
          ? "border-[#7FAEE6]/40 ring-1 ring-[#7FAEE6]/15"
          : "border-[#E7DED2]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E7DED2]">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${isToday ? "text-[#7FAEE6]" : "text-[#2B2B2B]"}`}>
            {dayName}
            {isToday && <span className="ml-1 text-[11px] font-normal">(Today)</span>}
          </span>
        </div>
        <span className={`text-[11px] ${isToday ? "text-[#7FAEE6]" : "text-[#9B948B]"}`}>{date}</span>
      </div>

      {/* Tasks */}
      {tasks.length === 0 ? (
        <div className="px-4 py-4">
          <p className="text-xs text-[#DDD3C7] italic">No tasks</p>
        </div>
      ) : (
        <div className="divide-y divide-[#E7DED2]">
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
        <div className="px-4 py-2 border-t border-[#E7DED2] bg-[#F6F3EE]/50">
          <span className={`text-[10px] font-medium ${
            completedCount === tasks.length
              ? "text-[#7FB38A]"
              : "text-[#9B948B]"
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
    <div className="group/item px-4 py-3 hover:bg-[#F6F3EE]/60 transition-colors relative">
      {/* Time slot */}
      {editingTime ? (
        <input
          autoFocus
          value={timeDraft}
          onChange={(e) => setTimeDraft(e.target.value)}
          onBlur={commitTime}
          onKeyDown={(e) => { if (e.key === "Enter") commitTime(); if (e.key === "Escape") { setTimeDraft(task.time_slot || ""); setEditingTime(false); } }}
          className="text-[10px] text-[#9B948B] bg-[#FFFDF9] border border-[#7FAEE6]/40 rounded px-1 py-0.5 outline-none w-full mb-1"
        />
      ) : (
        task.time_slot && (
          <p
            className="text-[10px] text-[#9B948B] mb-1 cursor-text"
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
            <CheckCircle2 className="h-4 w-4 text-[#7FB38A] fill-[#7FB38A] stroke-white" />
          ) : (
            <Circle className="h-4 w-4 text-[#9B948B] group-hover/item:text-[#7FAEE6] transition-colors" />
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
              className="text-xs text-[#2B2B2B] bg-[#FFFDF9] border border-[#7FAEE6]/40 rounded px-1 py-0.5 outline-none w-full"
            />
          ) : (
            <p
              className={`text-xs leading-snug cursor-text ${
                task.completed
                  ? "text-[#9B948B] line-through"
                  : "text-[#2B2B2B]"
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
          className="shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity p-1 rounded hover:bg-[#7FAEE6]/10"
          title="Ask AI Coach"
        >
          <MessageSquare className="h-3.5 w-3.5 text-[#7FAEE6]" />
        </button>
      </div>
    </div>
  );
}
