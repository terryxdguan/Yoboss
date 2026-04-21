"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Flag, Clock, X, Trash2, Archive, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/db/client";
import type { Goal, Phase } from "@/lib/types/database";

interface GoalWithPhases extends Goal {
  phases: Phase[];
}

export default function GoalsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<GoalWithPhases[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const loadGoals = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("goals")
      .select("*, phases(*)")
      .order("created_at", { ascending: false });
    setGoals((data || []) as GoalWithPhases[]);
    setLoading(false);
  }, []);

  useEffect(() => { setMounted(true); loadGoals(); }, [loadGoals]);

  const handleArchive = async (goal: GoalWithPhases, e: React.MouseEvent) => {
    e.stopPropagation();
    const supabase = createClient();
    await supabase.from("goals").update({ status: "archived" }).eq("id", goal.id);
    loadGoals();
  };

  const handleDelete = async (goal: GoalWithPhases, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${goal.title}"? This cannot be undone.`)) return;
    const supabase = createClient();
    await supabase.from("goals").delete().eq("id", goal.id);
    loadGoals();
  };

  if (!mounted) return <div className="flex items-center justify-center py-24"><div className="text-sm text-[#9B948B]">Loading...</div></div>;

  const activeGoals = goals.filter(g => g.status !== "archived");
  const archivedGoals = goals.filter(g => g.status === "archived");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-full px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#2B2B2B]">Goals</h1>
            <p className="text-sm text-[#6F6A64] mt-1">Set goals and let your team execute</p>
          </div>
          <div className="flex items-center gap-2">
            {archivedGoals.length > 0 && (
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F1ECE4] transition-colors"
              >
                <Clock className="h-4 w-4" />
                History
              </button>
            )}
            <button
              onClick={() => router.push("/goals/create")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-medium hover:bg-[#6A9DDA] transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Goal
            </button>
          </div>
        </div>

        {/* All Goals */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Flag className="h-4 w-4 text-[#7FAEE6]" />
            <h2 className="text-base font-semibold text-[#2B2B2B]">All Goals</h2>
          </div>

          {!loading && activeGoals.length === 0 && (
            <div className="text-center py-16 bg-[#FFFDF9] rounded-xl border border-dashed border-[#E7DED2]">
              <Flag className="h-8 w-8 text-[#E7DED2] mx-auto mb-3" />
              <p className="text-sm text-[#9B948B] mb-1">No goals yet</p>
              <p className="text-xs text-[#9B948B]">Create your first goal to get started</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeGoals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onClick={() => router.push(`/goals/${goal.id}`)}
                onArchive={(e) => handleArchive(goal, e)}
                onDelete={(e) => handleDelete(goal, e)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* History Modal */}
      {showHistory && (
        <HistoryModal
          goals={archivedGoals}
          onSelect={(id) => { setShowHistory(false); router.push(`/goals/${id}`); }}
          onRestore={async (id) => {
            const supabase = createClient();
            await supabase.from("goals").update({ status: "active" }).eq("id", id);
            loadGoals();
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

/* ---------- GoalCard ---------- */

function GoalCard({
  goal,
  onClick,
  onArchive,
  onDelete,
}: {
  goal: GoalWithPhases;
  onClick: () => void;
  onArchive: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const phases = (goal.phases || []).sort((a, b) => a.sort_order - b.sort_order);
  const totalPhases = phases.length;
  const completedPhases = phases.filter(p => p.status === "completed").length;
  const activePhase = phases.find(p => p.status === "active");
  const progress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;

  const statusConfig = {
    active: { dot: "bg-[#7FB38A]", label: "Active", badge: "bg-[#7FB38A]/10 text-[#7FB38A]" },
    completed: { dot: "bg-[#7FAEE6]", label: "Completed", badge: "bg-[#7FAEE6]/10 text-[#7FAEE6]" },
    archived: { dot: "bg-[#9B948B]", label: "Archived", badge: "bg-[#F1ECE4] text-[#9B948B]" },
  };
  const status = statusConfig[goal.status] || statusConfig.active;

  return (
    <div
      onClick={onClick}
      className="group rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-5 cursor-pointer transition-all hover:shadow-[0_10px_28px_rgba(43,43,43,0.08)] hover:border-[#DDD3C7]"
    >
      {/* Title + Status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-[#2B2B2B] line-clamp-1 flex-1">{goal.title}</h3>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${status.badge}`}>
          {status.label}
        </span>
      </div>

      {/* Description */}
      {goal.description && (
        <p className="text-xs text-[#6F6A64] line-clamp-2 mb-3">{goal.description}</p>
      )}
      {!goal.description && <div className="mb-3" />}

      {/* Phase Progress */}
      {totalPhases > 0 ? (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[#6F6A64]">
              {activePhase
                ? `Phase ${phases.indexOf(activePhase) + 1} of ${totalPhases} — ${activePhase.title}`
                : goal.status === "completed"
                  ? "All phases completed"
                  : `${totalPhases} phases`
              }
            </span>
            <span className="text-[11px] font-medium text-[#2B2B2B]">{progress}%</span>
          </div>
          <div className="h-1.5 bg-[#F1ECE4] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all bg-[#7FB38A]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <span className="text-[11px] text-[#9B948B]">No phases yet</span>
        </div>
      )}

      {/* Footer: date + actions */}
      <div className="flex items-center justify-between pt-2 border-t border-[#F1ECE4]">
        <span className="text-[10px] text-[#9B948B]">
          {new Date(goal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onArchive}
            className="p-1.5 rounded-lg text-[#9B948B] hover:text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
            title="Archive"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-[#9B948B] hover:text-[#D5847A] hover:bg-[#D5847A]/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- History Modal ---------- */

function HistoryModal({
  goals,
  onSelect,
  onRestore,
  onClose,
}: {
  goals: GoalWithPhases[];
  onSelect: (id: string) => void;
  onRestore: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-2xl max-h-[70vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E7DED2]">
          <div>
            <h2 className="text-lg font-semibold text-[#2B2B2B]">Archived Goals</h2>
            <p className="text-sm text-[#6F6A64] mt-0.5">{goals.length} archived goals</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className="flex items-center gap-3 rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-4 hover:border-[#7FAEE6]/30 transition-all"
            >
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onSelect(goal.id)}
              >
                <h3 className="text-sm font-semibold text-[#2B2B2B]">{goal.title}</h3>
                {goal.description && (
                  <p className="text-xs text-[#6F6A64] mt-0.5 line-clamp-1">{goal.description}</p>
                )}
              </div>
              <span className="text-[10px] text-[#9B948B] shrink-0">
                {new Date(goal.created_at).toLocaleDateString()}
              </span>
              <button
                onClick={() => onRestore(goal.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#7FAEE6] hover:bg-[#7FAEE6]/10 transition-colors shrink-0"
                title="Restore to active"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
