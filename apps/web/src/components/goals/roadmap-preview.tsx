"use client";

import { X, Loader2, Calendar, CheckSquare, Clock } from "lucide-react";
import type { GoalPlanData } from "@/lib/types/goal-chat";

interface RoadmapPreviewProps {
  plan: GoalPlanData;
  onConfirm: () => void;
  onEdit: () => void;
  isSaving?: boolean;
  error?: string | null;
}

const PRIORITY_COLORS = {
  high: "#D5847A",
  medium: "#D4B06A",
  low: "#7FB38A",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RoadmapPreview({
  plan,
  onConfirm,
  onEdit,
  isSaving,
  error,
}: RoadmapPreviewProps) {
  // Defensive: Claude can occasionally emit malformed tool_use where phases
  // is not an array (e.g. after an interrupted resume). The hook validates
  // too, but belt-and-suspenders here prevents a hard crash.
  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  const totalTodos = phases.reduce((sum, p) => sum + (p.todos?.length ?? 0), 0);
  const hasSchedule = !!plan.weekly_schedule;
  const hasGoalTodos = plan.goal_todos && plan.goal_todos.length > 0;
  const scheduleTasks = plan.weekly_schedule?.tasks || [];

  // Group schedule tasks by day
  const tasksByDay = new Map<number, typeof scheduleTasks>();
  for (const t of scheduleTasks) {
    const day = tasksByDay.get(t.day_of_week) || [];
    day.push(t);
    tasksByDay.set(t.day_of_week, day);
  }

  const summaryParts: string[] = [];
  if (hasSchedule) summaryParts.push(`${scheduleTasks.length} scheduled tasks`);
  else summaryParts.push(`${phases.length} phases, ${totalTodos} tasks`);
  if (hasGoalTodos) summaryParts.push(`${plan.goal_todos!.length} to-dos`);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[#FFFDF9] rounded-2xl shadow-[0_0_48px_rgba(30,34,39,0.12)] w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[#E7DED2]">
            <div>
              <h2 className="text-xl font-semibold text-[#2B2B2B]">
                {plan.goal_title}
              </h2>
              <p className="text-sm text-[#6F6A64] mt-1">
                {plan.goal_description}
              </p>
              <p className="text-xs text-[#9B948B] mt-2">
                {summaryParts.join(" · ")}
              </p>
            </div>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F1ECE4] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* Weekly Schedule (for short goals) */}
            {hasSchedule && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-[#7FAEE6]" />
                  <h3 className="text-sm font-semibold text-[#2B2B2B]">Weekly Schedule</h3>
                </div>
                {plan.weekly_schedule!.ai_summary && (
                  <p className="text-xs text-[#6F6A64] mb-3">{plan.weekly_schedule!.ai_summary}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {Array.from(tasksByDay.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([dow, tasks]) => (
                      <div key={dow} className="rounded-lg border border-[#E7DED2] bg-white p-3">
                        <p className="text-xs font-semibold text-[#2B2B2B] mb-2">{DAY_NAMES[dow]}</p>
                        <div className="space-y-1.5">
                          {tasks.sort((a, b) => a.sort_order - b.sort_order).map((t, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <Clock className="h-3 w-3 text-[#9B948B] mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-[#2B2B2B] leading-snug">{t.title}</p>
                                <p className="text-[10px] text-[#9B948B]">{t.time_slot}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Goal To-Dos */}
            {hasGoalTodos && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckSquare className="h-4 w-4 text-[#7FAEE6]" />
                  <h3 className="text-sm font-semibold text-[#2B2B2B]">To-Do List</h3>
                </div>
                <div className="space-y-1">
                  {plan.goal_todos!.map((todo, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <span
                        className="shrink-0 w-2 h-2 rounded-full"
                        style={{ backgroundColor: PRIORITY_COLORS[todo.priority] }}
                      />
                      <span className="text-sm text-[#2B2B2B]">{todo.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phase tree (for long goals, or always shown) */}
            {!hasSchedule && (
              <div>
                <div className="space-y-0">
                  {phases.map((phase, phaseIdx) => (
                    <div key={phaseIdx} className="relative">
                      {phaseIdx < phases.length - 1 && (
                        <div className="absolute left-[15px] top-[32px] bottom-0 w-px bg-[#E7DED2]" />
                      )}

                      <div className="flex items-start gap-3 mb-1">
                        <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg bg-[#7FAEE6] text-white text-sm font-semibold">
                          {phaseIdx + 1}
                        </div>
                        <div className="pt-1">
                          <p className="text-sm font-semibold text-[#2B2B2B]">
                            {phase.title}
                          </p>
                          {phase.description && (
                            <p className="text-xs text-[#6F6A64] mt-0.5">
                              {phase.description}
                            </p>
                          )}
                          <span className="inline-block text-[11px] text-[#9B948B] mt-1">
                            {phase.estimated_weeks} week{phase.estimated_weeks !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>

                      <div className="ml-[15px] pl-6 border-l border-[#E7DED2] mb-5">
                        {phase.todos.map((todo, todoIdx) => (
                          <div
                            key={todoIdx}
                            className="flex items-start gap-2.5 py-1.5"
                          >
                            <span className="text-[11px] text-[#9B948B] font-mono shrink-0 w-6 pt-0.5">
                              {phaseIdx + 1}.{todoIdx + 1}
                            </span>
                            <span
                              className="shrink-0 w-2 h-2 rounded-full mt-1.5"
                              style={{
                                backgroundColor: PRIORITY_COLORS[todo.priority],
                              }}
                            />
                            <span className="text-sm text-[#2B2B2B]">
                              {todo.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#E7DED2]">
            {error && (
              <p className="text-sm text-[#D5847A]">{error}</p>
            )}
            {!error && <div />}
            <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              disabled={isSaving}
              className="px-4 py-2.5 text-sm font-medium text-[#6F6A64] hover:text-[#2B2B2B] hover:bg-[#F1ECE4] rounded-lg transition-colors disabled:opacity-50"
            >
              Continue Editing
            </button>
            <button
              onClick={onConfirm}
              disabled={isSaving}
              className="flex items-center gap-2 bg-[#7FAEE6] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#6A9DDA] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSaving ? "Creating..." : "Confirm & Create Plan"}
            </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
