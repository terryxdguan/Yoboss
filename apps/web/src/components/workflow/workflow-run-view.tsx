"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Square, Send, Download, Globe, Code, Info } from "lucide-react";
import { LiveTimer } from "@/components/ui/live-timer";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ALL_AGENTS, DEFAULT_AGENTS, DEFAULT_AGENT_AVATAR } from "@/lib/ai/agent-registry";
import { parseSSEStream } from "@/lib/utils/sse-parser";
import { setAgentStatus } from "@/lib/stores/agent-status";
import {
  createWorkflowRun,
  updateWorkflowRun,
  updateWorkflow,
  getWorkflowRunById,
} from "@/lib/db/actions";
import type {
  Workflow,
  WorkflowRun,
  WorkflowStepResult,
  GeneratedFile,
} from "@/lib/types/workflow";
import {
  DeliverablesButton,
  type DeliverableItem,
} from "./deliverables-panel";

interface WorkflowRunViewProps {
  workflow: Workflow;
  onClose: () => void;
  onComplete: () => void;
  /** If provided, skip execution and load from history */
  existingRun?: WorkflowRun;
  /** When true, treat existingRun as a cached demo: bail out of all
      side effects, hydrate from step_results, and render the yellow
      banner. Used by the workflows page when /api/workflows/check-cache
      returns cached: true. */
  cachedMode?: boolean;
  /** One-off topic override entered at launch time. Falls back to
      workflow.topic when absent. Prepended to each step's prompt at
      run time so the agent knows what subject to work on. */
  topic?: string;
}

// --- Types ---

interface ToolActivity {
  type: "web_search" | "web_fetch" | "code_execution";
  label: string;
}

interface ChatMessage {
  id: string;
  type: "step" | "system" | "user" | "assistant";
  // step fields
  stepIndex?: number;
  agentId?: string;
  agentLabel?: string;
  agentAvatar?: string;
  durationMs?: number;
  toolActivity?: ToolActivity[];
  generatedFiles?: GeneratedFile[];
  // common
  content: string;
  isStreaming?: boolean;
  /** Set on the error path of handleSend when the follow-up chat
   *  stream was cut off. Serialized into follow_up_messages and the
   *  render path shows an "interrupted — send a new message to
   *  continue" warning when the message is no longer the streaming one. */
  interrupted?: boolean;
}

// --- Helpers ---

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

function findAgent(agentId: string) {
  return allAgents.find((a) => a.id === agentId);
}

let counter = 0;
function genId() {
  return `wfm_${Date.now()}_${++counter}`;
}

async function resolveFilenames(
  files: GeneratedFile[]
): Promise<GeneratedFile[]> {
  const unknowns = files.filter(
    (f) => !f.filename || f.filename === "download"
  );
  if (unknowns.length === 0) return files;

  try {
    const res = await fetch("/api/ai/files/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileIds: unknowns.map((f) => f.fileId) }),
    });
    if (!res.ok) return files;
    const { files: nameMap } = (await res.json()) as {
      files: Record<string, string>;
    };
    return files.map((f) => ({
      ...f,
      filename: nameMap[f.fileId] || f.filename,
    }));
  } catch {
    return files;
  }
}

// --- Component ---

