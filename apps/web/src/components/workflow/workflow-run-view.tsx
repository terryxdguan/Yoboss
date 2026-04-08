"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Square, ChevronDown, ChevronRight, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import { setAgentStatus } from "@/lib/stores/agent-status";
import {
  createWorkflowRun,
  updateWorkflowRun,
  updateWorkflow,
} from "@/lib/db/actions";
import type {
  Workflow,
  WorkflowRun,
  WorkflowStepResult,
  GeneratedFile,
} from "@/lib/types/workflow";

interface WorkflowRunViewProps {
  workflow: Workflow;
  onClose: () => void;
  onComplete: () => void;
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

export function WorkflowRunView({
  workflow,
  onClose,
  onComplete,
}: WorkflowRunViewProps) {
  const [runId, setRunId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepResults, setStepResults] = useState<WorkflowStepResult[]>([]);
  const [currentOutput, setCurrentOutput] = useState("");
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [overallStatus, setOverallStatus] = useState<
    "running" | "success" | "failed"
  >("running");
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  // Initialize step results
  const initStepResults = useCallback((): WorkflowStepResult[] => {
    return workflow.steps.map((s) => ({
      stepId: s.id,
      status: "pending" as const,
    }));
  }, [workflow.steps]);

  // Stream a single step
  const runStep = useCallback(
    async (
      stepIndex: number,
      previousOutputs: string[],
      signal: AbortSignal
    ): Promise<{ text: string; files: GeneratedFile[] }> => {
      const step = workflow.steps[stepIndex];
      const agent = findAgent(step.agentId);
      if (!agent) throw new Error(`Agent ${step.agentId} not found`);

      setAgentStatus(step.agentId, "working");

      // Build enriched prompt
      let enrichedPrompt = step.prompt;
      if (previousOutputs.length > 0) {
        enrichedPrompt =
          "Previous step outputs:\n\n" +
          previousOutputs
            .map((o, i) => `Step ${i + 1}:\n${o}`)
            .join("\n\n---\n\n") +
          "\n\nYour task:\n" +
          step.prompt;
      }

      const res = await fetch("/api/ai/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptFile: agent.promptFile,
          messages: [{ role: "user", content: enrichedPrompt }],
          useOpus: true,
        }),
        signal,
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${errorBody}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let text = "";
      const files: GeneratedFile[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (signal.aborted) {
          reader.cancel();
          throw new Error("Aborted");
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          if (line.startsWith("event:")) continue;
          const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;
          let event;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }
          // Text content
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            event.delta.text
          ) {
            text += event.delta.text;
            setCurrentOutput(text);
            setToolStatus(null); // Clear tool status when text starts flowing
          }
          // Server-side tool activity (web_search, web_fetch, code_execution)
          if (event.type === "content_block_start" && event.content_block?.type === "server_tool_use") {
            const toolName = event.content_block.name as string;
            const labels: Record<string, string> = {
              web_search: "🔍 Searching the web...",
              web_fetch: "🌐 Fetching webpage...",
              bash_code_execution: "💻 Running code...",
              text_editor_code_execution: "📝 Editing file...",
            };
            setToolStatus(labels[toolName] || `⚙️ Using ${toolName}...`);
          }
          if (event.type === "content_block_stop") {
            // Tool finished, will either get more tools or text
          }
          // Generated files from code_execution — check multiple event structures
          // Log all code execution related events for debugging
          if (event.type === "content_block_start" && event.content_block?.type?.includes("code_execution")) {
            console.log("[workflow] code_execution event:", JSON.stringify(event.content_block).slice(0, 500));
            const block = event.content_block;
            // Check for file outputs in the content block
            if (block.content) {
              const contentItems = Array.isArray(block.content) ? block.content : [block.content];
              for (const item of contentItems) {
                if (item.file_id) {
                  files.push({ fileId: item.file_id, filename: item.filename || "output" });
                }
                // Nested content array
                if (Array.isArray(item.content)) {
                  for (const sub of item.content) {
                    if (sub.file_id) {
                      files.push({ fileId: sub.file_id, filename: sub.filename || "output" });
                    }
                  }
                }
              }
            }
          }
          // Also check content_block_delta for file references
          if (event.type === "content_block_delta" && event.delta?.type?.includes("code_execution")) {
            console.log("[workflow] code_execution delta:", JSON.stringify(event.delta).slice(0, 500));
          }
          // Check content_block_stop for result blocks with files
          if (event.type === "content_block_stop" && event.content_block?.type?.includes("code_execution")) {
            console.log("[workflow] code_execution stop:", JSON.stringify(event.content_block).slice(0, 500));
          }
        }
      }

