"use client";

import { useEffect, useState, useCallback, useRef, useLayoutEffect, Fragment } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  Calendar,
  RefreshCw,
  Flag,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/db/client";
import { useTranslations, useLocale } from "next-intl";
import type { Goal, Phase, WeeklyPlan, DailyTask, PhaseTask } from "@/lib/types/database";
import {
  updateGoal,
  updatePhase,
  getPhaseTasksByGoalId,
  createPhaseTask,
  updatePhaseTask,
  deletePhaseTask,
  deleteTask,
} from "@/lib/db/actions";
import { EditableText } from "@/components/ui/editable-text";
import { GoalChatPanel } from "@/components/goals/goal-chat-panel";
import { GoalWizardPanel } from "@/components/goals/goal-wizard-panel";
import { DeliverablesPanel } from "@/components/goals/deliverables-panel";
import { NotesPanel } from "@/components/goals/notes-panel";
import { getWeekStart, getTodayDayOfWeek } from "@/lib/utils/date";

type RightPanel = "none" | "ai" | "deliverables" | "notes";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

// Pastel band per weekday, mirroring the ToDos Board column-header palette
// so the two boards feel like one design language. Index 0 = Monday.
const DAY_COLORS: { band: string; text: string }[] = [
  { band: "border-[#BFDCC5] bg-[#F4FBF5]", text: "text-[#3F7C4A]" }, // Mon — green
  { band: "border-[#E8D5A4] bg-[#FFF9EA]", text: "text-[#8E6B2E]" }, // Tue — yellow
  { band: "border-[#B9D4E8] bg-[#F2F8FC]", text: "text-[#5E8FCE]" }, // Wed — blue
  { band: "border-[#BFD9CF] bg-[#F2FAF6]", text: "text-[#4F8A77]" }, // Thu — teal-green
  { band: "border-[#D9CFA9] bg-[#FFF9E8]", text: "text-[#7B6A2E]" }, // Fri — tan
  { band: "border-[#D5C8BD] bg-[#F9F5F1]", text: "text-[#7B6A60]" }, // Sat — warm beige
  { band: "border-[#E0B7B4] bg-[#FFF3F1]", text: "text-[#9A615B]" }, // Sun — rose
];

function getWeekDates(): string[] {
  const weekStart = getWeekStart();
  const monday = new Date(weekStart + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  });
}

