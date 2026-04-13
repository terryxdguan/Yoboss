"use client";

import { useState, useEffect } from "react";
import { Flag, ListChecks, RefreshCw, Users, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { DEFAULT_AGENTS, ALL_AGENTS } from "@/lib/ai/agent-registry";
import type { DashboardStats as DashboardStatsType } from "@/lib/types/database";

interface DashboardStatsProps {
  stats: DashboardStatsType;
}

const HIRED_KEY = "yoboss_hired_agents";

function getTeamCount(): number {
  if (typeof window === "undefined") return DEFAULT_AGENTS.length;
  try {
    const raw = localStorage.getItem(HIRED_KEY);
    const hiredIds: string[] = raw ? JSON.parse(raw) : [];
    const defaultIds = new Set(DEFAULT_AGENTS.map(a => a.id));
    const hiredCount = hiredIds.filter(id => !defaultIds.has(id) && ALL_AGENTS.some(a => a.id === id)).length;
    return DEFAULT_AGENTS.length + hiredCount;
  } catch {
    return DEFAULT_AGENTS.length;
  }
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const [showRuns, setShowRuns] = useState(false);
  const [teamCount, setTeamCount] = useState(DEFAULT_AGENTS.length);

  useEffect(() => {
    setTeamCount(getTeamCount());
  }, []);

  const totalPendingTodos = stats.pendingGoalTodos + stats.pendingPersonalTodos;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Goals */}
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] px-4 py-3.5 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <span className="rounded-lg bg-[#EAF3FD] p-1.5 text-[#7FAEE6]">
              <Flag className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-[#7FB38A] bg-[rgba(77,139,106,0.10)] px-2 py-0.5 rounded-full">
              {stats.goalProgressPercent}% Progress
            </span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#9B948B] font-semibold">
            Goals
          </p>
          <h3 className="text-2xl font-semibold text-[#2B2B2B]">
            {stats.activeGoals}
          </h3>
          <p className="text-xs text-[#6F6A64]">
            Active of {stats.totalGoals} total
          </p>
        </div>

        {/* To-Dos */}
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] px-4 py-3.5 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <span className="rounded-lg bg-[#EAF3FD] p-1.5 text-[#7FAEE6]">
              <ListChecks className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-[#7FAEE6] bg-[#EAF3FD] px-2 py-0.5 rounded-full">
              Pending
            </span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#9B948B] font-semibold">
            To-Dos
          </p>
          <h3 className="text-2xl font-semibold text-[#2B2B2B]">
            {totalPendingTodos}
          </h3>
          <div className="flex items-center gap-3 text-xs text-[#6F6A64]">
            <span>{stats.pendingGoalTodos} from Goals</span>
            <span className="text-[#DDD3C7]">|</span>
            <span>{stats.pendingPersonalTodos} personal</span>
          </div>
        </div>

        {/* Workflows */}
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] px-4 py-3.5 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <span className="rounded-lg bg-[#EAF3FD] p-1.5 text-[#7FAEE6]">
              <RefreshCw className="h-4 w-4" />
            </span>
            <button
              onClick={() => setShowRuns(!showRuns)}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
              style={{
                color: stats.todayRunCount > 0 ? "#7FB38A" : "#6F6A64",
                backgroundColor: stats.todayRunCount > 0 ? "rgba(77,139,106,0.10)" : "#F1ECE4",
              }}
            >
              {stats.todayRunCount} Runs Today
              {stats.todayRunCount > 0 && (
                showRuns ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#9B948B] font-semibold">
            Workflows
          </p>
          <h3 className="text-2xl font-semibold text-[#2B2B2B]">
            {stats.totalWorkflows}
          </h3>
          <p className="text-xs text-[#6F6A64]">Total automations</p>
        </div>

        {/* Team */}
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] px-4 py-3.5 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <span className="rounded-lg bg-[#EAF3FD] p-1.5 text-[#7FAEE6]">
              <Users className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-[#6F6A64] bg-[#F1ECE4] px-2 py-0.5 rounded-full">
              Active
            </span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#9B948B] font-semibold">
            Team
          </p>
          <h3 className="text-2xl font-semibold text-[#2B2B2B]">
            {teamCount}
          </h3>
          <p className="text-xs text-[#6F6A64]">AI members hired</p>
        </div>
      </div>

      {/* Expandable today's workflow runs — max height with scroll */}
      {showRuns && (
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-4 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <h3 className="text-sm font-semibold text-[#2B2B2B] mb-2">Today&apos;s Workflow Runs</h3>
          {stats.todayRuns.length === 0 ? (
            <p className="text-xs text-[#9B948B] py-3 text-center">No runs today</p>
          ) : (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {stats.todayRuns.map((run) => (
                <a
                  key={run.id}
                  href="/workflows"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-[#F6F3EE] transition-colors"
                >
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      run.status === "success" ? "bg-[#7FB38A]" :
                      run.status === "failed" ? "bg-[#D5847A]" :
                      "bg-[#7FAEE6]"
                    }`}
                  />
                  <span className="text-sm font-medium text-[#2B2B2B] flex-1 truncate">
                    {run.workflowName}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-[#9B948B] shrink-0">
                    {run.triggeredBy}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#6F6A64] shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
