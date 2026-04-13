"use client";

import { useState } from "react";
import { X, Search, Check } from "lucide-react";
import type { GoalWithPhases } from "@/lib/types/database";

interface GoalPickerModalProps {
  goals: GoalWithPhases[];
  selectedIds: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}

export function GoalPickerModal({ goals, selectedIds, onSave, onClose }: GoalPickerModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");

  const activeGoals = goals.filter(g => g.status === "active");
  const filtered = activeGoals.filter(g =>
    !search || g.title.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <h2 className="text-lg font-semibold text-[#2B2B2B]">Select Important Goals</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9B948B]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search goals..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#F6F3EE] border border-[#E7DED2] rounded-xl outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 placeholder:text-[#9B948B] text-[#2B2B2B]"
            />
          </div>
        </div>

        {/* Goal list */}
        <div className="flex-1 overflow-y-auto px-6 pb-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-[#9B948B] text-center py-8">No active goals found</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(goal => {
                const isSelected = selected.has(goal.id);
                const phases = goal.phases || [];
                const currentPhase = phases.find(p => p.status === "active");
                const completed = phases.filter(p => p.status === "completed").length;
                const total = phases.length;
                const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

                return (
                  <button
                    key={goal.id}
                    onClick={() => toggle(goal.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      isSelected
                        ? "border-[#7FAEE6] bg-[#EAF3FD]/40"
                        : "border-[#E7DED2] bg-[#FFFDF9] hover:border-[#DDD3C7]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "border-[#7FAEE6] bg-[#7FAEE6]" : "border-[#DDD3C7]"
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2B2B2B]">{goal.title}</p>
                        {currentPhase && (
                          <p className="text-[11px] text-[#6F6A64] mt-0.5">
                            Phase: {currentPhase.title}
                          </p>
                        )}
                        {total > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1.5 rounded-full bg-[#F1ECE4] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#7FAEE6] transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-[#9B948B] shrink-0">{progress}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E7DED2]">
          <span className="text-xs text-[#9B948B]">{selected.size} selected</span>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-[#6F6A64] hover:bg-[#F1ECE4]">
              Cancel
            </button>
            <button
              onClick={() => onSave(Array.from(selected))}
              className="px-5 py-2 rounded-xl text-sm font-medium bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
