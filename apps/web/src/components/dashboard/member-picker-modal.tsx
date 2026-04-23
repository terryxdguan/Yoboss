"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Check, Plus } from "lucide-react";
import Image from "next/image";
import type { AgentConfig } from "@/lib/types/agent";
import { DEFAULT_AGENT_AVATAR } from "@/lib/ai/agent-registry";

interface MemberPickerModalProps {
  availableAgents: AgentConfig[];
  selectedIds: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}

export function MemberPickerModal({ availableAgents, selectedIds, onSave, onClose }: MemberPickerModalProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");

  const filtered = availableAgents.filter(a =>
    a.label.toLowerCase().includes(search.toLowerCase()) ||
    a.category.toLowerCase().includes(search.toLowerCase())
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
            <h3 className="text-base font-semibold text-[#2B2B2B]">Select Favorite Members</h3>
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
                placeholder="Search members..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[#E7DED2] bg-[#F6F3EE] pl-9 pr-4 py-2 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] outline-none focus:border-[#7FAEE6] focus:ring-2 focus:ring-[#7FAEE6]/10"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-[320px] overflow-y-auto px-5 py-3">
            {filtered.length === 0 ? (
              availableAgents.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-3">
                  <p className="text-sm text-[#9B948B]">No employees yet — hire one?</p>
                  <button
                    onClick={() => {
                      onClose();
                      router.push("/team/market");
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Hire your first employee
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[#9B948B] text-center py-8">No matching members</p>
              )
            ) : (
              <div className="space-y-1.5">
                {filtered.map(agent => {
                  const isSelected = selected.has(agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => toggle(agent.id)}
                      className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                        isSelected ? "bg-[#EAF3FD]" : "hover:bg-[#F6F3EE]"
                      }`}
                    >
                      <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected ? "border-[#7FAEE6] bg-[#7FAEE6]" : "border-[#E7DED2]"
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-[#F1ECE4] shrink-0">
                        <Image
                          src={agent.avatar || DEFAULT_AGENT_AVATAR}
                          alt={agent.label}
                          width={36}
                          height={36}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2B2B2B] truncate">{agent.label}</p>
                        <p className="text-[10px] uppercase tracking-wider text-[#9B948B]">{agent.category}</p>
                      </div>
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
