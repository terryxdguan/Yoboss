"use client";

import { X, Loader2 } from "lucide-react";
import type { GoalPlanData } from "@/lib/types/goal-chat";

interface RoadmapPreviewProps {
  plan: GoalPlanData;
  onConfirm: () => void;
  onEdit: () => void;
  isSaving?: boolean;
  error?: string | null;
}

const PRIORITY_COLORS = {
  high: "#C65B52",
  medium: "#C6923D",
  low: "#4D8B6A",
};

export function RoadmapPreview({
  plan,
  onConfirm,
  onEdit,
  isSaving,
  error,
}: RoadmapPreviewProps) {
  const totalTodos = plan.phases.reduce((sum, p) => sum + p.todos.length, 0);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-[0_0_48px_rgba(30,34,39,0.12)] w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[#E6E1D8]">
            <div>
              <h2 className="text-xl font-semibold text-[#1E2227]">
                {plan.goal_title}
              </h2>
              <p className="text-sm text-[#626A73] mt-1">
                {plan.goal_description}
              </p>
              <p className="text-xs text-[#8C939B] mt-2">
                {plan.phases.length} phases, {totalTodos} tasks
              </p>
            </div>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-[#8C939B] hover:text-[#1E2227] hover:bg-[#F1EEE8] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Phase tree */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-0">
              {plan.phases.map((phase, phaseIdx) => (
                <div key={phaseIdx} className="relative">
                  {/* Vertical line connecting phases */}
                  {phaseIdx < plan.phases.length - 1 && (
                    <div className="absolute left-[15px] top-[32px] bottom-0 w-px bg-[#E6E1D8]" />
                  )}

                  {/* Phase node */}
                  <div className="flex items-start gap-3 mb-1">
                    <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg bg-[#4C7CF0] text-white text-sm font-semibold">
                      {phaseIdx + 1}
                    </div>
                    <div className="pt-1">
                      <p className="text-sm font-semibold text-[#1E2227]">
                        {phase.title}
                      </p>
                      {phase.description && (
                        <p className="text-xs text-[#626A73] mt-0.5">
                          {phase.description}
                        </p>
                      )}
                      <span className="inline-block text-[11px] text-[#8C939B] mt-1">
                        {phase.estimated_weeks} week{phase.estimated_weeks !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Todo nodes */}
                  <div className="ml-[15px] pl-6 border-l border-[#E6E1D8] mb-5">
                    {phase.todos.map((todo, todoIdx) => (
                      <div
                        key={todoIdx}
                        className="flex items-start gap-2.5 py-1.5"
                      >
                        <span className="text-[11px] text-[#8C939B] font-mono shrink-0 w-6 pt-0.5">
                          {phaseIdx + 1}.{todoIdx + 1}
                        </span>
                        <span
                          className="shrink-0 w-2 h-2 rounded-full mt-1.5"
                          style={{
                            backgroundColor: PRIORITY_COLORS[todo.priority],
                          }}
                        />
                        <span className="text-sm text-[#1E2227]">
                          {todo.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#E6E1D8]">
            {error && (
              <p className="text-sm text-[#C65B52]">{error}</p>
            )}
            {!error && <div />}
            <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              disabled={isSaving}
              className="px-4 py-2.5 text-sm font-medium text-[#626A73] hover:text-[#1E2227] hover:bg-[#F1EEE8] rounded-lg transition-colors disabled:opacity-50"
            >
              Continue Editing
            </button>
            <button
              onClick={onConfirm}
              disabled={isSaving}
              className="flex items-center gap-2 bg-[#4C7CF0] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#3F6FE4] active:scale-[0.98] transition-all disabled:opacity-50"
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
