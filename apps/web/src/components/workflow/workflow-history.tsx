"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import { getWorkflowRuns, deleteWorkflowRun } from "@/lib/db/actions";
import type { Workflow, WorkflowRun } from "@/lib/types/workflow";

interface WorkflowHistoryProps {
  workflow: Workflow;
  onClose: () => void;
}

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

function findAgent(agentId: string) {
  return allAgents.find((a) => a.id === agentId);
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
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [detailRun, setDetailRun] = useState<WorkflowRun | null>(null);

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

  const handleDelete = useCallback(
    async (runId: string) => {
      try {
        await deleteWorkflowRun(runId);
        setRuns((prev) => prev.filter((r) => r.id !== runId));
      } catch (err) {
        console.error("Failed to delete run:", err);
      }
    },
    []
  );

  const toggleExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

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
              <p className="text-sm font-medium text-[#2B2B2B]">
                No runs yet
              </p>
              <p className="text-xs text-[#9B948B] mt-1">
                Run this workflow to see execution history
              </p>
            </div>
          )}

          {!loading && runs.length > 0 && (
            <div className="space-y-3">
              {runs.map((run) => {
                const isExpanded = expandedRuns.has(run.id);
                const duration = totalDuration(run);

                return (
                  <div
                    key={run.id}
                    className="border border-[#E7DED2] rounded-xl bg-[#FFFDF9] overflow-hidden"
                  >
                    {/* Run summary */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Status icon */}
                      {run.status === "success" ? (
                        <div className="w-7 h-7 rounded-full bg-[#7FB38A]/10 flex items-center justify-center shrink-0">
                          <Check className="h-3.5 w-3.5 text-[#7FB38A]" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#D5847A]/10 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-3.5 w-3.5 text-[#D5847A]" />
                        </div>
                      )}

                      {/* Info */}
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
                          {/* Step dots */}
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
                                      : r.status === "running"
                                      ? "#7FAEE6"
                                      : "#DDD3C7",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDetailRun(run)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#7FAEE6] hover:bg-[#EAF3FD] transition-colors"
                        >
                          View Detail
                          {false ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
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

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-[#E7DED2] px-4 py-3 space-y-3 bg-[#F6F3EE]">
                        {run.step_results.map((result, i) => {
                          const step = workflow.steps[i];
                          if (!step) return null;
                          const agent = findAgent(step.agentId);

                          return (
                            <div
                              key={i}
                              className="bg-[#FFFDF9] rounded-lg border border-[#E7DED2] p-3"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{
                                    backgroundColor:
                                      result.status === "success"
                                        ? "#7FB38A"
                                        : result.status === "failed"
                                        ? "#D5847A"
                                        : "#DDD3C7",
                                  }}
                                />
                                <span className="text-xs font-semibold text-[#6F6A64]">
                                  Step {i + 1}
                                </span>
                                <span className="text-xs text-[#9B948B]">
                                  {agent?.label}
                                </span>
                                {result.durationMs && (
                                  <span className="text-xs text-[#9B948B] ml-auto">
                                    {formatDuration(result.durationMs)}
                                  </span>
                                )}
                              </div>
                              {result.output && (
                                <div className="prose-chat text-xs text-[#2B2B2B] max-w-none max-h-[200px] overflow-y-auto">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {result.output}
                                  </ReactMarkdown>
                                </div>
                              )}
                              {/* Generated files */}
                              {result.files && result.files.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-[#E7DED2] space-y-1">
                                  <p className="text-[10px] font-medium text-[#9B948B] uppercase">Generated Files</p>
                                  {result.files.map((f: { fileId: string; filename: string }, fi: number) => (
                                    <a
                                      key={fi}
                                      href={`/api/ai/files/${f.fileId}`}
                                      download={f.filename}
                                      className="flex items-center gap-1.5 text-xs text-[#7FAEE6] hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <span>📄</span>
                                      {f.filename}
                                    </a>
                                  ))}
                                  <p className="text-[9px] text-[#9B948B]">Files available for 30 days</p>
                                </div>
                              )}
                              {result.error && (
                                <p className="text-xs text-[#D5847A] mt-1">
                                  Error: {result.error}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail overlay — full page like run view */}
      {detailRun && (
        <div className="fixed inset-0 z-[70] ml-20 mt-16 flex flex-col bg-[#F6F3EE] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E7DED2] bg-[#FFFDF9] shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setDetailRun(null)} className="p-1.5 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4]">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-base font-semibold text-[#2B2B2B]">{workflow.name}</h2>
                <p className="text-xs text-[#9B948B]">
                  {new Date(detailRun.started_at).toLocaleString()} · {detailRun.total_steps} steps · {detailRun.status}
                </p>
              </div>
            </div>
            <button onClick={() => setDetailRun(null)} className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4]">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {detailRun.step_results.map((result, idx) => {
              const step = workflow.steps[idx];
              const agent = step ? findAgent(step.agentId) : null;
              return (
                <div key={idx} className="bg-[#FFFDF9] rounded-xl border border-[#E7DED2] overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E7DED2]">
                    <div className={`w-2 h-2 rounded-full ${
                      result.status === "success" ? "bg-[#7FB38A]" : result.status === "failed" ? "bg-[#D5847A]" : "bg-[#DDD3C7]"
                    }`} />
                    <span className="text-sm font-medium text-[#2B2B2B]">Step {idx + 1}: {agent?.label || "Unknown"}</span>
                    {result.durationMs && (
                      <span className="text-xs text-[#9B948B] ml-auto">{(result.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                  {result.output && (
                    <div className="px-4 py-4 prose-chat text-sm text-[#2B2B2B] max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.output}</ReactMarkdown>
                    </div>
                  )}
                  {result.files && result.files.length > 0 && (
                    <div className="px-4 pb-4 pt-2 border-t border-[#E7DED2] space-y-1">
                      <p className="text-[10px] font-medium text-[#9B948B] uppercase">Generated Files</p>
                      {result.files.map((f: { fileId: string; filename: string }, fi: number) => (
                        <a key={fi} href={`/api/ai/files/${f.fileId}`} download={f.filename} className="flex items-center gap-1.5 text-xs text-[#7FAEE6] hover:underline">
                          📄 {f.filename}
                        </a>
                      ))}
                      <p className="text-[9px] text-[#9B948B]">Files available for 30 days</p>
                    </div>
                  )}
                  {result.error && (
                    <div className="px-4 py-3 text-xs text-[#D5847A]">Error: {result.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