function getGoalStatusBadge(
  status: string,
  t: (key: string) => string
): { label: string; color: string } {
  if (status === "completed") return { label: t("statusDone"), color: "#08A200" };
  if (status === "archived") return { label: t("statusPaused"), color: "#FE4435" };
  return { label: t("statusInProgress"), color: "#E09226" };
}

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("goals.detail");
  const tList = useTranslations("goals.list");
  const tDays = useTranslations("days.short");
  const locale = useLocale();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<(WeeklyPlan & { daily_tasks: DailyTask[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>("none");
  const [showWeeklyWizard, setShowWeeklyWizard] = useState(false);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  // Roadmap collapse state. When there's no weekly plan we default to a
  // compact roadmap (chips + active phase only) so the "Generate" CTA stays
  // visible above the fold. Toggle reveals the full 2-pane layout.
  const [showAllPhases, setShowAllPhases] = useState(false);
  const [pendingAITask, setPendingAITask] = useState<DailyTask | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(true);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  // Phase milestones (sub-phase markers) — read-only outline shown next
  // to the active phase. Persisted in phase_tasks (legacy table name).
  // Held flat here; UI filters by selectedPhaseId.
  const [phaseTasks, setPhaseTasks] = useState<PhaseTask[]>([]);

  // Tail pointer on the right roadmap card tracks the selected phase's
  // vertical center so it visually "points back" to the source card on
  // the left rail. Only meaningful at lg+ widths (where the layout is
  // side-by-side); below that the rail stacks above the pane.
  const phaseRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const railRef = useRef<HTMLDivElement>(null);
  const [tailTop, setTailTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!selectedPhaseId) return;
    // The 2-pane rail only exists in expanded mode. In compact mode (no
    // weekly plan, toggle off) there's no rail to measure — clear the tail.
    const expanded = (weeklyPlan?.daily_tasks?.length ?? 0) > 0 || showAllPhases;
    if (!expanded) {
      setTailTop(null);
      return;
    }
    const compute = () => {
      const card = phaseRefs.current.get(selectedPhaseId);
      const rail = railRef.current;
      if (!card || !rail) return;
      const railTop = rail.getBoundingClientRect().top;
      const cardRect = card.getBoundingClientRect();
      // Position relative to the rail's top edge (= right card's top edge,
      // since both panes top-align in the grid).
      setTailTop(cardRect.top - railTop + cardRect.height / 2);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [selectedPhaseId, phases, phaseTasks.length, showAllPhases, weeklyPlan?.daily_tasks?.length]);

  const togglePanel = (panel: RightPanel) => {
    setRightPanel((prev) => (prev === panel ? "none" : panel));
    if (panel !== "ai") setPendingAITask(null);
  };

  // Close the Action menu when clicking outside or pressing Escape.
  useEffect(() => {
    if (!actionMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionMenuOpen]);

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
      .order("created_at", { ascending: false })
      .order("sort_order", { referencedTable: "daily_tasks" })
      .limit(1);

    const matchingPlan = (planData && planData.length > 0)
      ? planData[0] as (WeeklyPlan & { daily_tasks: DailyTask[] })
      : undefined;

    setWeeklyPlan(matchingPlan || null);

    // Load all phase tasks for this goal (flat list — UI filters by phase).
    try {
      const tasks = await getPhaseTasksByGoalId(id);
      setPhaseTasks(tasks);
    } catch (err) {
      // Non-blocking — old goals predate phase_tasks; empty list is fine.
      console.error("Failed to load phase tasks:", err);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pick up dashboard "Send to Team" handoff: dashboard navigates here with
  // ?chat=1&taskTitle=…&taskTime=… when the clicked todo belongs to this
  // goal. We open the Team panel and seed a synthetic DailyTask so the
  // chat draft auto-fills like a normal in-page Send to Team click would.
  // One-shot guard avoids re-firing when we strip the params from the URL.
  const dashboardChatHandledRef = useRef(false);
  useEffect(() => {
    if (dashboardChatHandledRef.current) return;
    if (!goal) return;
    if (searchParams.get("chat") !== "1") return;
    dashboardChatHandledRef.current = true;

    const taskTitle = searchParams.get("taskTitle");
    const taskTime = searchParams.get("taskTime");
    if (taskTitle) {
      setPendingAITask({
        id: "__from-dashboard__",
        weekly_plan_id: "",
        day_of_week: 0,
        title: taskTitle,
        description: null,
        time_slot: taskTime,
        time_estimate_minutes: null,
        completed: false,
        completed_at: null,
        sort_order: 0,
      });
    }
    setRightPanel("ai");
    router.replace(`/goals/${id}`, { scroll: false });
  }, [goal, searchParams, router, id]);

  const handleUpdateMilestone = async (taskId: string, title: string) => {
    // Reject empty titles — keeps DB free of blank rows. EditableText already
    // no-ops on unchanged values, so this only fires when the user truly
    // saved an empty string.
    if (!title.trim()) return;
    setPhaseTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title } : t)),
    );
    try {
      await updatePhaseTask(taskId, { title });
    } catch (err) {
      console.error("Failed to update milestone:", err);
    }
  };

  const handleDeleteMilestone = async (taskId: string) => {
    setPhaseTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await deletePhaseTask(taskId);
    } catch (err) {
      console.error("Failed to delete milestone:", err);
    }
  };

  const handleMoveMilestone = async (
    taskId: string,
    direction: "up" | "down",
  ) => {
    const target = phaseTasks.find((t) => t.id === taskId);
    if (!target) return;
    const siblings = phaseTasks
      .filter((t) => t.phase_id === target.phase_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((t) => t.id === taskId);
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= siblings.length) return;
    const neighbor = siblings[neighborIdx];

    const targetSort = target.sort_order;
    const neighborSort = neighbor.sort_order;

    setPhaseTasks((prev) =>
      prev.map((t) => {
        if (t.id === target.id) return { ...t, sort_order: neighborSort };
        if (t.id === neighbor.id) return { ...t, sort_order: targetSort };
        return t;
      }),
    );

    try {
      await Promise.all([
        updatePhaseTask(target.id, { sort_order: neighborSort }),
        updatePhaseTask(neighbor.id, { sort_order: targetSort }),
      ]);
    } catch (err) {
      console.error("Failed to reorder milestones:", err);
    }
  };

  const handleAddMilestone = async (phaseId: string, title: string) => {
    try {
      const created = await createPhaseTask(phaseId, title);
      setPhaseTasks((prev) => [...prev, created]);
    } catch (err) {
      console.error("Failed to create milestone:", err);
    }
  };

  // Inline-edit save handlers. Optimistic local update first so the UI
  // reflects the change instantly, then persist. On failure we log and
  // leave the stale value; a page refresh will re-sync from the DB.
  const handleSaveGoalField = async (field: "title" | "description", next: string) => {
    if (!goal) return;
    const nextValue = field === "description" && !next ? null : next;
    setGoal({ ...goal, [field]: nextValue } as Goal);
    try {
      await updateGoal(goal.id, { [field]: nextValue });
    } catch (err) {
      console.error(`Failed to update goal ${field}:`, err);
    }
  };

  const handleSavePhaseField = async (
    phaseId: string,
    field: "title" | "description",
    next: string
  ) => {
    const nextValue = field === "description" && !next ? null : next;
    setPhases(prev =>
      prev.map(p => (p.id === phaseId ? { ...p, [field]: nextValue } as Phase : p))
    );
    try {
      await updatePhase(phaseId, { [field]: nextValue });
    } catch (err) {
      console.error(`Failed to update phase ${field}:`, err);
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

  const handleDeleteTask = async (taskId: string) => {
    if (weeklyPlan) {
      setWeeklyPlan({
        ...weeklyPlan,
        daily_tasks: weeklyPlan.daily_tasks.filter((t) => t.id !== taskId),
      });
    }
    try {
      await deleteTask(taskId);
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const handleAskAI = (task: DailyTask) => {
    setPendingAITask(task);
    setRightPanel("ai");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-[#9B948B]">{t("loading")}</div>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="text-center py-24">
        <p className="text-[#6F6A64]">{t("notFound")}</p>
        <button
          onClick={() => router.push("/goals")}
          className="text-sm text-[#007AFF] mt-2 hover:underline"
        >
          {t("back")}
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
        {t("back")}
      </button>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-[#2B2B2B]">
                <EditableText
                  value={goal.title}
                  onSave={(next) => handleSaveGoalField("title", next)}
                  placeholder={t("titlePlaceholder")}
                  className="text-2xl font-semibold text-[#2B2B2B]"
                />
              </h1>
              {(() => {
                const status = getGoalStatusBadge(goal.status, tList);
                return (
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: `${status.color}1F`,
                      color: status.color,
                    }}
                  >
                    {status.label}
                  </span>
                );
              })()}
            </div>
            <p className="text-sm text-[#6F6A64] mt-1">
              <EditableText
                value={goal.description || ""}
                onSave={(next) => handleSaveGoalField("description", next)}
                multiline
                placeholder={t("descPlaceholder")}
                emptyHint={t("descEmptyHint")}
                className="text-sm text-[#6F6A64]"
              />
            </p>
          </div>
          {/* Action section. Lives in its own flex column with a fixed
              width so the goal title/description on the left wraps before
              colliding. The dropdown links are flow content (not absolute)
              so the section's height grows with the menu and the progress
              bar below stays clear. */}
          <div ref={actionMenuRef} className="shrink-0 w-48 flex flex-col items-end gap-3">
            <button
              type="button"
              onClick={() => setActionMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#007AFF] text-white text-sm font-semibold hover:bg-[#0066D6] active:scale-95 transition-all shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
            >
              {t("action")}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${actionMenuOpen ? "rotate-180" : ""}`}
              />
            </button>
            {actionMenuOpen && (
              <div className="flex flex-col items-end gap-2.5">
                {([
                  { key: "ai", label: t("menuWorkTeam") },
                  { key: "deliverables", label: t("menuFiles") },
                  { key: "notes", label: t("menuNotes") },
                ] as const).map(({ key, label }) => {
                  const active = rightPanel === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        togglePanel(key);
                        setActionMenuOpen(false);
                      }}
                      className={`text-sm font-semibold underline underline-offset-4 transition-colors whitespace-nowrap ${
                        active
                          ? "text-[#007AFF]"
                          : "text-[#000000]/85 hover:text-[#000000]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hoisted "Generate Weekly Plan" CTA — when no plan exists this is
          the user's next step, so we surface it above the roadmap (instead
          of burying it below) and make it impossible to miss. */}
      {!hasTasks && (
        <div className="mb-6 relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-1 animate-glow-pulse rounded-2xl bg-[#007AFF] opacity-50 blur-xl"
          />
          <div className="relative rounded-2xl border-2 border-[#007AFF] bg-[#FFFDF9] p-8 text-center shadow-[0_8px_28px_rgba(0,122,255,0.18)]">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E6F2FF] text-[#007AFF] text-[11px] font-semibold uppercase tracking-wider mb-3">
              <Sparkles className="h-3 w-3" />
              {t("nextStep")}
            </div>
            <p className="text-base font-semibold text-[#2B2B2B]">{t("generateTitle")}</p>
            <p className="text-xs text-[#9B948B] mt-1 mb-5">
              {t("generateSubtitle")}
            </p>
            <button
              onClick={() => setShowWeeklyWizard(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#007AFF] text-white text-sm font-semibold hover:bg-[#0066D6] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(0,122,255,0.35)]"
            >
              <Sparkles className="h-4 w-4" />
              {t("generateCta")}
            </button>
          </div>
        </div>
      )}

      {/* Overall Progress — only meaningful once a weekly plan exists.
          Percentage sits below the bar (right-aligned) so the open
          Action menu in the page header doesn't overlap it. */}
      {hasTasks && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-[#2B2B2B] mb-4">{t("thisWeek")}</h2>
          <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
            <div className="h-2 bg-[#E7DED2] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#7FB38A] rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-[#9B948B]">
                {t("tasksCompleted", { done: completedTasks, total: totalTasks })}
              </p>
              <span className="text-sm font-semibold text-[#2B2B2B]">{progressPct}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Roadmap — two layouts:
          - Compact (no plan, default): a horizontal stepper of numbered
            chips + just the active/selected phase's milestones. Saves space
            so the "Generate" CTA stays in view.
          - Expanded: original 2-pane (left rail + right detail w/ tail
            pointer). Always used once a plan exists; available via toggle
            otherwise. */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#2B2B2B]">{t("roadmap")}</h2>
          {!hasTasks ? (
            <button
              onClick={() => setShowAllPhases((v) => !v)}
              className="text-xs text-[#007AFF] font-medium hover:underline"
            >
              {showAllPhases ? "Show current phase only" : `Show all ${phases.length} phases`}
            </button>
          ) : (
            <span className="text-xs text-[#9B948B]">{phases.length} phases</span>
          )}
        </div>

        {!hasTasks && !showAllPhases ? (
          <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
            <div className="flex items-center pb-5 px-1">
              {phases.map((phase, idx) => {
                const color = PHASE_COLORS[idx % PHASE_COLORS.length];
                const isSelected = phase.id === selectedPhaseId;
                const isActive = phase.status === "active";
                const isCompleted = phase.status === "completed";
                return (
                  <Fragment key={phase.id}>
                    {idx > 0 && (
                      <div className="h-px flex-1 bg-[#E7DED2] mx-1.5" />
                    )}
                    <button
                      onClick={() => setSelectedPhaseId(phase.id)}
                      className="relative flex flex-col items-center transition-transform active:scale-95"
                      title={phase.title.replace(/^Phase \d+:\s*/, "")}
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                          isSelected
                            ? "text-white scale-110 shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
                            : "text-[#6F6A64] hover:scale-105"
                        }`}
                        style={{
                          backgroundColor: isSelected ? color.bg : `${color.bg}22`,
                        }}
                      >
                        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </div>
                      {isActive && (
                        <span className="absolute -bottom-4 text-[10px] font-semibold text-[#7FB38A] whitespace-nowrap">
                          Now
                        </span>
                      )}
                    </button>
                  </Fragment>
                );
              })}
            </div>

            {selectedPhase && (
              <div className="border-t border-[#E7DED2] pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
                        Phase {phases.findIndex((p) => p.id === selectedPhase.id) + 1} of {phases.length}
                      </span>
                      {selectedPhase.status === "active" && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#7FB38A]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#7FB38A]" />
                          You are here
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold text-[#2B2B2B]">
                      <EditableText
                        value={selectedPhase.title}
                        onSave={(next) => handleSavePhaseField(selectedPhase.id, "title", next)}
                        placeholder={t("phaseTitlePlaceholder")}
                        className="text-base font-semibold text-[#2B2B2B]"
                      />
                    </h3>
                    <p className="mt-1 text-sm text-[#6F6A64]">
                      <EditableText
                        value={selectedPhase.description || ""}
                        onSave={(next) => handleSavePhaseField(selectedPhase.id, "description", next)}
                        multiline
                        placeholder={t("phaseDescPlaceholder")}
                        emptyHint="Double-click to add a description…"
                        className="text-sm text-[#6F6A64]"
                      />
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-xs text-[#9B948B]">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedPhase.estimated_weeks} week{selectedPhase.estimated_weeks !== 1 ? "s" : ""}
                  </div>
                </div>

                <PhaseMilestoneList
                  milestones={phaseTasks
                    .filter((t) => t.phase_id === selectedPhase.id)
                    .sort((a, b) => a.sort_order - b.sort_order)}
                  onUpdate={handleUpdateMilestone}
                  onDelete={handleDeleteMilestone}
                  onMove={handleMoveMilestone}
                  onAdd={(title) => handleAddMilestone(selectedPhase.id, title)}
                />
              </div>
            )}
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(260px,340px)_1fr]">
          {/* Left rail card */}
          <div
            ref={railRef}
            className="space-y-2.5 rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-3 shadow-[0_2px_8px_rgba(30,34,39,0.04)]"
          >
            {phases.map((phase, idx) => {
              const color = PHASE_COLORS[idx % PHASE_COLORS.length];
              const isSelected = phase.id === selectedPhaseId;
              const isActive = phase.status === "active";
              const isCompleted = phase.status === "completed";
              return (
                <button
                  key={phase.id}
                  ref={(el) => {
                    if (el) phaseRefs.current.set(phase.id, el);
                    else phaseRefs.current.delete(phase.id);
                  }}
                  onClick={() => setSelectedPhaseId(phase.id)}
                  className={`flex w-full gap-3 rounded-xl border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-[#007AFF] bg-[#F8FBFF] shadow-[0_2px_10px_rgba(0,122,255,0.18)]"
                      : "border-[#E7DED2] bg-[#FFFDF9] hover:border-[#DDD3C7] hover:bg-[#F8F5EF]"
                  }`}
                >
                  {/* Colored number badge */}
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold text-white"
                    style={{ backgroundColor: color.bg }}
                  >
                    {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : idx + 1}
                  </div>
                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-[#2B2B2B]">
                      {phase.title.replace(/^Phase \d+:\s*/, "")}
                    </p>
                    {phase.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[#6F6A64]">
                        {phase.description}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#9B948B]">
                      <Clock className="h-3 w-3" />
                      {phase.estimated_weeks} week{phase.estimated_weeks !== 1 ? "s" : ""}
                      {isActive && (
                        <span className="font-semibold text-[#007AFF]">· You are here</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right pane card */}
          <div className="relative min-w-0 rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
            {/* Tail pointer — diamond rotated 45°, only the bottom-left
                edges are visible to form a left-pointing triangle that
                "punches through" the card's left border at the same Y as
                the selected phase. lg+ only. */}
            {tailTop !== null && (
              <div
                aria-hidden
                className="pointer-events-none absolute hidden lg:block"
                style={{ top: `${tailTop - 8}px`, left: "-8px" }}
              >
                <div className="h-4 w-4 rotate-45 border-b border-l border-[#E7DED2] bg-[#FFFDF9]" />
              </div>
            )}

            {selectedPhase ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-[#2B2B2B]">
                      <EditableText
                        value={selectedPhase.title}
                        onSave={(next) => handleSavePhaseField(selectedPhase.id, "title", next)}
                        placeholder={t("phaseTitlePlaceholder")}
                        className="text-base font-semibold text-[#2B2B2B]"
                      />
                    </h3>
                    <p className="mt-1 text-sm text-[#6F6A64]">
                      <EditableText
                        value={selectedPhase.description || ""}
                        onSave={(next) => handleSavePhaseField(selectedPhase.id, "description", next)}
                        multiline
                        placeholder={t("phaseDescPlaceholder")}
                        emptyHint="Double-click to add a description…"
                        className="text-sm text-[#6F6A64]"
                      />
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-xs text-[#9B948B]">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedPhase.estimated_weeks} week{selectedPhase.estimated_weeks !== 1 ? "s" : ""}
                  </div>
                </div>

                <PhaseMilestoneList
                  milestones={phaseTasks
                    .filter((t) => t.phase_id === selectedPhase.id)
                    .sort((a, b) => a.sort_order - b.sort_order)}
                  onUpdate={handleUpdateMilestone}
                  onDelete={handleDeleteMilestone}
                  onMove={handleMoveMilestone}
                  onAdd={(title) => handleAddMilestone(selectedPhase.id, title)}
                />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-[#DDD3C7] bg-[#F6F3EE] px-4 py-10 text-center text-sm text-[#9B948B]">
                Select a phase on the left to see its milestones.
              </div>
            )}
          </div>
        </div>
        )}
      </div>{/* end Roadmap section */}

      {/* Weekly Schedule — only renders once a plan exists. The pre-plan
          CTA lives at the top of the page (hoisted), so this section
          disappears entirely until generation. */}
      {hasTasks && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#007AFF]" />
              <h2 className="text-base font-semibold text-[#2B2B2B]">{t("weeklySchedule")}</h2>
            </div>
            <button
              onClick={() => setShowWeeklyWizard(true)}
              className="flex items-center gap-1.5 text-xs text-[#007AFF] font-medium hover:underline"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </button>
          </div>

          {/* CSS-columns masonry: days flow Mon→Sun top-to-bottom in column 1,
              then continue into column 2 on lg+ screens. Each DayCard sets
              `break-inside-avoid` on its outer frame so a day never splits
              across columns. Heights auto-balance between columns, so sparse
              days don't leave empty space below them. */}
          <div className="columns-1 lg:columns-2 gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => (
              <DayCard
                key={dayIdx}
                dayName={tDays(DAY_KEYS[dayIdx])}
                dayIndex={dayIdx}
                date={weekDates[dayIdx]}
                tasks={tasksByDay[dayIdx] || []}
                isToday={dayIdx === todayIdx}
                onToggleTask={handleToggleTask}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onAskAI={handleAskAI}
              />
            ))}
          </div>
        </div>
      )}

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
              milestones: phaseTasks
                .filter((t) => t.phase_id === p.id)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((t) => t.title),
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

      {showWeeklyWizard && goal && (activePhase || phases[0]) && (
        <GoalWizardPanel
          intent="weekly-planning"
          goalId={id}
          goal={{ title: goal.title, description: goal.description || "" }}
          phase={{
            id: (activePhase || phases[0]).id,
            title: (activePhase || phases[0]).title,
            description: (activePhase || phases[0]).description || "",
            estimatedWeeks: (activePhase || phases[0]).estimated_weeks || 4,
          }}
          phaseMilestones={phaseTasks
            .filter((t) => t.phase_id === (activePhase || phases[0]).id)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((t) => t.title)}
          roadmap={[...phases]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((p) => ({
              title: p.title,
              description: p.description || "",
              estimated_weeks: p.estimated_weeks || 0,
            }))}
          onClose={() => setShowWeeklyWizard(false)}
          onWeeklyPlanSaved={() => {
            setShowWeeklyWizard(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// Per-phase color used by the roadmap left rail. Cycles by index so any
// number of phases gets a distinct hue without hand-coding per name.
const PHASE_COLORS: { bg: string }[] = [
  { bg: "#007AFF" }, // blue
  { bg: "#C9A968" }, // gold
  { bg: "#9CC4A4" }, // green
  { bg: "#9B6B5C" }, // brown
  { bg: "#7FB3B3" }, // teal
  { bg: "#B58FA0" }, // mauve
];

// Editable per-phase milestones. The Flag-icon outline doubles as the
// canonical sub-phase markers AND as user-editable refinement: hover any
// row to reveal ↑/↓/✕; double-click the title to rename via EditableText;
// the bottom "+ Add milestone" button toggles into an inline input row.
function PhaseMilestoneList({
  milestones,
  onUpdate,
  onDelete,
  onMove,
  onAdd,
}: {
  milestones: import("@/lib/types/database").PhaseTask[];
  onUpdate: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onAdd: (title: string) => void;
}) {
  const t = useTranslations("goals.detail");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commitAdd = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onAdd(trimmed);
      setDraft("");
      // Stay in adding mode after a successful Enter so the user can
      // chain-add several milestones in a row.
    }
  };

  const cancelAdd = () => {
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
        Milestones ({milestones.length})
      </p>

      {milestones.length > 0 && (
        <div className="space-y-1">
          {milestones.map((m, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === milestones.length - 1;
            return (
              <div
                key={m.id}
                className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[#F8F5EF]"
              >
                <Flag className="mt-1 h-4 w-4 shrink-0 text-[#007AFF]" />
                <div className="min-w-0 flex-1">
                  <EditableText
                    value={m.title}
                    onSave={(next) => onUpdate(m.id, next)}
                    placeholder={t("milestoneTitlePlaceholder")}
                    className="text-sm text-[#2B2B2B]"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onMove(m.id, "up")}
                    disabled={isFirst}
                    title={t("moveUp")}
                    className="rounded p-1 text-[#9B948B] hover:bg-[#E7DED2] hover:text-[#2B2B2B] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#9B948B]"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(m.id, "down")}
                    disabled={isLast}
                    title={t("moveDown")}
                    className="rounded p-1 text-[#9B948B] hover:bg-[#E7DED2] hover:text-[#2B2B2B] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#9B948B]"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(m.id)}
                    title={t("deleteTitle")}
                    className="rounded p-1 text-[#9B948B] hover:bg-[#E7DED2] hover:text-[#D5847A]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
          <Flag className="mt-1 h-4 w-4 shrink-0 text-[#007AFF]" />
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitAdd();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelAdd();
              }
            }}
            onBlur={() => {
              if (draft.trim()) {
                commitAdd();
              }
              setAdding(false);
              setDraft("");
            }}
            placeholder={t("newMilestonePlaceholder")}
            className="min-w-0 flex-1 rounded-md border border-[#007AFF] bg-[#FFFDF9] px-2 py-1 text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/30"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#9B948B] hover:bg-[#F8F5EF] hover:text-[#2B2B2B]"
        >
          <Plus className="h-4 w-4" />
          Add milestone
        </button>
      )}
    </div>
  );
}

function DayCard({
  dayName,
  dayIndex,
  date,
  tasks,
  isToday,
  onToggleTask,
  onUpdateTask,
  onDeleteTask,
  onAskAI,
}: {
  dayName: string;
  dayIndex: number;
  date: string;
  tasks: DailyTask[];
  isToday: boolean;
  onToggleTask: (taskId: string, completed: boolean) => void;
  onUpdateTask: (taskId: string, field: "title" | "time_slot", value: string) => void;
  onDeleteTask: (taskId: string) => void;
  onAskAI: (task: DailyTask) => void;
}) {
  const completedCount = tasks.filter((t) => t.completed).length;
  const color = DAY_COLORS[dayIndex] ?? DAY_COLORS[0];
  const allDone = tasks.length > 0 && completedCount === tasks.length;

  return (
    <div className="break-inside-avoid mb-3 rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-2.5 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
      <div className="flex flex-col gap-2">
      {/* Pastel header band — mirrors ToDos column-header pill. Today is
          marked by a bold "(Today)" suffix instead of a blue ring so the
          per-day color stays visually unambiguous. */}
      <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${color.band}`}>
        <span className={`text-sm font-semibold ${color.text}`}>
          {dayName}
          {isToday && <span className="ml-1 text-[11px]">(Today)</span>}
        </span>
        <span className={`flex items-center gap-2 text-[11px] ${color.text}`}>
          <span className="opacity-70">{date}</span>
          {tasks.length > 0 && (
            <span className={`font-semibold tabular-nums ${allDone ? "text-[#7FB38A]" : ""}`}>
              {completedCount}/{tasks.length}
            </span>
          )}
        </span>
      </div>

      {/* Body: dashed empty state, otherwise vertical stack of mini-cards. */}
      {tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#DDD3C7] bg-[#F6F3EE]/40 px-3 py-6 text-center text-xs text-[#9B948B]">
          No tasks
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={onToggleTask}
              onUpdate={onUpdateTask}
              onDelete={onDeleteTask}
              onAskAI={onAskAI}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function TaskItem({
  task,
  onToggle,
  onUpdate,
  onDelete,
  onAskAI,
}: {
  task: DailyTask;
  onToggle: (taskId: string, completed: boolean) => void;
  onUpdate: (taskId: string, field: "title" | "time_slot", value: string) => void;
  onDelete: (taskId: string) => void;
  onAskAI: (task: DailyTask) => void;
}) {
  const t = useTranslations("goals.detail");
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
    <div className="group/item rounded-lg border border-[#E7DED2] bg-[#FFFDF9] px-3 py-2 hover:border-[#DDD3C7] transition-colors">
      {/* Single-row layout: checkbox · time · title · ▶ · ✕. Title gets
          flex-1 + min-w-0 so it's the only element that wraps when long;
          everything else stays on the first line, with action buttons
          top-aligned via items-start. */}
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => onToggle(task.id, task.completed)}
          className="shrink-0 mt-0.5"
        >
          {task.completed ? (
            <CheckCircle2 className="h-4 w-4 text-[#7FB38A] fill-[#7FB38A] stroke-white" />
          ) : (
            <Circle className="h-4 w-4 text-[#9B948B] group-hover/item:text-[#007AFF] transition-colors" />
          )}
        </button>

        {/* Time slot — inline, only renders when present. */}
        {editingTime ? (
          <input
            autoFocus
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            onBlur={commitTime}
            onKeyDown={(e) => { if (e.key === "Enter") commitTime(); if (e.key === "Escape") { setTimeDraft(task.time_slot || ""); setEditingTime(false); } }}
            className="shrink-0 w-32 text-sm text-[#9B948B] bg-[#FFFDF9] border border-[#007AFF]/40 rounded px-1 py-0.5 outline-none"
          />
        ) : (
          task.time_slot && (
            <span
              className="shrink-0 text-sm text-[#9B948B] cursor-text whitespace-nowrap"
              onDoubleClick={() => setEditingTime(true)}
            >
              {task.time_slot}
            </span>
          )
        )}

        {/* Title — flex-1, wraps within itself when content overflows. */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); } }}
              className="text-sm text-[#2B2B2B] bg-[#FFFDF9] border border-[#007AFF]/40 rounded px-1 py-0.5 outline-none w-full"
            />
          ) : (
            <p
              className={`text-sm leading-snug cursor-text ${
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

        {/* Send to Team — labeled "Start" in primary blue so the
            call-to-action reads at a glance. */}
        <button
          onClick={(e) => { e.stopPropagation(); onAskAI(task); }}
          className="shrink-0 mt-0.5 flex items-center gap-1 text-[#007AFF] hover:text-[#0066D6] text-[13px] font-medium transition-colors"
          title={t("sendToTeam")}
        >
          Start
          <span aria-hidden>▶</span>
        </button>
        {/* Delete — hover-only, since destructive actions don't need to advertise. */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          className="shrink-0 rounded p-1 text-[#9B948B] opacity-0 transition-opacity hover:bg-[#E7DED2] hover:text-[#D5847A] group-hover/item:opacity-100"
          title="Delete"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
