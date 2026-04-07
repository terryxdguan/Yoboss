"use client";

import { useState } from "react";
import { Circle, ChevronDown, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type { AgentConfig } from "@/lib/types/agent";

function AgentDashCard({ agent }: { agent: AgentConfig }) {
  const router = useRouter();
  const [showExpertise, setShowExpertise] = useState(false);
  const displayName = agent.id === "general_assistant" ? agent.name : agent.label;
  const subtitle = agent.id === "general_assistant" ? agent.label : agent.category.toUpperCase();

  return (
    <div
      className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_4px_16px_rgba(43,43,43,0.04)] hover:shadow-[0_10px_28px_rgba(43,43,43,0.08)] hover:border-[#DDD3C7] transition-all cursor-pointer"
      onClick={() => router.push(`/team/chat/${agent.id}`)}
    >
      {/* Header: avatar + name */}
      <div className="mb-3 flex items-center gap-3">
        {agent.avatar ? (
          <div className="w-14 h-14 rounded-full overflow-hidden bg-[#F1ECE4] shrink-0">
            <Image
              src={agent.avatar}
              alt={displayName}
              width={56}
              height={56}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#7FAEE6]/10 text-lg font-semibold text-[#7FAEE6] shrink-0">
            {displayName.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#2B2B2B] truncate">{displayName}</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[#9B948B]">{subtitle}</p>
        </div>
      </div>

      {/* Recent tasks */}
      <div className="mb-3">
        <p className="text-[10px] font-medium text-[#9B948B] uppercase tracking-wider mb-1.5">Recent Tasks</p>
        <div className="flex items-center gap-1.5 text-xs text-[#9B948B]">
          <Circle className="h-3 w-3 shrink-0" />
          <span>No active tasks</span>
        </div>
      </div>

      {/* Expertise toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowExpertise(!showExpertise); }}
        className="flex items-center gap-0.5 text-[11px] text-[#7FAEE6] hover:underline"
      >
        Expertise
        {showExpertise ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {showExpertise && (
        <div className="mt-2 flex flex-wrap gap-1">
          {agent.expertise.map((skill, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[#F1ECE4] text-[#6F6A64]"
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardTeam() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-[#2B2B2B]">Team</h2>
        <p className="mt-1 text-sm text-[#6F6A64]">
          Your AI employees — click to chat.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {DEFAULT_AGENTS.map((agent) => (
          <AgentDashCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
