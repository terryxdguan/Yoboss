"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Flame, ChevronDown, ChevronRight, Circle, Clock } from "lucide-react";
import Image from "next/image";
import { DEFAULT_AGENTS, ALL_AGENTS, DEFAULT_AGENT_AVATAR } from "@/lib/ai/agent-registry";
import type { AgentConfig } from "@/lib/types/agent";
import { CATEGORY_LABELS } from "@/lib/types/agent";
// HireModal replaced by /team/market page

const STORAGE_KEY = "yoboss_hired_agents";

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

function AgentRow({
  agent,
  isDefault,
  onFire,
  onChat,
}: {
  agent: AgentConfig;
  isDefault: boolean;
  onFire: () => void;
  onChat: () => void;
}) {
  const [showExpertise, setShowExpertise] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmFire, setConfirmFire] = useState(false);

  return (
    <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] shadow-[0_2px_8px_rgba(30,34,39,0.04)] overflow-hidden">
      <div className="flex items-stretch">
        {/* Avatar — fixed square, object-fit cover */}
        <div
          onClick={onChat}
          className="w-36 shrink-0 bg-[#F1ECE4] relative overflow-hidden cursor-pointer hover:brightness-95 transition-all"
          title={`Chat with ${agent.label}`}
        >
          <Image
            src={agent.avatar || DEFAULT_AGENT_AVATAR}
            alt={agent.label}
            width={200}
            height={200}
            className="w-[115%] h-[115%] object-cover object-center absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 p-4">
          {/* Row 1: Name + badges + fire */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {/* Only show name for the first default agent (Eve) */}
              <h2 className="text-sm font-semibold text-[#2B2B2B]">{agent.label}</h2>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#7FAEE6]/10 text-[#7FAEE6]">
                {CATEGORY_LABELS[agent.category]}
              </span>
            </div>
            {!isDefault && (
              confirmFire ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { onFire(); setConfirmFire(false); }}
                    className="px-2.5 py-1 rounded-lg bg-[#D5847A] text-white text-[11px] font-medium"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmFire(false)}
                    className="px-2.5 py-1 rounded-lg border border-[#DDD3C7] text-[11px] text-[#6F6A64]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmFire(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#D5847A] hover:bg-[#D5847A]/5 transition-colors"
                >
                  <Flame className="h-3 w-3" />
                  Fire
                </button>
              )
            )}
          </div>

          {/* Row 2: Description + expertise toggle */}
          <div className="flex items-start gap-1 mb-3">
            <p className="text-xs text-[#6F6A64] flex-1">{agent.description}</p>
            <button
              onClick={() => setShowExpertise(!showExpertise)}
              className="shrink-0 flex items-center gap-0.5 text-[11px] text-[#7FAEE6] hover:underline mt-0.5"
            >
              Expertise
              {showExpertise ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>

          {/* Expertise — collapsible */}
          {showExpertise && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {agent.expertise.map((item, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-[#F6F3EE] text-[#6F6A64] border border-[#E7DED2]"
                >
                  {item}
                </span>
              ))}
            </div>
          )}

          {/* Row 3: Current task */}
          <div className="flex items-center gap-4 text-[11px] border-t border-[#E7DED2] pt-2">
            <div className="flex items-center gap-1.5 text-[#9B948B]">
              <Circle className="h-3 w-3" />
              <span>Current: </span>
              <span className="text-[#6F6A64]">No active tasks</span>
            </div>

            {/* History — collapsible */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-0.5 text-[#9B948B] hover:text-[#6F6A64] transition-colors"
            >
              <Clock className="h-3 w-3" />
              <span>History</span>
              {showHistory ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>

          {showHistory && (
            <div className="mt-2 pt-2 border-t border-dashed border-[#E7DED2] text-[11px] text-[#9B948B]">
              No history yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const router = useRouter();
  const [hiredIds, setHiredIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setHiredIds(loadHiredIds());
    setMounted(true);
  }, []);

  const defaultIds = DEFAULT_AGENTS.map((a) => a.id);
  const hiredAgents = hiredIds
    .filter((id) => !defaultIds.includes(id))
    .map((id) => ALL_AGENTS.find((a) => a.id === id))
    .filter(Boolean) as AgentConfig[];
  const team = [...DEFAULT_AGENTS, ...hiredAgents];



  const handleFire = (agentId: string) => {
    if (defaultIds.includes(agentId)) return;
    const next = hiredIds.filter((id) => id !== agentId);
    setHiredIds(next);
    saveHiredIds(next);
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-[#9B948B]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#2B2B2B]">Team</h1>
          <p className="text-sm text-[#6F6A64] mt-1">
            Your AI employees — {team.length} members
          </p>
        </div>
        <button
          onClick={() => router.push("/team/market")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-medium hover:bg-[#6A9DDA] active:scale-[0.98] transition-all"
        >
          <Plus className="h-4 w-4" />
          Hire
        </button>
      </div>

      {/* Team List */}
      <div className="space-y-3">
        {team.map((agent) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            isDefault={defaultIds.includes(agent.id)}
            onFire={() => handleFire(agent.id)}
            onChat={() => router.push(`/team/chat/${agent.id}`)}
          />
        ))}
      </div>

    </div>
  );
}
