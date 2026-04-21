"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  UserPlus,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type { AgentCategory } from "@/lib/types/agent";
import { CATEGORY_LABELS } from "@/lib/types/agent";

const STORAGE_KEY = "yoboss_hired_agents";
const PAGE_SIZE = 20;

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

// Unified color styles
const CATEGORY_STYLE = { bg: "bg-[#F1ECE4]", text: "text-[#6F6A64]", active: "bg-[#7FAEE6]" };

function loadHiredIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHiredIds(ids: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

export default function AgentMarketPage() {
  const router = useRouter();
  const [hiredIds, setHiredIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<"all" | AgentCategory>(
    "all"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setHiredIds(loadHiredIds());
  }, []);

  const defaultIds = DEFAULT_AGENTS.map((a) => a.id);
  const allHiredIds = [...defaultIds, ...hiredIds];

  // Count per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: ALL_AGENTS.length };
    for (const agent of ALL_AGENTS) {
      counts[agent.category] = (counts[agent.category] || 0) + 1;
    }
    return counts;
  }, []);

  const filtered = useMemo(() => {
    return ALL_AGENTS.filter((agent) => {
      if (activeCategory !== "all" && agent.category !== activeCategory)
        return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          agent.label.toLowerCase().includes(q) ||
          agent.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeCategory, searchQuery]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleHire = (agentId: string) => {
    const updated = [...hiredIds, agentId];
    setHiredIds(updated);
    saveHiredIds(updated);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/team")}
          className="flex items-center gap-1.5 text-sm text-[#6F6A64] hover:text-[#2B2B2B] transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Employees
        </button>
        <h1 className="text-2xl font-bold text-[#2B2B2B]">Hire Employees</h1>
        <p className="text-sm text-[#6F6A64] mt-1">
          Hire specialists to join your team
        </p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9B948B]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#FFFDF9] border border-[#E7DED2] rounded-xl outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-transparent placeholder:text-[#9B948B] text-[#2B2B2B]"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat] || 0;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? `${CATEGORY_STYLE.active} text-white`
                    : `${CATEGORY_STYLE.bg} ${CATEGORY_STYLE.text} hover:opacity-80`
                }`}
              >
                {CATEGORY_DISPLAY[cat]}
                <span
                  className={`ml-1.5 ${
                    activeCategory === cat ? "text-white/70" : "opacity-60"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agent Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-[#9B948B]">No agents found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {paged.map((agent) => {
              const isHired = allHiredIds.includes(agent.id);
              return (
                <div
                  key={agent.id}
                  className={`relative rounded-xl border p-4 transition-all group ${
                    isHired
                      ? "border-[#7FB38A]/30 bg-[#7FB38A]/5"
                      : "border-[#E7DED2] bg-[#FFFDF9] hover:border-[#DDD3C7] hover:shadow-[0_4px_12px_rgba(30,34,39,0.06)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-[#2B2B2B] truncate pr-2">
                      {agent.label}
                    </p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${CATEGORY_STYLE.bg} ${CATEGORY_STYLE.text}`}>
                      {CATEGORY_LABELS[agent.category]}
                    </span>
                  </div>

                  <p className="text-xs text-[#4A4540] mb-3">
                    {agent.description}
                  </p>

                  {isHired ? (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#7FB38A]">
                      <Check className="h-3.5 w-3.5" />
                      On your team
                    </div>
                  ) : (
                    <button
                      onClick={() => handleHire(agent.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7FAEE6] text-white text-[11px] font-medium hover:bg-[#6A9DDA] active:scale-[0.97] transition-all"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Hire
                    </button>
                  )}

                  {/* Expertise tooltip on hover — above the card */}
                  <div className="absolute left-0 right-0 bottom-full mb-1 z-20 hidden group-hover:block">
                    <div className="bg-white border border-[#E7DED2] rounded-lg px-4 py-3 shadow-[0_8px_24px_rgba(30,34,39,0.12)]">
                      <p className="text-[11px] font-semibold text-[#2B2B2B] mb-1.5">Expertise</p>
                      <ul className="space-y-1">
                        {agent.expertise.map((skill, i) => (
                          <li key={i} className="text-[11px] text-[#4A4540]">
                            • {skill}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8 mb-4">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      currentPage === page
                        ? "bg-[#7FAEE6] text-white"
                        : "text-[#6F6A64] hover:bg-[#F1ECE4]"
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <span className="text-xs text-[#9B948B] ml-2">
                {filtered.length} agents
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
