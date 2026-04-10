"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Check,
  AlertTriangle,
  ChevronRight,
  Clock,
  Trash2,
  Package,
} from "lucide-react";
import { getWorkflowRuns, deleteWorkflowRun } from "@/lib/db/actions";
import { WorkflowRunView } from "./workflow-run-view";
import { DeliverablesModal } from "./deliverables-panel";
import type { Workflow, WorkflowRun } from "@/lib/types/workflow";

interface WorkflowHistoryProps {
  workflow: Workflow;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return `${mins}m ${remSecs}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function totalDuration(run: WorkflowRun): number {
  return run.step_results.reduce((sum, r) => sum + (r.durationMs || 0), 0);
}

export function WorkflowHistory({ workflow, onClose }: WorkflowHistoryProps) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRun, setDetailRun] = useState<WorkflowRun | null>(null);
  const [deliverablesRun, setDeliverablesRun] = useState<WorkflowRun | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const data = await getWorkflowRuns(workflow.id);
      setRuns(data);
    } catch (err) {
      console.error("Failed to load runs:", err);
    } finally {
      setLoading(false);
    }
  }, [workflow.id]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const handleDelete = useCallback(async (runId: string) => {
    try {
      await deleteWorkflowRun(runId);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (err) {
      console.error("Failed to delete run:", err);
    }
  }, []);

  // View Detail → open WorkflowRunView in history mode
  if (detailRun) {
    return (
      <WorkflowRunView
        workflow={workflow}
        existingRun={detailRun}
        onClose={() => setDetailRun(null)}
        onComplete={() => {}}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E7DED2]">
          <div>
            <h2 className="text-lg font-semibold text-[#2B2B2B]">
              Run History
            </h2>
            <p className="text-sm text-[#6F6A64] mt-0.5">{workflow.name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="text-center py-12 text-sm text-[#9B948B]">
              Loading runs...
            </div>
          )}

          {!loading && runs.length === 0 && (
            <div className="text-center py-16">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#F1ECE4] flex items-center justify-center">
                <Clock className="h-6 w-6 text-[#9B948B]" />
              </div>
              <p className="text-sm font-medium text-[#2B2B2B]">No runs yet</p>
              <p className="text-xs text-[#9B948B] mt-1">
                Run this workflow to see execution history
              </p>
            </div>
          )}

          {!loading && runs.length > 0 && (
            <div className="space-y-3">
              {runs.map((run) => {
                const duration = totalDuration(run);

                return (
                  <div
                    key={run.id}
                    className="border border-[#E7DED2] rounded-xl bg-[#FFFDF9] overflow-hidden"
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {run.status === "success" ? (
                        <div className="w-7 h-7 rounded-full bg-[#7FB38A]/10 flex items-center justify-center shrink-0">
                          <Check className="h-3.5 w-3.5 text-[#7FB38A]" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#D5847A]/10 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-3.5 w-3.5 text-[#D5847A]" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#2B2B2B]">
                          {formatDate(run.started_at)}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-[#9B948B]">
                            {run.total_steps} steps
                          </span>
                          {duration > 0 && (
                            <span className="text-xs text-[#9B948B]">
                              {formatDuration(duration)}
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            {run.step_results.map((r, i) => (
                              <div
                                key={i}
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    r.status === "success"
                                      ? "#7FB38A"
                                      : r.status === "failed"
                                        ? "#D5847A"
                                        : "#DDD3C7",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDetailRun(run)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#7FAEE6] hover:bg-[#EAF3FD] transition-colors"
                        >
                          View Detail
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeliverablesRun(run)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
                          title="Deliverables"
                        >
                          <Package className="h-3.5 w-3.5" />
                          Deliverables
                        </button>
                        <button
                          onClick={() => handleDelete(run.id)}
                          className="p-1.5 rounded-lg text-[#9B948B] hover:text-[#D5847A] hover:bg-[#D5847A]/10 transition-colors"
                          title="Delete run"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
