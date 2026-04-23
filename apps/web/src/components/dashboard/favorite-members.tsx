"use client";

import { useState, useEffect } from "react";
import { Plus, Users, Heart } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DEFAULT_AGENTS, ALL_AGENTS, DEFAULT_AGENT_AVATAR } from "@/lib/ai/agent-registry";
import type { AgentConfig } from "@/lib/types/agent";
import { MemberPickerModal } from "./member-picker-modal";

const FAVORITES_KEY = "yoboss_favorite_members";
const HIRED_KEY = "yoboss_hired_agents";

// Default favorites for a user who has never touched the member picker:
// all 4 DEFAULT_AGENTS are pinned so the dashboard feels populated out of
// the box (matches the 4 slots in the member roster).
const DEFAULT_FAVORITE_IDS = DEFAULT_AGENTS.map((a) => a.id);

function loadFavoriteIds(): string[] {
  if (typeof window === "undefined") return DEFAULT_FAVORITE_IDS;
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    // Never-set key: seed with all 4 defaults. A user-set empty array
    // (after explicitly unfavoriting everyone via the heart toggle) is
    // preserved and renders the empty state.
    if (raw === null) return DEFAULT_FAVORITE_IDS;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids : DEFAULT_FAVORITE_IDS;
  } catch { return DEFAULT_FAVORITE_IDS; }
}

function saveFavoriteIds(ids: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

function loadHiredIds(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HIRED_KEY) || "[]"); } catch { return []; }
}

export function DashboardFavoriteMembers() {
  const router = useRouter();
  // Starts empty — the mount effect hydrates from localStorage before the
  // component becomes visible (we gate render on mounted below).
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [hiredIds, setHiredIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setFavoriteIds(loadFavoriteIds());
    setHiredIds(loadHiredIds());
    setMounted(true);
  }, []);

  // Build available agents: defaults + hired
  const defaultIds = new Set(DEFAULT_AGENTS.map(a => a.id));
  const hiredAgents = hiredIds
    .filter(id => !defaultIds.has(id))
    .map(id => ALL_AGENTS.find(a => a.id === id))
    .filter(Boolean) as AgentConfig[];
  const availableAgents = [...DEFAULT_AGENTS, ...hiredAgents];

  const favorites = favoriteIds
    .map(id => availableAgents.find(a => a.id === id))
    .filter(Boolean) as AgentConfig[];

  const handleSave = (ids: string[]) => {
    setFavoriteIds(ids);
    saveFavoriteIds(ids);
    setShowPicker(false);
  };

  // Heart-toggle remove: clicking the filled heart inside a visible card
  // unfavorites that member so the card disappears from the dashboard.
  // Mirrors favorite-workflows.tsx:76 behavior.
  const handleUnfavorite = (agentId: string) => {
    const next = favoriteIds.filter((id) => id !== agentId);
    setFavoriteIds(next);
    saveFavoriteIds(next);
  };

  if (!mounted) return null;

  return (
    <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_4px_16px_rgba(30,34,39,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-[#2B2B2B]">Favorite Members</h2>
          <p className="text-sm text-[#9B948B]">Your go-to team members.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/team/market")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#7FAEE6] text-white text-xs font-semibold hover:bg-[#6A9DDA] active:scale-95 transition-all shadow-[0_2px_8px_rgba(127,174,230,0.25)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Hire new
          </button>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFFDF9] text-[#7FAEE6] border border-[#7FAEE6]/40 text-xs font-semibold hover:bg-[#EAF3FD] active:scale-95 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add existing
          </button>
        </div>
      </div>

      <div className="border-b border-dashed border-[#E7DED2] mb-4" />

      {favorites.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F1ECE4] flex items-center justify-center">
            <Users className="h-5 w-5 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">Add your favorite team members here</p>
          <button
            onClick={() => router.push("/team/market")}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(127,174,230,0.35)]"
          >
            <Plus className="h-4 w-4" />
            Hire your first employee
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {favorites.map(agent => (
            <div
              key={agent.id}
              onClick={() => router.push(`/team/chat/${agent.id}`)}
              className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_4px_16px_rgba(43,43,43,0.04)] hover:shadow-[0_10px_28px_rgba(43,43,43,0.08)] hover:border-[#DDD3C7] transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[#F1ECE4] shrink-0">
                    <Image
                      src={agent.avatar || DEFAULT_AGENT_AVATAR}
                      alt={agent.label}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#2B2B2B] truncate">{agent.label}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-[#9B948B]">
                      {agent.category}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnfavorite(agent.id);
                  }}
                  className="p-1.5 rounded-lg text-[#D5847A] hover:bg-[#D5847A]/10 transition-colors shrink-0"
                  title="Unfavorite"
                  aria-label={`Unfavorite ${agent.label}`}
                >
                  <Heart className="h-3.5 w-3.5 fill-[#D5847A]" />
                </button>
              </div>
            </div>
          ))}

          {/* Add more button */}
          <button
            onClick={() => setShowPicker(true)}
            className="rounded-[18px] border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-5 flex flex-col items-center justify-center gap-2 hover:bg-[#F6F3EE] transition-colors min-h-[80px]"
          >
            <Plus className="h-5 w-5 text-[#9B948B]" />
            <span className="text-xs text-[#9B948B]">Add more</span>
          </button>
        </div>
      )}

      {showPicker && (
        <MemberPickerModal
          availableAgents={availableAgents}
          selectedIds={favoriteIds}
          onSave={handleSave}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