export function WorkflowRunView({
  workflow,
  onClose,
  onComplete,
  existingRun,
  cachedMode,
  topic,
}: WorkflowRunViewProps) {
  const isPollingMode = !!existingRun && existingRun.status === "running";
  const isHistoryMode = !!existingRun && !isPollingMode;

  // Build initial messages from existing run
  const buildHistoryMessages = useCallback((): ChatMessage[] => {
    if (!existingRun) return [];
    const msgs: ChatMessage[] = [];
    for (let i = 0; i < existingRun.step_results.length; i++) {
      const result = existingRun.step_results[i];
      // Skip pending steps with no content — don't show empty skeleton cards
      if (result.status === "pending") continue;
      const step = workflow.steps[i];
      const agent = step ? findAgent(step.agentId) : null;
      msgs.push({
        id: genId(),
        type: "step",
        stepIndex: i,
        agentId: step?.agentId,
        agentLabel: agent?.label || "Employee",
        agentAvatar: agent?.avatar,
        durationMs: result.durationMs,
        generatedFiles: result.files as GeneratedFile[] | undefined,
        content: result.output || result.error || "",
      });
    }
    if (existingRun.status === "success") {
      msgs.push({ id: genId(), type: "system", content: `All ${existingRun.total_steps} steps completed successfully.` });
    } else if (existingRun.status === "failed") {
      const failedStep = existingRun.step_results.find((r) => r.status === "failed");
      msgs.push({ id: genId(), type: "system", content: failedStep?.error ? `Workflow failed: ${failedStep.error}` : "Workflow failed." });
    }

    // Restore follow-up chat messages
    if (existingRun.follow_up_messages) {
      for (const fm of existingRun.follow_up_messages) {
        if (fm.type === "user") {
          msgs.push({ id: genId(), type: "user", content: fm.content });
        } else {
          msgs.push({
            id: genId(),
            type: "assistant",
            agentLabel: "General Assistant",
            agentAvatar: "/pink.png",
            content: fm.content,
            toolActivity: fm.toolActivity as ToolActivity[] | undefined,
            generatedFiles: fm.generatedFiles as GeneratedFile[] | undefined,
            interrupted: Boolean(fm.interrupted),
          });
        }
      }
    }

    return msgs;
  }, [existingRun, workflow.steps]);

  const [stepResults, setStepResults] = useState<WorkflowStepResult[]>(() =>
    existingRun ? existingRun.step_results : []
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    buildHistoryMessages()
  );
  const [currentStep, setCurrentStep] = useState(isPollingMode ? existingRun!.current_step : 0);
  const [isRunning, setIsRunning] = useState(!isHistoryMode);
  const [overallStatus, setOverallStatus] = useState<"running" | "success" | "failed">(
    isHistoryMode ? (existingRun!.status as "success" | "failed") : "running"
  );
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  // Post-completion chat state
  const [inputText, setInputText] = useState("");
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [workflowSummary, setWorkflowSummary] = useState<string | null>(null);
  const chatHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>(
    existingRun?.follow_up_messages?.map((fm) => ({ role: fm.type, content: fm.content })) || []
  );

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasStarted = useRef(false);
  const streamingMsgId = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(existingRun?.id || null);
  const sessionIdRef = useRef<string | null>(existingRun?.session_id || null);
  const knownFileIdsRef = useRef<string[]>([]);
  const resumeActiveRef = useRef(false);
  // Mirror of stepResults state for synchronous reads inside runStep's
  // throttled flush. Updated every time executeWorkflow mutates results.
  const stepResultsRef = useRef<WorkflowStepResult[]>(
    existingRun ? existingRun.step_results : []
  );

  // Persist follow-up messages to DB
  const saveFollowUpMessages = useCallback(async (msgs: ChatMessage[]) => {
    // Cached demo runs have a synthetic run id (cached-...) that doesn't
    // exist in workflow_runs. Persisting follow-up messages would always
    // fail. Chat still works in-memory; just no persistence.
    if (cachedMode) return;
    const rid = runIdRef.current;
    if (!rid) return;
    // Extract only user/assistant messages (skip step & system). Carry
    // `interrupted` through so a mid-stream death survives reload: the
    // render path reads it back and shows the "send a new message to
    // continue" warning.
    const followUp = msgs
      .filter((m) => m.type === "user" || m.type === "assistant")
      .map((m) => ({
        type: m.type as "user" | "assistant",
        content: m.content,
        toolActivity: m.toolActivity,
        generatedFiles: m.generatedFiles,
        ...(m.interrupted ? { interrupted: true } : {}),
      }));
    if (followUp.length === 0) return;
    try {
      await updateWorkflowRun(rid, { follow_up_messages: followUp });
    } catch {
      // Non-blocking
    }
  }, [cachedMode]);

  // Resolve "download" filenames on mount (for history view)
  useEffect(() => {
    if (!isHistoryMode) return;
    // Cached runs use Storage URLs (the href field is already attached
    // server-side by /api/workflows/check-cache); there are no Anthropic
    // file IDs to resolve, and the metadata endpoint would 404.
    if (cachedMode) return;
    const unresolvedIds: string[] = [];
    for (const msg of chatMessages) {
      if (msg.generatedFiles) {
        for (const f of msg.generatedFiles) {
          if (!f.filename || f.filename === "download") {
            unresolvedIds.push(f.fileId);
          }
        }
      }
    }
    if (unresolvedIds.length === 0) return;

    fetch("/api/ai/files/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileIds: unresolvedIds }),
    })
      .then((res) => res.json())
      .then(({ files: nameMap }: { files: Record<string, string> }) => {
        setChatMessages((prev) =>
          prev.map((m) => {
            if (!m.generatedFiles) return m;
            const updated = m.generatedFiles.map((f) =>
              nameMap[f.fileId] ? { ...f, filename: nameMap[f.fileId] } : f
            );
            return { ...m, generatedFiles: updated };
          })
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHistoryMode, cachedMode]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, toolStatus]);

  // Initialize step results
  const initStepResults = useCallback((): WorkflowStepResult[] => {
    return workflow.steps.map((s) => ({
      stepId: s.id,
      status: "pending" as const,
    }));
  }, [workflow.steps]);

  // Consume an SSE stream from /api/ai/agent-run-step for a single step.
  // Handles event parsing, UI updates, throttled partial-progress DB flushes,
  // and session_id capture. Shared between `runStep` (fresh step) and
  // `resumeStep` (Task 3 — resuming an interrupted step).
  const consumeAgentStepStream = useCallback(
    async (
      res: Response,
      stepIndex: number,
      assistantMsgId: string,
      signal: AbortSignal
    ): Promise<{ text: string; files: GeneratedFile[]; tools: ToolActivity[] }> => {
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let text = "";
      const tools: ToolActivity[] = [];
      const files: GeneratedFile[] = [];

      // Throttled partial flush — every 2s, persist whatever text/tools/files
      // have arrived so far into step_results[stepIndex]. If Vercel kills the
      // function mid-step the recovery handler can read partial output from
      // the DB instead of relying on heuristic Anthropic event reconstruction.
      let flushInFlight = false;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let stepFlushFinalized = false;

      const flushStepProgress = async () => {
        const rid = runIdRef.current;
        if (flushInFlight || stepFlushFinalized || !rid || cachedMode) return;
        flushInFlight = true;
        try {
          const snapshot = [...stepResultsRef.current];
          snapshot[stepIndex] = {
            ...snapshot[stepIndex],
            status: "running",
            output: text || undefined,
            toolActivity: tools.length > 0 ? [...tools] : undefined,
            files: files.length > 0 ? [...files] : undefined,
          };
          await updateWorkflowRun(rid, { step_results: snapshot });
        } catch {
          // Non-blocking; next flush retries with newer state.
        }
        flushInFlight = false;
      };

      const scheduleStepFlush = () => {
        if (flushTimer || stepFlushFinalized) return;
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flushStepProgress();
        }, 2000);
      };

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
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "error") {
            throw new Error((event.message as string) || "Something went wrong. Please try again.");
          }

          if (event.type === "session_created") {
            sessionIdRef.current = event.sessionId as string;
            // Persist session_id to DB for history continuity (skip in cached
            // mode — the synthetic run id doesn't exist in workflow_runs).
            if (runIdRef.current && !cachedMode) {
              try {
                await updateWorkflowRun(runIdRef.current, {
                  session_id: event.sessionId as string,
                });
              } catch {
                // Non-blocking
              }
            }
          }

          if (event.type === "tool_use") {
            const toolName = (event.name as string) || "unknown";
            const labels: Record<string, string> = {
              web_search: "Searching the web...",
              web_fetch: "Fetching webpage...",
              code_execution: "Running code...",
              computer: "Using computer...",
            };
            const activity: ToolActivity = {
              type: toolName.includes("web_search")
                ? "web_search"
                : toolName.includes("web_fetch")
                  ? "web_fetch"
                  : "code_execution",
              label: labels[toolName] || `Using ${toolName}...`,
            };
            tools.push(activity);
            setToolStatus(labels[toolName] || `Using ${toolName}...`);
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, toolActivity: [...tools] } : m
              )
            );
          }

          if (event.type === "content") {
            text = event.text as string;
            setToolStatus(null);
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: text, toolActivity: [...tools] }
                  : m
              )
            );
            scheduleStepFlush();
          }

          if (event.type === "file") {
            const newFile: GeneratedFile = {
              fileId: event.fileId as string,
              filename: event.filename as string,
            };
            files.push(newFile);
            knownFileIdsRef.current.push(newFile.fileId);
            setChatMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, generatedFiles: [...files] } : m
              )
            );
            scheduleStepFlush();
          }

          if (event.type === "done") {
            text = (event.text as string) || text;
          }
        }
      }

      // Cancel any pending flush — the caller will do a full write with
      // the final status immediately after we return.
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      stepFlushFinalized = true;

      return { text, files, tools };
    },
    [cachedMode]
  );

  // Run a single step via Managed Agent session — polls for events and updates UI
  const runStep = useCallback(
    async (
      stepIndex: number,
      signal: AbortSignal
    ): Promise<{ text: string; files: GeneratedFile[] }> => {
      const step = workflow.steps[stepIndex];
      const agent = findAgent(step.agentId);
      if (!agent) throw new Error(`Agent ${step.agentId} not found`);

      setAgentStatus(step.agentId, "working");

      // Add step message (streaming)
      const msgId = genId();
      streamingMsgId.current = msgId;
      const stepMsg: ChatMessage = {
        id: msgId,
        type: "step",
        stepIndex,
        agentId: step.agentId,
        agentLabel: agent.label,
        agentAvatar: agent.avatar,
        content: "",
        isStreaming: true,
        toolActivity: [],
        generatedFiles: [],
      };
      setChatMessages((prev) => [...prev, stepMsg]);

      // Inject run-time topic (one-off prop override, falling back to the
      // workflow's saved topic) into the step prompt. Matches what the
      // server-side /api/workflows/execute path used to do — see
      // apps/web/src/app/api/workflows/execute/route.ts line 190.
      const effectiveTopic = topic || workflow.topic;
      const message = effectiveTopic
        ? `Topic/Task: ${effectiveTopic}\n\n${step.prompt}`
        : step.prompt;

      // Call Managed Agent via SSE route
      // Role prompt is loaded server-side; session context replaces previousOutputs
      const res = await fetch("/api/ai/agent-run-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current || undefined,
          message,
          rolePromptFile: agent.promptFile,
          knownFileIds: knownFileIdsRef.current,
        }),
        signal,
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(`API error ${res.status}: ${errorBody}`);
      }

      const { text, files, tools } = await consumeAgentStepStream(
        res,
        stepIndex,
        msgId,
        signal
      );

      // Finalize message — no longer streaming
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
              ...m,
              content: text,
              isStreaming: false,
              toolActivity: tools.length > 0 ? tools : undefined,
              generatedFiles: files.length > 0 ? files : undefined,
            }
            : m
        )
      );
      streamingMsgId.current = null;
      setToolStatus(null);
      setAgentStatus(step.agentId, "idle");
      return { text, files };
    },
    [workflow.steps, workflow.topic, topic, consumeAgentStepStream]
  );

  const resumeStep = useCallback(async (
    stepIndex: number,
    sessionIdForResume: string,
    signal: AbortSignal
  ): Promise<{ text: string; files: GeneratedFile[] }> => {
    const step = workflow.steps[stepIndex];
    const agent = findAgent(step.agentId);
    if (!agent) throw new Error(`Agent ${step.agentId} not found`);

    setAgentStatus(step.agentId, "working");

    // Create the streaming message placeholder — same as runStep.
    const msgId = genId();
    streamingMsgId.current = msgId;
    const stepMsg: ChatMessage = {
      id: msgId,
      type: "step",
      stepIndex,
      agentId: step.agentId,
      agentLabel: agent.label,
      agentAvatar: agent.avatar,
      content: "",
      isStreaming: true,
      toolActivity: [],
      generatedFiles: [],
    };
    setChatMessages((prev) => [...prev, stepMsg]);

    // Call the resume variant of agent-run-step.
    const res = await fetch("/api/ai/agent-run-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionIdForResume,
        resume: true,
        knownFileIds: knownFileIdsRef.current,
      }),
      signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `API error: ${res.status}`);
    }

    const { text, files, tools } = await consumeAgentStepStream(res, stepIndex, msgId, signal);

    // Finalize the step message — same pattern as runStep.
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              content: text,
              isStreaming: false,
              toolActivity: tools.length > 0 ? tools : undefined,
              generatedFiles: files.length > 0 ? files : undefined,
            }
          : m
      )
    );
    streamingMsgId.current = null;
    setToolStatus(null);
    setAgentStatus(step.agentId, "idle");
    return { text, files };
  }, [workflow.steps, consumeAgentStepStream]);

  // Generate summary of workflow outputs using Haiku
  const generateWorkflowSummary = useCallback(async (outputs: string[]) => {
    try {
      const combined = outputs
        .map((o, i) => `Step ${i + 1}:\n${o}`)
        .join("\n\n---\n\n");

      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldSummary: null,
          messages: [{ role: "assistant", content: combined }],
        }),
      });
      const data = await res.json();
      if (data.summary) {
        setWorkflowSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to generate workflow summary:", err);
      // Fallback: use truncated outputs
      const fallback = outputs.map((o, i) => `Step ${i + 1}: ${o.slice(0, 200)}...`).join("\n");
      setWorkflowSummary(fallback);
    }
  }, []);

  // Execute workflow
  const executeWorkflow = useCallback(async () => {
    const initialResults = initStepResults();
    setStepResults(initialResults);
    stepResultsRef.current = initialResults;

    let run: WorkflowRun;
    try {
      run = await createWorkflowRun({
        workflowId: workflow.id,
        totalSteps: workflow.steps.length,
        stepResults: initialResults,
      });
      runIdRef.current = run.id;
      await updateWorkflow(workflow.id, { status: "running" });
    } catch (err) {
      console.error("Failed to create run:", err);
      setChatMessages([{
        id: genId(),
        type: "system",
        content: "Failed to start workflow. Please try again.",
      }]);
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
      setToolStatus(null);

      // Update step results
      const updatedResults = [...initialResults];
      for (let j = 0; j < i; j++) {
        updatedResults[j] = { ...updatedResults[j], status: "success" };
      }
      updatedResults[i] = { ...updatedResults[i], status: "running" };
      setStepResults(updatedResults);
      stepResultsRef.current = updatedResults;

      try {
        await updateWorkflowRun(run.id, {
          current_step: i,
          step_results: updatedResults,
        });
      } catch {
        // Non-blocking
      }

      const startTime = Date.now();

      try {
        const result = await runStep(i, abort.signal);
        const duration = Date.now() - startTime;
        outputs.push(result.text);

        // Update duration on the message
        setChatMessages((prev) =>
          prev.map((m) =>
            m.type === "step" && m.stepIndex === i
              ? { ...m, durationMs: duration }
              : m
          )
        );

        updatedResults[i] = {
          ...updatedResults[i],
          status: "success",
          output: result.text,
          durationMs: duration,
          files: result.files.length > 0 ? result.files : undefined,
        };
        setStepResults([...updatedResults]);
        stepResultsRef.current = [...updatedResults];

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
        const errorMsg = err instanceof Error ? err.message : "Unknown error";

        // Update the streaming message to show error
        if (streamingMsgId.current) {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgId.current
                ? { ...m, content: `Error: ${errorMsg}`, isStreaming: false, durationMs: duration }
                : m
            )
          );
        }

        updatedResults[i] = {
          ...updatedResults[i],
          status: "failed",
          error: errorMsg,
          durationMs: duration,
        };
        setStepResults([...updatedResults]);
        stepResultsRef.current = [...updatedResults];
        setOverallStatus("failed");
        setIsRunning(false);
        setAgentStatus(workflow.steps[i].agentId, "idle");

        // Add system error message
        setChatMessages((prev) => [
          ...prev,
          {
            id: genId(),
            type: "system",
            content: `Step ${i + 1} failed: ${errorMsg}`,
          },
        ]);

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
      setOverallStatus("success");
      setIsRunning(false);

      // Add completion system message
      setChatMessages((prev) => [
        ...prev,
        {
          id: genId(),
          type: "system",
          content: `All ${workflow.steps.length} steps completed successfully.`,
        },
      ]);

      // Generate summary for follow-up chat
      generateWorkflowSummary(outputs);

      try {
        // Get the latest step_results from state
        let finalResults: typeof initialResults = [];
        setStepResults((prev) => { finalResults = prev; return prev; });

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
  }, [workflow, initStepResults, runStep, generateWorkflowSummary, onComplete]);

  const resumeAndContinue = useCallback(async (run: WorkflowRun) => {
    if (!run.session_id) return false;

    const runningIdx = run.step_results.findIndex((s) => s.status === "running");
    if (runningIdx < 0) return false;

    // Guard against double-invocation trampling shared refs.
    if (resumeActiveRef.current) return false;

    resumeActiveRef.current = true;

    // Bind refs for the continuation loop — same as executeWorkflow.
    runIdRef.current = run.id;
    sessionIdRef.current = run.session_id;
    stepResultsRef.current = [...run.step_results];

    const abort = new AbortController();
    abortRef.current = abort;
    const outputs = run.step_results
      .slice(0, runningIdx)
      .filter((r) => r.output)
      .map((r) => r.output!);

    setCurrentStep(runningIdx);
    setIsRunning(true);
    setOverallStatus("running");

    // Step 1: resume the in-flight step.
    try {
      const startTime = Date.now();
      const result = await resumeStep(runningIdx, run.session_id, abort.signal);
      const duration = Date.now() - startTime;
      outputs.push(result.text);

      const updated = [...stepResultsRef.current];
      updated[runningIdx] = {
        ...updated[runningIdx],
        status: "success",
        output: result.text,
        durationMs: duration,
        files: result.files.length > 0 ? result.files : undefined,
      };
      setStepResults([...updated]);
      stepResultsRef.current = [...updated];
      setChatMessages((prev) =>
        prev.map((m) =>
          m.type === "step" && m.stepIndex === runningIdx
            ? { ...m, durationMs: duration }
            : m
        )
      );
      await updateWorkflowRun(run.id, {
        current_step: runningIdx + 1,
        step_results: updated,
      });
    } catch (err) {
      if (abort.signal.aborted) {
        // User-initiated stop during the resumed step. Clear the UI
        // running flag but leave the step marked "running" in DB so a
        // future reopen can still resume if the server-side session
        // actually finished in the meantime.
        setIsRunning(false);
        return true;
      }
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      const updated = [...stepResultsRef.current];
      updated[runningIdx] = {
        ...updated[runningIdx],
        status: "failed",
        error: errorMsg,
      };
      setStepResults([...updated]);
      stepResultsRef.current = [...updated];
      setOverallStatus("failed");
      setIsRunning(false);
      try {
        await updateWorkflowRun(run.id, {
          status: "failed",
          step_results: updated,
          completed_at: new Date().toISOString(),
        });
      } catch { /* non-blocking */ }
      return true;
    }

    // Step 2+: run remaining steps via the existing runStep loop.
    let abortedDuringLoop = false;
    for (let i = runningIdx + 1; i < workflow.steps.length; i++) {
      if (abort.signal.aborted) { abortedDuringLoop = true; break; }

      setCurrentStep(i);
      setToolStatus(null);
      const updatedResults = [...stepResultsRef.current];
      updatedResults[i] = { ...updatedResults[i], status: "running" };
      setStepResults(updatedResults);
      stepResultsRef.current = updatedResults;
      try {
        await updateWorkflowRun(run.id, {
          current_step: i,
          step_results: updatedResults,
        });
      } catch { /* non-blocking */ }

      const startTime = Date.now();
      try {
        const result = await runStep(i, abort.signal);
        const duration = Date.now() - startTime;
        outputs.push(result.text);
        setChatMessages((prev) =>
          prev.map((m) =>
            m.type === "step" && m.stepIndex === i
              ? { ...m, durationMs: duration }
              : m
          )
        );
        updatedResults[i] = {
          ...updatedResults[i],
          status: "success",
          output: result.text,
          durationMs: duration,
          files: result.files.length > 0 ? result.files : undefined,
        };
        setStepResults([...updatedResults]);
        stepResultsRef.current = [...updatedResults];
        try {
          await updateWorkflowRun(run.id, {
            current_step: i + 1,
            step_results: updatedResults,
          });
        } catch { /* non-blocking */ }
      } catch (err) {
        if (abort.signal.aborted) { abortedDuringLoop = true; break; }
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        updatedResults[i] = {
          ...updatedResults[i],
          status: "failed",
          error: errorMsg,
        };
        setStepResults([...updatedResults]);
        stepResultsRef.current = [...updatedResults];
        setOverallStatus("failed");
        setIsRunning(false);
        try {
          await updateWorkflowRun(run.id, {
            status: "failed",
            step_results: updatedResults,
            completed_at: new Date().toISOString(),
          });
        } catch { /* non-blocking */ }
        return true;
      }
    }

    // Abort short-circuits the success block — the user stopped the run,
    // we must not mark it as success.
    if (abortedDuringLoop) {
      setIsRunning(false);
      return true;
    }

    // All done.
    const finalResults = [...stepResultsRef.current];
    setOverallStatus("success");
    setIsRunning(false);
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
    } catch { /* non-blocking */ }

    // Defensive: clear the polling lockout so if onComplete doesn't unmount
    // the component, the DB polling effect can still kick in for any late
    // state updates.
    resumeActiveRef.current = false;

    if (outputs.length > 0) generateWorkflowSummary(outputs);
    onComplete();
    return true;
  }, [workflow, resumeStep, runStep, generateWorkflowSummary, onComplete]);

  // Poll the database for run progress (for background server execution)
  useEffect(() => {
    if (!isPollingMode || !existingRun) return;

    let active = true;
    let recoveryTriggered = false;
    let lastStepResultsHash = "";

    const pollInterval = setInterval(async () => {
      if (!active || resumeActiveRef.current) return;
      try {
        const run = await getWorkflowRunById(existingRun.id);
        if (!run || !active) return;

        // Auto-recovery: if still "running" but no DB changes for 20 min, trigger recovery
        if (run.status === "running" && !recoveryTriggered) {
          const currentHash = JSON.stringify(run.step_results.map(s => s.status + (s.output?.length || 0)));
          if (currentHash === lastStepResultsHash) {
            // No change since last poll — check if stale
            const updatedAt = run.completed_at || run.started_at;
            const staleMs = Date.now() - new Date(updatedAt).getTime();
            // Also check the last step result update time heuristically
            const lastRunningStep = run.step_results.findIndex(s => s.status === "running");
            const hasPartialOutput = lastRunningStep >= 0 && run.step_results[lastRunningStep].output;

            if (staleMs > 20 * 60 * 1000 || (staleMs > 5 * 60 * 1000 && !hasPartialOutput && lastStepResultsHash === currentHash)) {
              // Stale for 20 min (or 5 min with no output) — try recovery
              console.log("[WorkflowPoll] Run appears stale, triggering recovery...");
              recoveryTriggered = true;
              try {
                const resp = await fetch("/api/workflows/recover", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ runId: run.id }),
                });
                const result = await resp.json();
                console.log("[WorkflowPoll] Recovery result:", result);
              } catch { /* will pick up on next poll */ }
              return; // Skip this poll cycle, next cycle will read recovered data
            }
          }
          lastStepResultsHash = currentHash;
        }

        // Update step results and current step
        setStepResults(run.step_results);
        setCurrentStep(run.current_step);

        // Rebuild chat messages from step results
        const msgs: ChatMessage[] = [];
        for (let i = 0; i < run.step_results.length; i++) {
          const result = run.step_results[i];
          const step = workflow.steps[i];
          const agent = step ? findAgent(step.agentId) : null;
          if (result.output || result.error || result.status === "running") {
            msgs.push({
              id: `poll_step_${i}`,
              type: "step",
              stepIndex: i,
              agentId: step?.agentId,
              agentLabel: agent?.label || "Employee",
              agentAvatar: agent?.avatar,
              durationMs: result.durationMs,
              generatedFiles: result.files as GeneratedFile[] | undefined,
              toolActivity: result.toolActivity as ToolActivity[] | undefined,
              content: result.output || result.error || "",
              isStreaming: result.status === "running",
            });
          }
        }

        // Check for completion
        if (run.status !== "running") {
          clearInterval(pollInterval);
          setIsRunning(false);
          setOverallStatus(run.status === "success" ? "success" : "failed");

          if (run.status === "success") {
            msgs.push({ id: genId(), type: "system", content: `All ${run.total_steps} steps completed successfully.` });
            const outputs = run.step_results.filter(r => r.output).map(r => r.output!);
            if (outputs.length > 0) generateWorkflowSummary(outputs);
          } else if (run.status === "cancelled") {
            msgs.push({ id: genId(), type: "system", content: "Workflow was stopped by user." });
          } else {
            const failedStep = run.step_results.find(r => r.status === "failed");
            msgs.push({ id: genId(), type: "system", content: failedStep?.error ? `Workflow failed: ${failedStep.error}` : "Workflow failed." });
          }

          // Restore follow-up messages
          if (run.follow_up_messages) {
            for (const fm of run.follow_up_messages) {
              if (fm.type === "user") {
                msgs.push({ id: genId(), type: "user", content: fm.content });
              } else {
                msgs.push({ id: genId(), type: "assistant", agentLabel: "General Assistant", agentAvatar: "/pink.png", content: fm.content, toolActivity: fm.toolActivity as ToolActivity[] | undefined, generatedFiles: fm.generatedFiles as GeneratedFile[] | undefined });
              }
            }
          }

          onComplete();
        }

        setChatMessages(msgs);
      } catch {
        // Non-blocking polling error
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPollingMode]);

  // Start on mount (history mode only — polling/execute handled separately)
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    if (isHistoryMode) {
      // Cached demo runs don't need a generated summary — that would hit
      // an AI endpoint just to recap content the user is seeing in the
      // banner anyway. Skip it; the chat panel renders fine without one.
      if (!cachedMode) {
        const outputs = existingRun!.step_results
          .filter((r) => r.output)
          .map((r) => r.output!);
        if (outputs.length > 0) generateWorkflowSummary(outputs);
      }
      return;
    }

    if (isPollingMode && existingRun) {
      // Try to resume the in-flight Anthropic session directly. If there's
      // no session_id, or no running step, or resume throws unexpectedly,
      // we fall through to the existing DB-polling useEffect.
      resumeAndContinue(existingRun).then((handled) => {
        if (!handled) {
          // Not handled — re-enable DB polling fallback.
          resumeActiveRef.current = false;
          console.log("[WorkflowRunView] Resume not applicable — falling back to DB polling");
        }
      }).catch((err) => {
        // Unexpected failure — re-enable DB polling fallback.
        resumeActiveRef.current = false;
        console.error("[WorkflowRunView] Resume failed, falling back to DB polling:", err);
      });
      return;
    }

    if (!isPollingMode) {
      // Fresh run without existingRun — legacy path (shouldn't happen with new flow)
      executeWorkflow();
    }

    return () => {
      abortRef.current?.abort();
      workflow.steps.forEach((s) => setAgentStatus(s.agentId, "idle"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = async () => {
    // For polling mode: request server-side cancellation
    const rid = runIdRef.current || existingRun?.id;
    if (rid) {
      try {
        await fetch("/api/workflows/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: rid }),
        });
      } catch { /* non-blocking */ }
    }
    abortRef.current?.abort();
    setIsRunning(false);
    setOverallStatus("failed");
    setToolStatus(null);
    workflow.steps.forEach((s) => setAgentStatus(s.agentId, "idle"));
    setChatMessages((prev) => [
      ...prev,
      { id: genId(), type: "system", content: "Workflow stopped by user." },
    ]);
  };

  // --- Post-completion chat ---
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isChatStreaming) return;

    // Add user message
    const userMsgId = genId();
    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, type: "user", content: text },
    ]);
    setInputText("");
    setIsChatStreaming(true);
    setAgentStatus("general_assistant", "working");

    // Add streaming assistant message
    const assistantMsgId = genId();
    setChatMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        type: "assistant",
        agentLabel: "General Assistant",
        agentAvatar: "/pink.png",
        content: "",
        isStreaming: true,
      },
    ]);

    chatHistoryRef.current.push({ role: "user", content: text });

    // Hoisted so the catch/finally can see the partial state when the
    // stream dies. Previously these were try-scoped, so an error lost
    // everything the assistant had already streamed.
    let responseText = "";
    const chatTools: ToolActivity[] = [];
    const chatFiles: GeneratedFile[] = [];

    // Throttled flush of the entire chatMessages array into
    // workflow_runs.follow_up_messages. We read the latest React state
    // via a functional setter no-op (React skips the re-render when the
    // returned reference is unchanged). The flush mirrors the 2s cadence
    // in team/chat and goal-chat-panel for consistency.
    let flushInFlight = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let finalized = false;

    const flushNow = async () => {
      if (flushInFlight || finalized) return;
      flushInFlight = true;
      let latestMsgs: ChatMessage[] = [];
      setChatMessages((prev) => { latestMsgs = prev; return prev; });
      try {
        await saveFollowUpMessages(latestMsgs);
      } catch {
        // Non-blocking
      }
      flushInFlight = false;
    };

    const scheduleFlush = () => {
      if (flushTimer || finalized) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushNow();
      }, 2000);
    };

    try {
      if (sessionIdRef.current) {
        // Live mode — continue the Managed Agent session (full context preserved)
        const res = await fetch("/api/ai/agent-run-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            message: text,
            knownFileIds: knownFileIdsRef.current,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `API error: ${res.status}`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.trim());

          for (const line of lines) {
            if (line.startsWith("event:")) continue;
            const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            if (event.type === "error") {
              throw new Error((event.message as string) || "Something went wrong. Please try again.");
            }

            if (event.type === "tool_use") {
              const toolName = (event.name as string) || "unknown";
              const labels: Record<string, string> = {
                web_search: "Searching the web...",
                web_fetch: "Fetching webpage...",
                code_execution: "Running code...",
              };
              chatTools.push({
                type: toolName.includes("web_search") ? "web_search" : toolName.includes("web_fetch") ? "web_fetch" : "code_execution",
                label: labels[toolName] || `Using ${toolName}...`,
              });
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, toolActivity: [...chatTools] } : m
                )
              );
              scheduleFlush();
            }

            if (event.type === "content") {
              responseText = event.text as string;
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: responseText, toolActivity: chatTools.length > 0 ? [...chatTools] : undefined }
                    : m
                )
              );
              scheduleFlush();
            }

            if (event.type === "file") {
              const newFile: GeneratedFile = {
                fileId: event.fileId as string,
                filename: event.filename as string,
              };
              chatFiles.push(newFile);
              knownFileIdsRef.current.push(newFile.fileId);
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, generatedFiles: [...chatFiles] } : m
                )
              );
              scheduleFlush();
            }

            if (event.type === "done") {
              responseText = (event.text as string) || responseText;
            }
          }
        }
      } else {
        // History mode — use agent-chat with summary context (no session available).
        // Client-driven continuation loop: each iteration is a separate
        // HTTP request with its own Vercel timeout budget.
        const systemContext = workflowSummary
          ? `The user just ran a workflow called "${workflow.name}". Here is a summary of the workflow outputs:\n\n${workflowSummary}\n\nNow the user wants to discuss or refine the results.`
          : `The user just ran a workflow called "${workflow.name}". Help them with any follow-up questions.`;

        const MAX_CONTINUATIONS = 10;
        const body = {
          promptFile: "general_assistant.txt",
          messages: chatHistoryRef.current,
          extraContext: systemContext,
        };

        for (let turn = 0; turn < MAX_CONTINUATIONS; turn++) {
          const res = await fetch("/api/ai/agent-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || `API error: ${res.status}`);
        }

          let turnComplete: {
            stop_reason: string;
            finalContent: unknown[];
          } | null = null;

          for await (const rawEvent of parseSSEStream(res)) {
            const event = rawEvent as Record<string, any>;
            if (event.type === "turn_complete") {
              turnComplete = {
                stop_reason: event.stop_reason as string,
                finalContent: event.finalContent as unknown[],
              };
              continue;
            }

            if (event.type === "error") {
              throw new Error(
                (event.error as { message?: string })?.message ||
                (event.message as string) ||
                "Something went wrong. Please try again."
              );
            }

            if (
              event.type === "content_block_delta" &&
              event.delta?.type === "text_delta" &&
              event.delta.text
            ) {
              responseText += event.delta.text;
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: responseText }
                    : m
                )
              );
              scheduleFlush();
            }

            if (event.type === "content_block_start" && event.content_block?.type === "server_tool_use") {
              const toolName = event.content_block.name as string;
              const labels: Record<string, string> = {
                web_search: "Searching the web...",
                web_fetch: "Fetching webpage...",
                bash_code_execution: "Running code...",
              };
              chatTools.push({
                type: toolName.includes("web_search") ? "web_search" : toolName.includes("web_fetch") ? "web_fetch" : "code_execution",
                label: labels[toolName] || `Using ${toolName}...`,
              });
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, toolActivity: [...chatTools] } : m
                )
              );
              scheduleFlush();
            }
          }

          // If pause_turn, append assistant content and loop (new HTTP).
          if (turnComplete?.stop_reason === "pause_turn") {
            (body.messages as unknown[]).push({
              role: "assistant",
              content: turnComplete.finalContent,
            });
            continue;
          }

          break;
        }
      }

      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
              ...m,
              content: responseText,
              isStreaming: false,
              toolActivity: chatTools.length > 0 ? chatTools : undefined,
              generatedFiles: chatFiles.length > 0 ? chatFiles : undefined,
            }
            : m
        )
      );
      chatHistoryRef.current.push({ role: "assistant", content: responseText });

      // Finalize — cancel any pending throttled flush and do one synchronous
      // final save so the last delta definitely lands (not left to the 2s
      // timer that may be cleared in finally before firing).
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      finalized = true;
      let latestMsgs: ChatMessage[] = [];
      setChatMessages((prev) => { latestMsgs = prev; return prev; });
      if (latestMsgs.length > 0) {
        saveFollowUpMessages(latestMsgs);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Something went wrong";
      // Preserve whatever the assistant had produced so far + mark
      // interrupted. The new message content is either the partial
      // responseText (if anything streamed) or the error string as a
      // fallback. The interrupted flag propagates into follow_up_messages
      // via saveFollowUpMessages so reload shows the warning badge.
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
              ...m,
              content: responseText || `Error: ${errMsg}`,
              isStreaming: false,
              toolActivity: chatTools.length > 0 ? chatTools : undefined,
              generatedFiles: chatFiles.length > 0 ? chatFiles : undefined,
              interrupted: true,
            }
            : m
        )
      );
      // Also push partial text into the local history so a follow-up
      // send continues the conversation naturally on retry.
      if (responseText) {
        chatHistoryRef.current.push({ role: "assistant", content: responseText });
      }
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      finalized = true;
      let latestMsgs: ChatMessage[] = [];
      setChatMessages((prev) => { latestMsgs = prev; return prev; });
      if (latestMsgs.length > 0) {
        try {
          await saveFollowUpMessages(latestMsgs);
        } catch {
          // Non-blocking
        }
      }
    } finally {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      setIsChatStreaming(false);
      setAgentStatus("general_assistant", "idle");
    }
  }, [inputText, isChatStreaming, workflowSummary, workflow.name, saveFollowUpMessages]);

  // --- Deliverables ---
  const deliverableItems = useMemo<DeliverableItem[]>(() => {
    const items: DeliverableItem[] = [];
    const now = new Date();
    for (const msg of chatMessages) {
      if (msg.generatedFiles && msg.generatedFiles.length > 0) {
        const source =
          msg.type === "step" && msg.stepIndex !== undefined
            ? `Step ${msg.stepIndex + 1}`
            : "Follow-up chat";
        for (const f of msg.generatedFiles) {
          items.push({
            fileId: f.fileId,
            filename: f.filename,
            source,
            createdAt: existingRun ? new Date(existingRun.started_at) : now,
          });
        }
      }
    }
    return items;
  }, [chatMessages, existingRun]);

  // --- Render ---
  const canChat = overallStatus === "success" || overallStatus === "failed";

  return (
    <div className="fixed inset-0 z-40 ml-20 mt-16 flex flex-col bg-[#F6F3EE] overflow-hidden">
      {/* Cached demo banner — only shown when this is a cached template run.
          Communicates clearly that the user is looking at pre-recorded output
          so they don't mistake it for a fresh run they just triggered. */}
      {cachedMode && (
        <div className="border-b border-[#D4B06A]/30 bg-[#D4B06A]/10 px-6 py-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-[#C99442] mt-0.5 shrink-0" />
          <div className="text-sm text-[#2B2B2B] min-w-0">
            <p className="font-medium">This is a cached demo run</p>
            <p className="text-xs text-[#6F6A64] mt-0.5">
              Your topic matches the default — we&apos;re showing you a previous successful output so you can see what this workflow produces. Edit the topic and run again to see it execute on your own input.
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#FFFDF9] border-b border-[#E7DED2]">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[#2B2B2B]">
            {workflow.name}
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
          <DeliverablesButton items={deliverableItems} />
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
      <div className="px-6 py-4 bg-[#FFFDF9] border-b border-[#E7DED2]">
        <div className="flex items-center justify-center gap-0">
          {workflow.steps.map((step, idx) => {
            const result = stepResults[idx];
            const status = result?.status || "pending";
            let dotColor = "#DDD3C7";
            if (status === "success") dotColor = "#7FB38A";
            else if (status === "running") dotColor = "#7FAEE6";
            else if (status === "failed") dotColor = "#D5847A";

            const agent = findAgent(step.agentId);
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-4 h-4 rounded-full border-2 ${status === "running" ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: dotColor, borderColor: dotColor }}
                  />
                  <span className="text-[10px] text-[#9B948B] mt-1 max-w-[80px] truncate text-center">
                    {agent?.label || "Employee"}
                  </span>
                </div>
                {idx < workflow.steps.length - 1 && (
                  <div
                    className="w-12 h-0.5 mx-1 mt-[-12px]"
                    style={{
                      backgroundColor:
                        stepResults[idx]?.status === "success" ? "#7FB38A" : "#E7DED2",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {chatMessages.map((msg) => {
          // System message — centered
          if (msg.type === "system") {
            const isError = msg.content.toLowerCase().includes("fail") || msg.content.toLowerCase().includes("error") || msg.content.toLowerCase().includes("stopped");
            return (
              <div key={msg.id} className="flex justify-center">
                <div className={`text-xs font-medium px-4 py-2 rounded-full ${isError ? "bg-[#D5847A]/10 text-[#D5847A]" : "bg-[#7FB38A]/10 text-[#7FB38A]"}`}>
                  {isError ? "⚠️" : "✅"} {msg.content}
                </div>
              </div>
            );
          }

          // User message — right aligned
          if (msg.type === "user") {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[75%] rounded-xl px-4 py-3 text-sm bg-[#7FAEE6] text-white">
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
              </div>
            );
          }

          // Step output or assistant reply — left aligned with avatar
          return (
            <div key={msg.id} className="flex justify-start gap-3">
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[#F1ECE4] mt-1">
                <Image
                  src={msg.agentAvatar || DEFAULT_AGENT_AVATAR}
                  alt={msg.agentLabel || "Employee"}
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Message bubble */}
              <div className="max-w-[80%] min-w-0">
                {/* Agent name + step badge + duration */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-[#2B2B2B]">
                    {msg.agentLabel || "General Assistant"}
                  </span>
                  {msg.type === "step" && msg.stepIndex !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1ECE4] text-[#9B948B] font-medium">
                      Step {msg.stepIndex + 1}
                    </span>
                  )}
                  <LiveTimer
                    active={!!msg.isStreaming}
                    durationMs={msg.durationMs}
                  />
                </div>

                <div className="rounded-xl bg-[#FFFDF9] border border-[#E7DED2] px-4 py-3 text-sm text-[#2B2B2B]">
                  {/* Tool activity badges */}
                  {msg.toolActivity && msg.toolActivity.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.toolActivity.map((tool, i) => {
                        const isLatest = msg.isStreaming && i === msg.toolActivity!.length - 1;
                        return (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
                              isLatest
                                ? "bg-[#7FAEE6]/15 text-[#7FAEE6] shadow-[0_0_12px_rgba(127,174,230,0.2)]"
                                : "bg-[#F1ECE4] text-[#6F6A64]"
                            }`}
                          >
                            {isLatest && (
                              <span className="relative flex h-2 w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7FAEE6] opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7FAEE6]" />
                              </span>
                            )}
                            {tool.type === "web_search" ? (
                              <Globe className="h-3.5 w-3.5" />
                            ) : tool.type === "web_fetch" ? (
                              <Globe className="h-3.5 w-3.5" />
                            ) : (
                              <Code className="h-3.5 w-3.5" />
                            )}
                            {tool.label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Content */}
                  {msg.content ? (
                    <div className="prose-chat max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                      {msg.isStreaming && !msg.toolActivity?.length && (
                        <span className="inline-block ml-0.5 animate-pulse">|</span>
                      )}
                      {msg.interrupted && !msg.isStreaming && (
                        <div className="mt-2 pt-2 border-t border-[#E7DED2] text-[11px] text-[#C9843D]">
                          ⚠️ This response was interrupted. Send a new message to continue from here.
                        </div>
                      )}
                    </div>
                  ) : msg.isStreaming ? (
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7FAEE6] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7FAEE6] animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#7FAEE6] animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span className="text-sm text-[#7FAEE6] font-medium animate-pulse">
                        {msg.toolActivity && msg.toolActivity.length > 0
                          ? msg.toolActivity[msg.toolActivity.length - 1].label
                          : "Working..."}
                      </span>
                    </div>
                  ) : null}

                  {/* Generated files */}
                  {msg.generatedFiles && msg.generatedFiles.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-[#E7DED2] space-y-1.5">
                      {msg.generatedFiles.map((f, i) => {
                        // Cached runs attach `href` server-side (Storage URL) and may flag
                        // files as `missing` if Anthropic expired them during bootstrap.
                        // Live runs use the existing /api/ai/files/{fileId} pattern.
                        const cachedFile = f as GeneratedFile & { href?: string; missing?: boolean };
                        if (cachedFile.missing) {
                          return (
                            <span
                              key={i}
                              className="flex items-center gap-2 text-xs text-[#9B948B] italic"
                              title="This file expired and is no longer available"
                            >
                              <Download className="h-3.5 w-3.5 opacity-50" />
                              {f.filename} (expired)
                            </span>
                          );
                        }
                        const href = cachedFile.href ?? `/api/ai/files/${f.fileId}`;
                        const isExternal = !!cachedFile.href;
                        return (
                          <a
                            key={i}
                            href={href}
                            download={f.filename}
                            target={isExternal ? "_blank" : undefined}
                            rel={isExternal ? "noopener noreferrer" : undefined}
                            className="flex items-center gap-2 text-xs text-[#7FAEE6] hover:underline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {f.filename}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Streaming tool status when no text yet */}
        {isRunning && toolStatus && chatMessages.length > 0 && chatMessages[chatMessages.length - 1]?.content === "" && (
          <div className="ml-11 text-xs text-[#7FAEE6] font-medium flex items-center gap-2">
            <div className="relative w-2 h-2 shrink-0">
              <span className="absolute inset-0 rounded-full bg-[#7FAEE6] animate-ping opacity-75" />
              <span className="relative block w-2 h-2 rounded-full bg-[#7FAEE6]" />
            </div>
            {toolStatus}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-6 py-3 border-t border-[#E7DED2] bg-[#FFFDF9]">
        {canChat ? (
          <div className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about the results, request changes..."
              disabled={isChatStreaming}
              rows={2}
              className="flex-1 px-4 py-3 text-sm bg-[#F6F3EE] border border-[#DDD3C7] rounded-xl outline-none placeholder:text-[#9B948B] text-[#2B2B2B] disabled:opacity-50 resize-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-[#7FAEE6]/50 transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isChatStreaming}
              className="px-4 py-3 rounded-xl bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-[#9B948B]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#7FAEE6] animate-pulse" />
            Workflow is running... Chat will be available after completion.
          </div>
        )}
      </div>
    </div>
  );
}
