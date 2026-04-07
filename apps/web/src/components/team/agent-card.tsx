"use client";

import Image from "next/image";
import type { AgentConfig } from "@/lib/types/agent";

interface AgentCardProps {
  agent: AgentConfig;
  isSelected: boolean;
  onClick: () => void;
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-3 p-5 rounded-2xl border bg-white transition-all hover:shadow-[0_8px_24px_rgba(30,34,39,0.08)] cursor-pointer ${
        isSelected
          ? "border-[#4C7CF0] ring-2 ring-[#4C7CF0]/20 shadow-[0_8px_24px_rgba(30,34,39,0.08)]"
          : "border-[#E6E1D8] hover:border-[#D8D1C6]"
      }`}
    >
      {/* Avatar */}
      {agent.avatar ? (
        <div className="w-14 h-14 rounded-full overflow-hidden bg-[#F1EEE8]">
          <Image
            src={agent.avatar}
            alt={agent.name}
            width={56}
            height={56}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-14 h-14 rounded-full bg-[#4C7CF0]/10 flex items-center justify-center">
          <span className="text-lg font-semibold text-[#4C7CF0]">
            {agent.name.charAt(0)}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="text-center">
        <p className="text-sm font-semibold text-[#1E2227]">{agent.name}</p>
        <p className="text-[11px] text-[#8C939B] mt-0.5">{agent.label}</p>
      </div>
    </button>
  );
}
