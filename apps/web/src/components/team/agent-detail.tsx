"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Flame, CheckCircle2, Circle, Clock } from "lucide-react";
import type { AgentConfig } from "@/lib/types/agent";
import { CATEGORY_LABELS } from "@/lib/types/agent";

interface AgentDetailProps {
  agent: AgentConfig;
  isDefault: boolean;
  onFire: () => void;
  onClose: () => void;
}

type Tab = "current" | "history";

export function AgentDetail({ agent, isDefault, onFire, onClose }: AgentDetailProps) {
  const [tab, setTab] = useState<Tab>("current");
  const [confirmFire, setConfirmFire] = useState(false);

  return (
    <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] shadow-[0_8px_24px_rgba(30,34,39,0.05)] overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-[#E7DED2]">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          {agent.avatar ? (
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#F1ECE4] shrink-0">
              <Image
                src={agent.avatar}
                alt={agent.label}
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-xl bg-[#7FAEE6]/10 flex items-center justify-center shrink-0">
              <span className="text-2xl font-semibold text-[#7FAEE6]">
                {agent.label.charAt(0)}
              </span>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-[#2B2B2B]">{agent.label}</h2>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#7FAEE6]/10 text-[#7FAEE6]">
                {CATEGORY_LABELS[agent.category]}
              </span>
            </div>
            <p className="text-sm text-[#6F6A64] mt-1">{agent.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isDefault && (
            confirmFire ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#D5847A]">Confirm?</span>
                <button
                  onClick={() => { onFire(); setConfirmFire(false); }}
                  className="px-3 py-1.5 rounded-lg bg-[#D5847A] text-white text-xs font-medium hover:bg-[#C06E64] transition-colors"
                >
                  Fire
                </button>
                <button
                  onClick={() => setConfirmFire(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#DDD3C7] text-xs text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmFire(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#D5847A] hover:bg-[#D5847A]/5 transition-colors"
              >
                <Flame className="h-3.5 w-3.5" />
                Fire
              </button>
            )
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expertise */}
      <div className="px-6 py-5 border-b border-[#E7DED2]">
        <h3 className="text-sm font-semibold text-[#2B2B2B] mb-3">Expertise</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {agent.expertise.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-[#6F6A64]">
              <CheckCircle2 className="h-4 w-4 text-[#7FB38A] shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Work Tabs */}
      <div className="px-6 pt-4">
        <div className="flex items-center gap-1 border-b border-[#E7DED2]">
          <button
            onClick={() => setTab("current")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "current"
                ? "border-[#7FAEE6] text-[#7FAEE6]"
                : "border-transparent text-[#9B948B] hover:text-[#6F6A64]"
            }`}
          >
            Current Work
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "history"
                ? "border-[#7FAEE6] text-[#7FAEE6]"
                : "border-transparent text-[#9B948B] hover:text-[#6F6A64]"
            }`}
          >
            History
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-6 py-5">
        {tab === "current" ? (
          <div className="text-center py-6">
            <Circle className="h-8 w-8 text-[#E7DED2] mx-auto mb-2" />
            <p className="text-sm text-[#9B948B]">No active tasks</p>
            <p className="text-xs text-[#9B948B] mt-1">
              Start a conversation with {agent.label} to assign work
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <Clock className="h-8 w-8 text-[#E7DED2] mx-auto mb-2" />
            <p className="text-sm text-[#9B948B]">No history yet</p>
            <p className="text-xs text-[#9B948B] mt-1">
              Completed work will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
