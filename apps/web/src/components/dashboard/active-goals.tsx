"use client";

import { useRouter } from "next/navigation";
import { Plus, Flag, Clock, ArrowRight } from "lucide-react";
import type { GoalWithPhases } from "@/lib/types/database";

interface Props {
  goals: GoalWithPhases[];
}

export function DashboardActiveGoals({ goals }: Props) {
  const router = useRouter();
  const activeGoals = goals.filter((g) => g.status !== "archived");

  // ?new=1 makes the goals page auto-open the New Goal wizard so the
  // user lands one click closer to actually creating a goal.
  const goCreate = () => router.push("/goals?new=1");

  return (
    <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_4px_16px_rgba(30,34,39,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-[#2B2B2B]">Active Goals</h2>
          <p className="text-sm text-[#9B948B]">All your active goals — quick access to each.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#7FAEE6] text-white text-xs font-semibold hover:bg-[#6A9DDA] active:scale-95 transition-all shadow-[0_2px_8px_rgba(127,174,230,0.25)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create new
          </button>
          <button
            onClick={() => router.push("/goals")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFFDF9] text-[#7FAEE6] border border-[#7FAEE6]/40 text-xs font-semibold hover:bg-[#EAF3FD] active:scale-95 transition-all"
          >
            View All
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="border-b border-dashed border-[#E7DED2] mb-4" />

      {activeGoals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F1ECE4] flex items-center justify-center">
            <Flag className="h-5 w-5 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">No active goals yet</p>
          <button
            onClick={goCreate}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(127,174,230,0.35)]"
          >
            <Plus className="h-4 w-4" />
            Create new goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeGoals.map((goal) => {
            const phases = goal.phases || [];
            const currentPhase = phases.find((p) => p.status === "active");
            const completed = phases.filter((p) => p.status === "completed").length;
            const total = phases.length;
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <button
                key={goal.id}
                onClick={() => router.push(`/goals/${goal.id}`)}
                className="text-left rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_4px_12px_rgba(30,34,39,0.04)] hover:shadow-[0_10px_28px_rgba(43,43,43,0.08)] hover:border-[#DDD3C7] transition-all flex flex-col gap-3"
              >
                <div className="flex items-start gap-2">
                  <Flag className="h-4 w-4 text-[#7FAEE6] shrink-0 mt-0.5" />
                  <p className="text-sm font-semibold text-[#2B2B2B] leading-snug">{goal.title}</p>
                </div>

                {goal.description && (
                  <p className="text-xs text-[#6F6A64] leading-relaxed line-clamp-2">
                    {goal.description}
                  </p>
                )}

                {currentPhase && (
                  <div className="flex items-center gap-2 text-xs text-[#6F6A64]">
                    <span className="font-medium text-[#7FAEE6]">Now:</span>
                    <span className="truncate">{currentPhase.title}</span>
                    {currentPhase.estimated_weeks ? (
                      <span className="inline-flex items-center gap-1 text-[#9B948B] shrink-0">
                        <Clock className="h-3 w-3" />
                        {currentPhase.estimated_weeks}w
                      </span>
                    ) : null}
                  </div>
                )}

                {total > 0 && (
                  <div className="flex items-center gap-2 mt-auto pt-1">
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
        </div>
      )}
    </div>
  );
}
