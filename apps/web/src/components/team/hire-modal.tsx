"use client";

import { useState } from "react";
import { X, Search, UserPlus, Check } from "lucide-react";
import { ALL_AGENTS } from "@/lib/ai/agent-registry";
import type { AgentCategory } from "@/lib/types/agent";
import { CATEGORY_LABELS } from "@/lib/types/agent";

interface HireModalProps {
  hiredIds: string[];
  onHire: (agentId: string) => void;
  onClose: () => void;
}

const CATEGORIES: ("all" | AgentCategory)[] = [
  "all",
  "writing",
  "research",
  "finance",
  "sales",
  "hr",
  "legal",
  "service",
  "product",
  "tech",
  "education",
  "media",
  "productivity",
];

const CATEGORY_DISPLAY: Record<string, string> = {
  all: "All",
  ...CATEGORY_LABELS,
};

export function HireModal({ hiredIds, onHire, onClose }: HireModalProps) {
  const [activeCategory, setActiveCategory] = useState<"all" | AgentCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = ALL_AGENTS.filter((agent) => {
    if (activeCategory !== "all" && agent.category !== activeCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        agent.name.toLowerCase().includes(q) ||
        agent.label.toLowerCase().includes(q) ||
        agent.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1E2227]">Agent Market</h2>
            <p className="text-sm text-[#626A73] mt-0.5">
              Hire AI specialists to join your team
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#626A73] hover:bg-[#F1EEE8] hover:text-[#1E2227] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8C939B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agents..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#F7F5F1] border border-[#E6E1D8] rounded-xl outline-none focus:ring-2 focus:ring-[#4C7CF0]/30 focus:border-transparent placeholder:text-[#8C939B] text-[#1E2227]"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="px-6 pb-4">
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? "bg-[#4C7CF0] text-white"
                    : "bg-[#F1EEE8] text-[#626A73] hover:bg-[#E6E1D8]"
                }`}
              >
                {CATEGORY_DISPLAY[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Agent Grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-[#8C939B]">No agents found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((agent) => {
                const isHired = hiredIds.includes(agent.id);
                return (
                  <div
                    key={agent.id}
                    className={`rounded-xl border p-3.5 transition-all ${
                      isHired
                        ? "border-[#4D8B6A]/30 bg-[#4D8B6A]/5"
                        : "border-[#E6E1D8] bg-white hover:border-[#D8D1C6] hover:shadow-[0_4px_12px_rgba(30,34,39,0.06)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-[#1E2227]">{agent.label}</p>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F1EEE8] text-[#8C939B] shrink-0">
                        {CATEGORY_LABELS[agent.category]}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#626A73] mb-3 line-clamp-2">
                      {agent.description}
                    </p>

                    {isHired ? (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#4D8B6A]">
                        <Check className="h-3.5 w-3.5" />
                        On your team
                      </div>
                    ) : (
                      <button
                        onClick={() => onHire(agent.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4C7CF0] text-white text-[11px] font-medium hover:bg-[#3F6FE4] active:scale-[0.97] transition-all"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Hire
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
