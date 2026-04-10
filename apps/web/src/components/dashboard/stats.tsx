"use client";

import { useState } from "react";
import { BarChart3, Flag, ListChecks, RefreshCw, ChevronDown, ChevronUp, Clock } from "lucide-react";
import type { DashboardStats as DashboardStatsType } from "@/lib/types/database";

interface DashboardStatsProps {
  stats: DashboardStatsType;
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const [showRuns, setShowRuns] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* Overview */}
        <div className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)]">
          <div className="mb-4 flex items-start justify-between">
            <span className="rounded-xl bg-[#EAF3FD] p-2 text-[#7FAEE6]">
              <BarChart3 className="h-5 w-5" />
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#6F6A64] bg-[#F1ECE4]">
              Today
            </span>
          </div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9B948B] font-semibold">
            Overview
          </p>
          <h3 className="mt-1 text-3xl font-semibold text-[#2B2B2B]">
            {stats.taskCompletionRate}%
          </h3>
          <p className="mt-2 text-sm text-[#6F6A64]">Task completion rate</p>
        </div>

        {/* Goals */}
        <div className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)]">
          <div className="mb-4 flex items-start justify-between">
            <span className="rounded-xl bg-[#EAF3FD] p-2 text-[#7FAEE6]">
              <Flag className="h-5 w-5" />
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#7FB38A] bg-[rgba(77,139,106,0.10)]">
              {stats.goalProgressPercent}%
            </span>
          </div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9B948B] font-semibold">
            Goals
          </p>
          <h3 className="mt-1 text-3xl font-semibold text-[#2B2B2B]">
            {stats.activeGoals} / {stats.totalGoals}
          </h3>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#F1ECE4]">
            <div
              className="h-full rounded-full bg-[#7FAEE6] transition-all"
              style={{ width: `${stats.totalGoals > 0 ? Math.round((stats.activeGoals / stats.totalGoals) * 100) : 0}%` }}
            />
          </div>
        </div>

        {/* To-Dos */}
        <div className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)]">
          <div className="mb-4 flex items-start justify-between">
            <span className="rounded-xl bg-[#EAF3FD] p-2 text-[#7FAEE6]">
              <ListChecks className="h-5 w-5" />
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-[#7FAEE6] bg-[#EAF3FD]">
              {stats.pendingTodos} Pending
            </span>
          </div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9B948B] font-semibold">
            To-Dos
          </p>
          <h3 className="mt-1 text-3xl font-semibold text-[#2B2B2B]">
            {stats.pendingTodos}
          </h3>
          <p className="mt-2 text-sm text-[#6F6A64]">
            Completed {stats.completedTodayTodos} today
          </p>
        </div>

        {/* Workflows */}
        <div className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)]">
          <div className="mb-4 flex items-start justify-between">
            <span className="rounded-xl bg-[#EAF3FD] p-2 text-[#7FAEE6]">
              <RefreshCw className="h-5 w-5" />
            </span>
            <button
              onClick={() => setShowRuns(!showRuns)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[#EAF3FD]"
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
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9B948B] font-semibold">
            Workflows
          </p>
          <h3 className="mt-1 text-3xl font-semibold text-[#2B2B2B]">
            {String(stats.totalWorkflows).padStart(2, "0")}
          </h3>
          <p className="mt-2 text-sm text-[#6F6A64]">Total automations</p>
        </div>
      </div>

      {/* Expandable today's workflow runs */}
      {showRuns && (
        <div className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_4px_16px_rgba(30,34,39,0.04)]">
          <h3 className="text-sm font-semibold text-[#2B2B2B] mb-3">Today&apos;s Workflow Runs</h3>
          {stats.todayRuns.length === 0 ? (
            <p className="text-xs text-[#9B948B] py-4 text-center">No runs today</p>
          ) : (
            <div className="space-y-2">
              {stats.todayRuns.map((run) => (
                <a
                  key={run.id}
                  href="/workflows"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[#F6F3EE] transition-colors"
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