      setAgentStatus(step.agentId, "idle");
      return { text, files };
    },
    [workflow.steps]
  );

  // Execute workflow
  const executeWorkflow = useCallback(async () => {
    const initialResults = initStepResults();
    setStepResults(initialResults);

    // Create run record
    let run: WorkflowRun;
    try {
      run = await createWorkflowRun({
        workflowId: workflow.id,
        totalSteps: workflow.steps.length,
        stepResults: initialResults,
      });
      setRunId(run.id);
      // Mark workflow as running
      await updateWorkflow(workflow.id, { status: "running" });
    } catch (err) {
      console.error("Failed to create run:", err);
      setOverallStatus("failed");
      setIsRunning(false);
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;

    const outputs: string[] = [];

    for (let i = 0; i < workflow.steps.length; i++) {
      if (abort.signal.aborted) break;

      setCurrentStep(i);
      setCurrentOutput("");
      setToolStatus(null);

      // Mark current step as running
      const updatedResults = [...initialResults];
      for (let j = 0; j < i; j++) {
        updatedResults[j] = { ...updatedResults[j], status: "success" };
      }
      updatedResults[i] = { ...updatedResults[i], status: "running" };
      setStepResults(updatedResults);

      try {
        await updateWorkflowRun(run.id, {
          current_step: i,
          step_results: updatedResults,
        });
      } catch {
        // Non-blocking DB update
      }

      const startTime = Date.now();

      try {
        const result = await runStep(i, outputs, abort.signal);
        const duration = Date.now() - startTime;
        outputs.push(result.text);

        updatedResults[i] = {
          ...updatedResults[i],
          status: "success",
          output: result.text,
          durationMs: duration,
          files: result.files.length > 0 ? result.files : undefined,
        };
        setStepResults([...updatedResults]);

        // Persist step result
        try {
          await updateWorkflowRun(run.id, {
            current_step: i + 1,
            step_results: updatedResults,
          });
        } catch {
          // Non-blocking
        }
      } catch (err) {
        if (abort.signal.aborted) break;

        const duration = Date.now() - startTime;
        const errorMsg =
          err instanceof Error ? err.message : "Unknown error";

        updatedResults[i] = {
          ...updatedResults[i],
          status: "failed",
          error: errorMsg,
          durationMs: duration,
        };
        setStepResults([...updatedResults]);

        // Mark run as failed
        setOverallStatus("failed");
        setIsRunning(false);

        setAgentStatus(workflow.steps[i].agentId, "idle");

        try {
          await updateWorkflowRun(run.id, {
            status: "failed",
            step_results: updatedResults,
            completed_at: new Date().toISOString(),
          });
          await updateWorkflow(workflow.id, {
            last_run_at: new Date().toISOString(),
            last_run_status: "failed",
            status: "ready",
          });
        } catch {
          // Non-blocking
        }

        return;
      }
    }

    if (!abort.signal.aborted) {
      // All steps completed
      setOverallStatus("success");
      setIsRunning(false);

      const finalResults = stepResults.length
        ? stepResults
        : initialResults.map((r, i) => ({
            ...r,
            status: "success" as const,
            output: outputs[i] || "",
          }));

      try {
        await updateWorkflowRun(run.id, {
          status: "success",
          current_step: workflow.steps.length,
          step_results: finalResults,
          completed_at: new Date().toISOString(),
        });
        await updateWorkflow(workflow.id, {
          last_run_at: new Date().toISOString(),
          last_run_status: "success",
          status: "ready",
        });
      } catch {
        // Non-blocking
      }

      onComplete();
    }
  }, [
    workflow,
    initStepResults,
    runStep,
    stepResults,
    onComplete,
  ]);

  // Start on mount
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    executeWorkflow();

    return () => {
      abortRef.current?.abort();
      // Reset any running agent statuses
      workflow.steps.forEach((s) => setAgentStatus(s.agentId, "idle"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [currentOutput]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setOverallStatus("failed");
    workflow.steps.forEach((s) => setAgentStatus(s.agentId, "idle"));
  };

  const toggleExpanded = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const currentAgent = findAgent(workflow.steps[currentStep]?.agentId);

  return (
    <div className="fixed inset-0 z-40 ml-20 mt-16 flex flex-col bg-[#F6F3EE] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#FFFDF9] border-b border-[#E7DED2]">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[#2B2B2B]">
            Running: {workflow.name}
          </h1>
          {overallStatus === "success" && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#7FB38A]/10 text-[#7FB38A]">
              Complete
            </span>
          )}
          {overallStatus === "failed" && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#D5847A]/10 text-[#D5847A]">
              Failed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[#D5847A] bg-[#D5847A]/10 hover:bg-[#D5847A]/20 transition-colors"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-6 py-5 bg-[#FFFDF9] border-b border-[#E7DED2]">
        <div className="flex items-center justify-center gap-0">
          {workflow.steps.map((step, idx) => {
            const result = stepResults[idx];
            const status = result?.status || "pending";
            let dotColor = "#DDD3C7"; // pending
            if (status === "success") dotColor = "#7FB38A";
            else if (status === "running") dotColor = "#7FAEE6";
            else if (status === "failed") dotColor = "#D5847A";

            const agent = findAgent(step.agentId);
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${
                      status === "running" ? "animate-pulse" : ""
                    }`}
                    style={{
                      backgroundColor: dotColor,
                      borderColor: dotColor,
                    }}
                  />
                  <span className="text-[10px] text-[#9B948B] mt-1 max-w-[80px] truncate text-center">
                    {agent?.label || "Agent"}
                  </span>
                </div>
                {idx < workflow.steps.length - 1 && (
                  <div
                    className="w-12 h-0.5 mx-1 mt-[-12px]"
                    style={{
                      backgroundColor:
                        (stepResults[idx]?.status === "success")
                          ? "#7FB38A"
                          : "#E7DED2",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Previous completed steps */}
        {stepResults.map((result, i) => {
          if (i >= currentStep || result.status !== "success") return null;
            const step = workflow.steps[i];
            if (!step) return null;
            const agent = findAgent(step.agentId);
            const isExpanded = expandedSteps.has(i);

            return (
              <div
                key={step.id}
                className="bg-[#FFFDF9] rounded-xl border border-[#E7DED2] overflow-hidden"
              >
                <button
                  onClick={() => toggleExpanded(i)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F6F3EE] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#7FB38A]" />
                    <span className="text-sm font-medium text-[#2B2B2B]">
                      Step {i + 1}: {agent?.label || "Agent"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.durationMs && (
                      <span className="flex items-center gap-1 text-xs text-[#9B948B]">
                        <Clock className="h-3 w-3" />
                        {formatDuration(result.durationMs)}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-[#9B948B]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[#9B948B]" />
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-[#E7DED2]">
                    {result.output && (
                      <div className="mt-3 prose-chat text-sm text-[#2B2B2B] max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {result.output}
                        </ReactMarkdown>
                      </div>
                    )}
                    {result.files && result.files.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-[#E7DED2] space-y-1">
                        <p className="text-[10px] font-medium text-[#9B948B] uppercase">Generated Files</p>
                        {result.files.map((f, fi) => (
                          <a
                            key={fi}
                            href={`/api/ai/files/${f.fileId}`}
                            download={f.filename}
                            className="flex items-center gap-1.5 text-xs text-[#7FAEE6] hover:underline"
                          >
                            <span>📄</span>
                            {f.filename}
                          </a>
                        ))}
                        <p className="text-[9px] text-[#9B948B]">Files available for 30 days</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {/* Current step */}
        {isRunning && workflow.steps[currentStep] && (
          <div className="bg-[#FFFDF9] rounded-xl border border-[#7FAEE6] shadow-[0_4px_16px_rgba(43,43,43,0.04)]">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E7DED2]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#7FAEE6] animate-pulse" />
              <span className="text-sm font-medium text-[#2B2B2B]">
                Step {currentStep + 1}/{workflow.steps.length}:{" "}
                {currentAgent?.label}
              </span>
            </div>
            <div
              ref={outputRef}
              className="p-4 max-h-[400px] overflow-y-auto"
            >
              {currentOutput ? (
                <div className="prose-chat text-sm text-[#2B2B2B] max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {currentOutput}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {toolStatus && (
                    <div className="flex items-center gap-2 text-sm text-[#7FAEE6] font-medium">
                      <div className="w-2 h-2 rounded-full bg-[#7FAEE6] animate-ping" />
                      {toolStatus}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-[#9B948B]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#7FAEE6] animate-pulse" />
                    {toolStatus ? "Processing..." : "Waiting for response..."}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Failed step error */}
        {overallStatus === "failed" &&
          stepResults.find((r) => r.status === "failed") && (
            <div className="bg-[#FFFDF9] rounded-xl border border-[#D5847A] p-4">
              <p className="text-sm font-medium text-[#D5847A]">
                Step failed:{" "}
                {stepResults.find((r) => r.status === "failed")?.error ||
                  "Unknown error"}
              </p>
            </div>
          )}

        {/* Success summary */}
        {overallStatus === "success" && (
          <div className="bg-[#7FB38A]/5 rounded-xl border border-[#7FB38A]/30 p-4 text-center">
            <p className="text-sm font-medium text-[#7FB38A]">
              Workflow completed successfully! All {workflow.steps.length} steps
              finished.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
