"use client";

import { useState } from "react";
import { X, Search, Check } from "lucide-react";
import type { WorkflowSummary } from "@/lib/types/database";

interface WorkflowPickerModalProps {
  workflows: WorkflowSummary[];
  selectedIds: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}

export function WorkflowPickerModal({ workflows, selectedIds, onSave, onClose }: WorkflowPickerModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");

  const filtered = workflows.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg bg-[#FFFDF9] rounded-2xl border border-[#E7DED2] shadow-[0_20px_60px_rgba(30,34,39,0.15)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E7DED2]">
            <h3 className="text-base font-semibold text-[#2B2B2B]">Select Favorite Workflows</h3>
            <button onClick={onClose} className="text-[#9B948B] hover:text-[#2B2B2B] transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-[#E7DED2]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9B948B]" />
              <input
                type="text"
                placeholder="Search workflows..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[#E7DED2] bg-[#F6F3EE] pl-9 pr-4 py-2 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] outline-none focus:border-[#7FAEE6] focus:ring-2 focus:ring-[#7FAEE6]/10"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto px-5 py-3">
            {filtered.length === 0 ? (
              <p className="text-sm text-[#9B948B] text-center py-8">
                {workflows.length === 0 ? "No workflows created yet" : "No matching workflows"}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filtered.map(wf => {
                  const isSelected = selected.has(wf.id);
                  return (
                    <button
                      key={wf.id}
                      onClick={() => toggle(wf.id)}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                        isSelected ? "bg-[#EAF3FD]" : "hover:bg-[#F6F3EE]"
                      }`}
                    >
                      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "border-[#7FAEE6] bg-[#7FAEE6]" : "border-[#E7DED2]"
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2B2B2B] truncate">{wf.name}</p>
                        {wf.description && (
                          <p className="text-[11px] text-[#6F6A64] truncate">{wf.description}</p>
                        )}
                      </div>
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          wf.lastRunStatus === "success" ? "bg-[#7FB38A]" :
                          wf.lastRunStatus === "failed" ? "bg-[#D5847A]" :
                          "bg-[#9B948B]"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-[#E7DED2]">
            <p className="text-xs text-[#9B948B]">{selected.size} selected</p>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#6F6A64] hover:text-[#2B2B2B] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => onSave(Array.from(selected))}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#7FAEE6] hover:bg-[#6B9AD6] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
