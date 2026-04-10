"use client";

import { useState, useEffect } from "react";
import { Plus, Users } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DEFAULT_AGENTS, ALL_AGENTS } from "@/lib/ai/agent-registry";
import type { AgentConfig } from "@/lib/types/agent";
import { MemberPickerModal } from "./member-picker-modal";

const FAVORITES_KEY = "yoboss_favorite_members";
const HIRED_KEY = "yoboss_hired_agents";

function loadFavoriteIds(): string[] {
  if (typeof window === "undefined") return ["general_assistant"];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return ["general_assistant"];
    const ids = JSON.parse(raw);
    return ids.length > 0 ? ids : ["general_assistant"];
  } catch { return ["general_assistant"]; }
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
  const [favoriteIds, setFavoriteIds] = useState<string[]>(["general_assistant"]);
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

  if (!mounted) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#2B2B2B]">Favorite Members</h2>
          <p className="mt-1 text-sm text-[#6F6A64]">Your go-to AI team members.</p>
        </div>
        <button
          onClick={() => setShowPicker(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F1ECE4] flex items-center justify-center">
            <Users className="h-5 w-5 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">Add your favorite team members here</p>
          <button
            onClick={() => setShowPicker(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-[#7FAEE6] bg-[#EAF3FD] hover:bg-[#7FAEE6]/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Member
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
              <div className="flex items-center gap-3">
                {agent.avatar ? (
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[#F1ECE4] shrink-0">
                    <Image
                      src={agent.avatar}
                      alt={agent.label}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7FAEE6]/10 text-base font-semibold text-[#7FAEE6] shrink-0">
                    {agent.label.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#2B2B2B] truncate">{agent.label}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#9B948B]">
                    {agent.category}
                  </p>
                </div>
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
