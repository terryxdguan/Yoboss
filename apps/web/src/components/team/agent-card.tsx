"use client";

import Image from "next/image";
import type { AgentConfig } from "@/lib/types/agent";
import { DEFAULT_AGENT_AVATAR } from "@/lib/ai/agent-registry";

interface AgentCardProps {
  agent: AgentConfig;
  isSelected: boolean;
  onClick: () => void;
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-3 p-5 rounded-2xl border bg-[#FFFDF9] transition-all hover:shadow-[0_8px_24px_rgba(30,34,39,0.08)] cursor-pointer ${
        isSelected
          ? "border-[#7FAEE6] ring-2 ring-[#7FAEE6]/20 shadow-[0_8px_24px_rgba(30,34,39,0.08)]"
          : "border-[#E7DED2] hover:border-[#DDD3C7]"
      }`}
    >
      {/* Avatar */}
      <div className="w-14 h-14 rounded-full overflow-hidden bg-[#F1ECE4]">
        <Image
          src={agent.avatar || DEFAULT_AGENT_AVATAR}
          alt={agent.label}
          width={56}
          height={56}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Info */}
      <div className="text-center">
        <p className="text-sm font-semibold text-[#2B2B2B]">{agent.label}</p>
      </div>
    </button>
  );
}
