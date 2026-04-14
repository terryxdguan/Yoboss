"use client";

import { useState } from "react";
import { Play, Clock, Pencil, Trash2, Heart, CalendarClock } from "lucide-react";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import { formatScheduleLabel } from "@/lib/utils/schedule";
import type { Workflow } from "@/lib/types/workflow";

interface WorkflowCardProps {
  workflow: Workflow;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onViewProgress?: () => void;
  onSchedule?: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  compact?: boolean;
}

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

function findAgent(agentId: string) {
  return allAgents.find((a) => a.id === agentId);
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const MAX_VISIBLE_AGENTS = 3;

export function WorkflowCard({
  workflow,
  onRun,
  onEdit,
  onDelete,
  onHistory,
  onViewProgress,
  onSchedule,
  onFavorite,
  isFavorite,
  compact,
}: WorkflowCardProps) {
  const [showAllAgents, setShowAllAgents] = useState(false);

  const agentLabels = workflow.steps.map((step) => {
    const agent = findAgent(step.agentId);
    return agent?.label || step.agentId;
  });
  const visibleLabels = agentLabels.slice(0, MAX_VISIBLE_AGENTS);
  const hiddenCount = agentLabels.length - MAX_VISIBLE_AGENTS;

  return (
    <div className="group bg-[#FFFDF9] rounded-xl border border-[#E7DED2] p-5 transition-all hover:shadow-[0_10px_28px_rgba(43,43,43,0.08)] hover:border-[#DDD3C7]">
      {/* Top row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#2B2B2B] truncate">
            {workflow.name}
          </h3>
          {workflow.description && (
            <p className="text-xs text-[#6F6A64] mt-1 line-clamp-2">
              {workflow.description}
            </p>
          )}
        </div>
      </div>

      {/* Step badges — hidden in compact mode */}
      {!compact && <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <span className="text-[10px] font-medium text-[#9B948B] bg-[#F1ECE4] px-2 py-0.5 rounded-md">
          {workflow.steps.length} step{workflow.steps.length !== 1 ? "s" : ""}
        </span>
        {visibleLabels.map((label, i) => (
          <span
            key={i}
            className="text-[10px] text-[#6F6A64] bg-[#EAF3FD] px-2 py-0.5 rounded-md"
          >
            {label}
          </span>
        ))}
        {hiddenCount > 0 && (
          <span
            className="text-[10px] text-[#7FAEE6] bg-[#EAF3FD] px-2 py-0.5 rounded-md cursor-pointer hover:bg-[#7FAEE6] hover:text-white transition-colors relative"
            onMouseEnter={() => setShowAllAgents(true)}
            onMouseLeave={() => setShowAllAgents(false)}
          >
            +{hiddenCount}
            {showAllAgents && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-[#FFFDF9] border border-[#E7DED2] rounded-lg shadow-[0_8px_24px_rgba(43,43,43,0.12)] p-2 min-w-[140px]">
                {agentLabels.slice(MAX_VISIBLE_AGENTS).map((label, i) => (
                  <div key={i} className="text-[11px] text-[#6F6A64] py-0.5 px-1">
                    {label}
                  </div>
                ))}
              </div>
            )}
          </span>
        )}
      </div>}

      {/* Topic badge */}
      {workflow.topic && (
        <div className="mt-2">
          <span className="text-[10px] text-[#7FB38A] bg-[#7FB38A]/10 px-2 py-0.5 rounded-md">
            Topic: {workflow.topic.length > 40 ? workflow.topic.slice(0, 40) + "..." : workflow.topic}
          </span>
        </div>
      )}

      {/* Status */}
      {workflow.status === "running" ? (
        <button
          onClick={onViewProgress || onHistory}
          className="flex items-center gap-2 mt-3 w-full text-left group/status"
        >
          <span className="relative w-2 h-2 shrink-0">
            <span className="absolute inset-0 rounded-full bg-[#7FAEE6] animate-ping opacity-75" />
            <span className="relative block w-2 h-2 rounded-full bg-[#7FAEE6]" />
          </span>
          <span className="text-[10px] text-[#7FAEE6] font-medium group-hover/status:underline">
            Running — click to view progress
          </span>
        </button>
      ) : workflow.last_run_at ? (
        <div className="flex items-center gap-2 mt-3">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor:
                workflow.last_run_status === "success" ? "#7FB38A" : "#D5847A",
            }}
          />
          <span className="text-[10px] text-[#9B948B]">
            Last run {formatRelativeDate(workflow.last_run_at)}
          </span>
        </div>
      ) : null}

      {workflow.schedule_enabled && workflow.schedule_cron && (
        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-medium text-[#7FAEE6]">
          <CalendarClock className="h-3 w-3" />
          {formatScheduleLabel(workflow.schedule_cron)}
        </div>
      )}

      {/* Actions — unified for all workflows */}
      <div className="flex items-center gap-1 mt-4 pt-3 border-t border-[#E7DED2]">
        <button
          onClick={onRun}
          disabled={workflow.status === "running"}
          className="p-1.5 rounded-lg bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] transition-colors shadow-[0_2px_6px_rgba(127,174,230,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
          title={workflow.status === "running" ? "Running..." : workflow.topic ? "Run" : "Run (will ask for topic)"}
        >
          <Play className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onHistory}
          className="p-1.5 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
          title="History"
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        {onSchedule && (
          <button
            onClick={onSchedule}
            className="p-1.5 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
            title="Schedule"
          >
            <CalendarClock className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {onFavorite && (
          <button
            onClick={onFavorite}
            className={`p-1.5 rounded-lg transition-colors ${
              isFavorite
                ? "text-[#D5847A] hover:bg-[#D5847A]/10"
                : "text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B]"
            }`}
            title={isFavorite ? "Unfavorite" : "Favorite"}
          >
            <Heart className={`h-3.5 w-3.5 ${isFavorite ? "fill-[#D5847A]" : ""}`} />
          </button>
        )}
        <button
          onClick={onDelete}
          className="ml-auto p-1.5 rounded-lg text-[#9B948B] hover:text-[#D5847A] hover:bg-[#D5847A]/10 transition-colors"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
