"use client";

import { Calendar, Check, Pencil } from "lucide-react";
import type { WeeklyPlanData } from "@/lib/types/goal-chat";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PlanPreviewModal({
  plan,
  onConfirm,
  onEdit,
  isSaving,
}: {
  plan: WeeklyPlanData;
  onConfirm: () => void;
  onEdit: () => void;
  isSaving: boolean;
}) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const tasksByDay: Record<number, WeeklyPlanData["tasks"]> = {};
  for (const task of tasks) {
    if (!tasksByDay[task.day_of_week]) tasksByDay[task.day_of_week] = [];
    tasksByDay[task.day_of_week].push(task);
  }

  const totalTasks = tasks.length;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.time_estimate_minutes || 0), 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-[#E7DED2]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#7FAEE6]/10">
              <Calendar className="h-5 w-5 text-[#7FAEE6]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2B2B2B]">Weekly Plan Preview</h2>
              <p className="text-xs text-[#9B948B]">
                {totalTasks} tasks · ~{totalHours}h total
              </p>
            </div>
          </div>
          {plan.ai_summary && (
            <p className="text-sm text-[#6F6A64] leading-relaxed">{plan.ai_summary}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
              const tasks = tasksByDay[dayIdx];
              if (!tasks || tasks.length === 0) return null;
              return (
                <div key={dayIdx} className="bg-[#F6F3EE] rounded-xl p-4 border border-[#E7DED2]/50">
                  <p className="text-sm font-semibold text-[#2B2B2B] mb-2">{DAY_NAMES[dayIdx]}</p>
                  <ul className="space-y-2">
                    {tasks.map((task, i) => (
                      <li key={i} className="text-sm text-[#6F6A64]">
                        <p className="text-[#2B2B2B]">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.time_slot && (
                            <span className="text-[11px] text-[#9B948B]">{task.time_slot}</span>
                          )}
                          {task.time_estimate_minutes && (
                            <span className="text-[11px] text-[#9B948B]">
                              {task.time_estimate_minutes} min
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E7DED2] flex items-center gap-3">
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 bg-[#7FB38A] text-white text-sm font-medium py-3 rounded-xl hover:bg-[#3D7A5A] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isSaving ? "Saving..." : "Looks good, save it!"}
          </button>
          <button
            onClick={onEdit}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 text-sm font-medium py-3 px-5 rounded-xl border border-[#DDD3C7] text-[#6F6A64] hover:bg-[#F1ECE4] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Adjust
          </button>
        </div>
      </div>
    </div>
  );
}
