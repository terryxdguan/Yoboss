"use client";

import { useState, useEffect } from "react";
import { Plus, Users, ArrowRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DEFAULT_AGENTS, ALL_AGENTS, DEFAULT_AGENT_AVATAR } from "@/lib/ai/agent-registry";
import type { AgentConfig } from "@/lib/types/agent";

const HIRED_KEY = "yoboss_hired_agents";

function loadHiredIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HIRED_KEY) || "[]");
  } catch {
    return [];
  }
}

export function DashboardTeam() {
  const router = useRouter();
  const [hiredIds, setHiredIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setHiredIds(loadHiredIds());
    setMounted(true);
  }, []);

  // Full team = 4 default agents + anything hired from /team/market.
  // The legacy "favorites" filter is gone — this section now mirrors the
  // /team page, so all hired members show up automatically.
  const defaultIdSet = new Set(DEFAULT_AGENTS.map((a) => a.id));
  const hiredAgents = hiredIds
    .filter((id) => !defaultIdSet.has(id))
    .map((id) => ALL_AGENTS.find((a) => a.id === id))
    .filter(Boolean) as AgentConfig[];
  const team = [...DEFAULT_AGENTS, ...hiredAgents];

  if (!mounted) return null;

  return (
    <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_4px_16px_rgba(30,34,39,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-[#2B2B2B]">Team</h2>
          <p className="text-sm text-[#9B948B]">Your team — quick access to chat.</p>
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
            onClick={() => router.push("/team")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFFDF9] text-[#7FAEE6] border border-[#7FAEE6]/40 text-xs font-semibold hover:bg-[#EAF3FD] active:scale-95 transition-all"
          >
            View All
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="border-b border-dashed border-[#E7DED2] mb-4" />

      {team.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F1ECE4] flex items-center justify-center">
            <Users className="h-5 w-5 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">No team members yet</p>
          <button
            onClick={() => router.push("/team/market")}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(127,174,230,0.35)]"
          >
            <Plus className="h-4 w-4" />
            Hire your first team member
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {team.map((agent) => (
            <div
              key={agent.id}
              onClick={() => router.push(`/team/chat/${agent.id}`)}
              className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_4px_16px_rgba(43,43,43,0.04)] hover:shadow-[0_10px_28px_rgba(43,43,43,0.08)] hover:border-[#DDD3C7] transition-all cursor-pointer"
            >
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
