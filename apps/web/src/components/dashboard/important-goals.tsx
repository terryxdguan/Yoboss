"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Flag } from "lucide-react";
import { GoalPickerModal } from "./goal-picker-modal";
import type { GoalWithPhases } from "@/lib/types/database";

const STORAGE_KEY = "yoboss_important_goals";

function loadImportantIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveImportantIds(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

interface Props {
  goals: GoalWithPhases[];
}

export function DashboardImportantGoals({ goals }: Props) {
  const router = useRouter();
  const [importantIds, setImportantIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setImportantIds(loadImportantIds());
    setMounted(true);
  }, []);

  const importantGoals = goals.filter(g => importantIds.includes(g.id));

  const handleSave = (ids: string[]) => {
    setImportantIds(ids);
    saveImportantIds(ids);
    setShowPicker(false);
  };

  if (!mounted) return null;

  return (
    <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_4px_16px_rgba(30,34,39,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-[#2B2B2B]">Important Goals</h2>
          <p className="text-sm text-[#9B948B]">Pin your key goals for quick access.</p>
        </div>
        <button
          onClick={() => setShowPicker(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-dashed border-[#E7DED2] mb-4" />

      {importantGoals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F1ECE4] flex items-center justify-center">
            <Flag className="h-5 w-5 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">Pin important goals here for quick tracking</p>
          <button
            onClick={() => setShowPicker(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-[#7FAEE6] bg-[#EAF3FD] hover:bg-[#7FAEE6]/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {importantGoals.map(goal => {
            const phases = goal.phases || [];
            const currentPhase = phases.find(p => p.status === "active");
            const completed = phases.filter(p => p.status === "completed").length;
            const total = phases.length;
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <button
                key={goal.id}
                onClick={() => router.push(`/goals/${goal.id}`)}
                className="text-left rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-4 shadow-[0_4px_12px_rgba(30,34,39,0.04)] hover:shadow-[0_10px_28px_rgba(43,43,43,0.08)] hover:border-[#DDD3C7] transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Flag className="h-3.5 w-3.5 text-[#7FAEE6] shrink-0" />
                  <p className="text-sm font-semibold text-[#2B2B2B] truncate">
                    {goal.title}
                  </p>
                </div>

                {currentPhase && (
                  <p className="text-xs text-[#6F6A64] mb-2">
                    Phase: {currentPhase.title}
                  </p>
                )}

                {total > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[#F1ECE4] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#7FAEE6] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[#9B948B] shrink-0">
                      {completed}/{total} phases
                    </span>
                  </div>
                )}
              </button>
            );
          })}

          {/* Add more */}
          <button
            onClick={() => setShowPicker(true)}
            className="rounded-xl border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-4 flex flex-col items-center justify-center gap-2 hover:bg-[#F6F3EE] transition-colors min-h-[100px]"
          >
            <Plus className="h-5 w-5 text-[#9B948B]" />
            <span className="text-xs text-[#9B948B]">Add more</span>
          </button>
        </div>
      )}

      {showPicker && (
        <GoalPickerModal
          goals={goals}
          selectedIds={importantIds}
          onSave={handleSave}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
