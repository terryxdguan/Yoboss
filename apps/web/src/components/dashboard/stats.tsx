"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Flag, ListChecks, RefreshCw, Users, ChevronDown, ChevronUp, ChevronRight, Clock, Package } from "lucide-react";
import { DEFAULT_AGENTS, ALL_AGENTS } from "@/lib/ai/agent-registry";
import { getWorkflowRunById } from "@/lib/db/actions";
import { WorkflowRunView } from "@/components/workflow/workflow-run-view";
import { DeliverablesModal } from "@/components/workflow/deliverables-panel";
import type { DashboardStats as DashboardStatsType } from "@/lib/types/database";
import type { Workflow, WorkflowRun } from "@/lib/types/workflow";

interface DashboardStatsProps {
  stats: DashboardStatsType;
  workflows: Workflow[];
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

export function DashboardStats({ stats, workflows }: DashboardStatsProps) {
  const t = useTranslations("dashboard.stats");
  const [showRuns, setShowRuns] = useState(false);
  const [teamCount, setTeamCount] = useState(DEFAULT_AGENTS.length);
  const [detailRun, setDetailRun] = useState<{ run: WorkflowRun; workflow: Workflow } | null>(null);
  const [deliverablesRun, setDeliverablesRun] = useState<WorkflowRun | null>(null);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  useEffect(() => {
    setTeamCount(getTeamCount());
  }, []);

  const handleViewDetails = useCallback(async (runId: string, workflowId: string) => {
    setLoadingRunId(runId);
    try {
      const run = await getWorkflowRunById(runId);
      const wf = workflows.find(w => w.id === workflowId);
      if (run && wf) {
        setDetailRun({ run, workflow: wf });
      }
    } catch (err) {
      console.error("Failed to load run:", err);
    } finally {
      setLoadingRunId(null);
    }
  }, [workflows]);

  const handleDeliverables = useCallback(async (runId: string) => {
    setLoadingRunId(runId);
    try {
      const run = await getWorkflowRunById(runId);
      if (run) setDeliverablesRun(run);
    } catch (err) {
      console.error("Failed to load run:", err);
    } finally {
      setLoadingRunId(null);
    }
  }, []);

  const totalPendingTodos = stats.pendingGoalTodos + stats.pendingPersonalTodos;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Goals */}
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFFFF] px-4 py-3.5 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <span className="rounded-lg bg-[#F3ECFB] p-1.5 text-[#7C2DE8]">
              <Flag className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-[#7FB38A] bg-[rgba(77,139,106,0.10)] px-2 py-0.5 rounded-full">
              {t("goalsProgress", { percent: stats.goalProgressPercent })}
            </span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#9B948B] font-semibold">
            {t("goals")}
          </p>
          <h3 className="font-display text-2xl font-bold text-[#1A1829] tracking-[-0.015em]">
            {stats.activeGoals}
          </h3>
          <p className="text-xs text-[#6F6A64]">
            {t("goalsActiveOf", { total: stats.totalGoals })}
          </p>
        </div>

        {/* To-Dos */}
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFFFF] px-4 py-3.5 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <span className="rounded-lg bg-[#F3ECFB] p-1.5 text-[#7C2DE8]">
              <ListChecks className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-[#7C2DE8] bg-[#F3ECFB] px-2 py-0.5 rounded-full">
              {t("todosPending")}
            </span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#9B948B] font-semibold">
            {t("todos")}
          </p>
          <h3 className="font-display text-2xl font-bold text-[#1A1829] tracking-[-0.015em]">
            {totalPendingTodos}
          </h3>
          <div className="flex items-center gap-3 text-xs text-[#6F6A64]">
            <span>{t("todosFromGoals", { count: stats.pendingGoalTodos })}</span>
            <span className="text-[#DDD3C7]">|</span>
            <span>{t("todosPersonal", { count: stats.pendingPersonalTodos })}</span>
          </div>
        </div>

        {/* Workflows */}
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFFFF] px-4 py-3.5 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <span className="rounded-lg bg-[#F3ECFB] p-1.5 text-[#7C2DE8]">
              <RefreshCw className="h-4 w-4" />
            </span>
            <button
              onClick={() => setShowRuns(!showRuns)}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
              style={{
                color: stats.todayRunCount > 0 ? "#7FB38A" : "#6F6A64",
                backgroundColor: stats.todayRunCount > 0 ? "rgba(77,139,106,0.10)" : "#F6F3EE",
              }}
            >
              {t("workflowsRunsToday", { count: stats.todayRunCount })}
              {stats.todayRunCount > 0 && (
                showRuns ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#9B948B] font-semibold">
            {t("workflows")}
          </p>
          <h3 className="font-display text-2xl font-bold text-[#1A1829] tracking-[-0.015em]">
            {stats.totalWorkflows}
          </h3>
          <p className="text-xs text-[#6F6A64]">{t("workflowsTotal")}</p>
        </div>

        {/* Team */}
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFFFF] px-4 py-3.5 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <div className="flex items-center justify-between mb-2">
            <span className="rounded-lg bg-[#F3ECFB] p-1.5 text-[#7C2DE8]">
              <Users className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold text-[#6F6A64] bg-[#F6F3EE] px-2 py-0.5 rounded-full">
              {t("teamActive")}
            </span>
          </div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-[#9B948B] font-semibold">
            {t("team")}
          </p>
          <h3 className="font-display text-2xl font-bold text-[#1A1829] tracking-[-0.015em]">
            {teamCount}
          </h3>
          <p className="text-xs text-[#6F6A64]">{t("teamMembers")}</p>
        </div>
      </div>

      {/* Expandable today's workflow runs */}
      {showRuns && (
        <div className="rounded-xl border border-[#E7DED2] bg-[#FFFFFF] p-4 shadow-[0_4px_12px_rgba(30,34,39,0.04)]">
          <h3 className="text-sm font-semibold text-[#2B2B2B] mb-2">{t("todaysRuns")}</h3>
          {stats.todayRuns.length === 0 ? (
            <p className="text-xs text-[#9B948B] py-3 text-center">{t("noRunsToday")}</p>
          ) : (
            <div className="divide-y divide-dashed divide-[#E7DED2] max-h-[240px] overflow-y-auto">
              {stats.todayRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      run.status === "success" ? "bg-[#7FB38A]" :
                      run.status === "failed" ? "bg-[#D5847A]" :
                      "bg-[#7C2DE8]"
                    }`}
                  />
                  <span className="text-sm font-medium text-[#2B2B2B] flex-1 truncate">
                    {run.workflowName}
                  </span>

                  {/* Action buttons — styled like Run History */}
                  <button
                    onClick={() => handleViewDetails(run.id, run.workflowId)}
                    disabled={loadingRunId === run.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#7C2DE8] hover:bg-[#F3ECFB] transition-colors shrink-0 disabled:opacity-50"
                  >
                    {t("viewDetail")}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  {run.status === "success" && (
                    <button
                      onClick={() => handleDeliverables(run.id)}
                      disabled={loadingRunId === run.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F6A64] hover:bg-[#F6F3EE] transition-colors shrink-0 disabled:opacity-50"
                    >
                      <Package className="h-3.5 w-3.5" />
                      {t("deliverables")}
                    </button>
                  )}

                  <span className="text-[10px] uppercase tracking-wider text-[#9B948B] shrink-0">
                    {run.triggeredBy}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-[#6F6A64] shrink-0">
                    <Clock className="h-3 w-3" />
                    {new Date(run.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View Details modal */}
      {detailRun && (
        <WorkflowRunView
          workflow={detailRun.workflow}
          existingRun={detailRun.run}
          onClose={() => setDetailRun(null)}
          onComplete={() => setDetailRun(null)}
        />
      )}

      {/* Deliverables modal */}
      {deliverablesRun && (
        <DeliverablesModal
          run={deliverablesRun}
          onClose={() => setDeliverablesRun(null)}
        />
      )}
    </div>
  );
}
