"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { X, Send, Paperclip, FileText, Globe, Code, Download, Maximize2, Minimize2 } from "lucide-react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslations } from "next-intl";
import type { GoalDetailChatContext } from "@/lib/ai/goal-detail-chat";
import type { DailyTask } from "@/lib/types/database";
import {
  getOrCreateGoalSession,
  getSessionMessages,
  saveMessage,
  upsertAssistantMessage,
  updateSessionSummary,
} from "@/lib/db/actions";
import { buildMessagesWithMemory, MAX_RECENT_MESSAGES } from "@/lib/ai/session-memory";
import { setAgentStatus } from "@/lib/stores/agent-status";
import { processFile, buildContentBlocks, ACCEPTED_FILE_TYPES, type FileAttachment } from "@/lib/utils/file-upload";
import { parseSSEStream } from "@/lib/utils/sse-parser";
import { LiveTimer } from "@/components/ui/live-timer";

interface GoalChatPanelProps {
  goalId: string;
  goalContext: GoalDetailChatContext;
  taskContext?: DailyTask | null;
  onClose: () => void;
  panelTitle?: string;
}

interface GeneratedFile {
  fileId: string;
  filename: string;
}

interface ToolActivity {
  type: "web_search" | "web_fetch" | "code_execution";
  label: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: FileAttachment[];
  toolActivity?: ToolActivity[];
  generatedFiles?: GeneratedFile[];
  /** True when the assistant turn's stream was cut off (Vercel maxDuration,
   *  tab close, etc). Mirrored from chat_messages.metadata.interrupted so
   *  reloading the panel still shows the "continue from here" warning. */
  interrupted?: boolean;
  /** True when the AI request was rejected because the user is out of
   *  credits / monthly allowance (HTTP 402, code=QUOTA_EXCEEDED). Renders
   *  a dedicated block linking to /account instead of the generic
   *  interrupted warning. */
  quotaExceeded?: boolean;
}

interface ApiMessage {
  role: "user" | "assistant";
  content: string | object[];
}

let counter = 0;
function genId() {
  return `gcm_${Date.now()}_${++counter}`;
}

// --- Resize hook ---
function useResize(initialWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(initialWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startX.current - ev.clientX; // dragging left = wider
      const newW = Math.min(maxWidth, Math.max(minWidth, startW.current + delta));
      setWidth(newW);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [width, minWidth, maxWidth]);

  return { width, onMouseDown };
}

export function GoalChatPanel({ goalId, goalContext, taskContext, onClose, panelTitle }: GoalChatPanelProps) {
  const t = useTranslations("goals.chatPanel");
  const tCommon = useTranslations("common");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<ApiMessage[]>([]);
  const startedRef = useRef(false);
  // Default to the max width so the panel feels generous on first open;
  // the user can still drag the handle leftward to anything ≥ 360.
  const { width: panelWidth, onMouseDown: onResizeMouseDown } = useResize(520, 360, 720);

  // Load session and history from DB
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const session = await getOrCreateGoalSession(goalId);
        if (cancelled) return;
        setSessionId(session.id);
        setSessionSummary(session.summary || null);
        const dbMessages = await getSessionMessages(session.id, 50);
        if (cancelled) return;
        const uiMsgs: Message[] = dbMessages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          generatedFiles: m.metadata?.generatedFiles as GeneratedFile[] | undefined,
          toolActivity: m.metadata?.toolActivity as ToolActivity[] | undefined,
          // Either an explicit interrupt marker or a partial row where the
          // final flush never happened — both render the same warning.
          interrupted: Boolean(m.metadata?.interrupted) || Boolean(m.metadata?.partial),
          quotaExceeded: Boolean(m.metadata?.quotaExceeded),
        }));
        setMessages(uiMsgs);
        historyRef.current = dbMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      } catch (err) {
        console.error("Failed to load session:", err);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [goalId]);

  // --- Build API content blocks ---
  function buildApiContent(text: string, attachments?: FileAttachment[]): string | object[] {
    return buildContentBlocks(text, attachments);
  }

  const sendToApi = useCallback(async (apiMessages: ApiMessage[]) => {
    setIsStreaming(true);
    setAgentStatus("general_assistant", "working");
    const assistantId = genId();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    // Hoisted so the catch/finally can see whatever partial state we had
    // when the stream died. The pattern mirrors team/chat — see
    // apps/web/src/app/(app)/team/chat/[agentId]/page.tsx sendToApi.
    let text = "";
    const tools: ToolActivity[] = [];
    const files: GeneratedFile[] = [];

    // Create the DB placeholder up front so incremental flushes have a
    // target row to update. If sessionId isn't ready or the insert fails,
    // fall back to the legacy saveMessage-on-completion path.
    let assistantDbId: string | null = null;
    if (sessionId) {
      try {
        const placeholder = await upsertAssistantMessage({
          sessionId,
          messageId: null,
          content: "",
          metadata: { partial: true },
        });
        assistantDbId = placeholder.id;
      } catch (err) {
        console.error("[goal-chat] Failed to create assistant placeholder:", err);
      }
    }

    // Throttled flush: at most one DB upsert every 2s. Debounced via a
    // single setTimeout handle + an in-flight guard so rapid events don't
    // cause overlapping writes. `finalized` short-circuits any late
    // scheduler firings after the success/error finalize has run.
    let flushInFlight = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let finalized = false;

    const flushNow = async () => {
      if (flushInFlight || finalized || !assistantDbId || !sessionId) return;
      flushInFlight = true;
      try {
        await upsertAssistantMessage({
          sessionId,
          messageId: assistantDbId,
          content: text,
          metadata: {
            partial: true,
            ...(tools.length > 0 ? { toolActivity: tools } : {}),
            ...(files.length > 0 ? { generatedFiles: files } : {}),
          },
        });
      } catch {
        // Non-blocking; next flush will retry with the newer state
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
      // Client-driven continuation loop: each iteration is a separate
      // HTTP request with its own Vercel timeout budget.
      const MAX_CONTINUATIONS = 10;
      const body = {
        action: "goal-session",
        intent: "coach",
        context: { coach: goalContext },
        messages: buildMessagesWithMemory(sessionSummary, apiMessages),
      };

      for (let turn = 0; turn < MAX_CONTINUATIONS; turn++) {
        const res = await fetch("/api/ai/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const baseMsg = body?.error || `API error: ${res.status}`;
          // Tag quota errors so the catch handler can show a credits-
          // specific UI block (link to /account) instead of the generic
          // interrupted warning.
          if (body?.code === "QUOTA_EXCEEDED" || res.status === 402) {
            throw new Error(`QUOTA_EXCEEDED:${baseMsg}`);
          }
          throw new Error(baseMsg);
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
              t("errorGeneric")
            );
          }

          // Text content
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            text += event.delta.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: text, toolActivity: tools.length > 0 ? [...tools] : undefined, generatedFiles: files.length > 0 ? [...files] : undefined } : m))
            );
            scheduleFlush();
          }

          // Server-side tool use started
          if (event.type === "content_block_start" && event.content_block?.type === "server_tool_use") {
            const toolName = event.content_block.name as string;
            const labels: Record<string, string> = {
              web_search: t("toolWebSearch"),
              web_fetch: t("toolWebSearch"),
              bash_code_execution: t("toolBash"),
              text_editor_code_execution: t("toolEditor"),
            };
            const activity: ToolActivity = {
              type: toolName.includes("web_search") ? "web_search" : toolName.includes("web_fetch") ? "web_fetch" : "code_execution",
              label: labels[toolName] || `Using ${toolName}...`,
            };
            tools.push(activity);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, toolActivity: [...tools] } : m))
            );
            scheduleFlush();
          }

          // Code execution result — check for generated files
          if (event.type === "content_block_start" && (event.content_block?.type === "bash_code_execution_tool_result" || event.content_block?.type === "code_execution_tool_result")) {
            const result = event.content_block.content;
            if (result?.content && Array.isArray(result.content)) {
              for (const item of result.content) {
                if ((item.type === "bash_code_execution_output" || item.type === "code_execution_output") && item.file_id) {
                  files.push({ fileId: item.file_id, filename: item.filename || "download" });
                }
              }
              if (files.length > 0) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, generatedFiles: [...files] } : m))
                );
                scheduleFlush();
              }
            }
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

      // Resolve real filenames for code-execution-generated files.
      // Anthropic's SSE `code_execution_output` block only carries
      // `file_id`; the actual filename lives in the Files API metadata.
      // Without this hop the UI would show "download" for every file.
      if (files.length > 0) {
        try {
          const res = await fetch("/api/ai/files/metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileIds: files.map((f) => f.fileId) }),
          });
          if (res.ok) {
            const { files: nameMap } = (await res.json()) as { files: Record<string, string> };
            for (const f of files) {
              const resolved = nameMap[f.fileId];
              if (resolved) f.filename = resolved;
            }
          }
        } catch {
          // Non-blocking — keep "download" fallback if metadata lookup fails.
        }
      }

      // Final update with all accumulated data
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? {
          ...m,
          content: text,
          toolActivity: tools.length > 0 ? tools : undefined,
          generatedFiles: files.length > 0 ? files : undefined,
        } : m))
      );

      historyRef.current.push({ role: "assistant", content: text });

      // Finalize the DB row with partial=false. Cancel any pending flush
      // so a late timer doesn't overwrite our final write with a stale
      // partial snapshot.
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      finalized = true;
      if (sessionId && text) {
        const finalMetadata = (files.length > 0 || tools.length > 0) ? {
          partial: false,
          generatedFiles: files.length > 0 ? files : undefined,
          toolActivity: tools.length > 0 ? tools : undefined,
        } : { partial: false };
        if (assistantDbId) {
          try {
            await upsertAssistantMessage({
              sessionId,
              messageId: assistantDbId,
              content: text,
              metadata: finalMetadata,
            });
          } catch (err) {
            console.error("[goal-chat] Final upsert failed:", err);
          }
        } else {
          // Fallback: placeholder was never created. Fire the legacy
          // insert so we at least persist the completed turn.
          const legacyMetadata = (files.length > 0 || tools.length > 0) ? {
            generatedFiles: files.length > 0 ? files : undefined,
            toolActivity: tools.length > 0 ? tools : undefined,
          } : undefined;
          saveMessage(sessionId, "assistant", text, legacyMetadata).catch(console.error);
        }

        // Session memory: generate rolling summary when messages exceed threshold
        const totalMessages = historyRef.current.length;
        if (totalMessages > MAX_RECENT_MESSAGES && totalMessages % MAX_RECENT_MESSAGES === 1) {
          const messagesToCompress = historyRef.current.slice(0, -MAX_RECENT_MESSAGES).map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : "[media content]",
          }));
          fetch("/api/ai/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldSummary: sessionSummary, messages: messagesToCompress, sessionId }),
          })
            .then((r) => r.json())
            .then(async (data) => {
              if (data.summary) {
                setSessionSummary(data.summary);
                await updateSessionSummary(sessionId, data.summary);
              }
            })
            .catch(console.error);
        }
      }
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : t("errorGeneric");
      const isQuota = rawMsg.startsWith("QUOTA_EXCEEDED:");
      const msg = isQuota ? rawMsg.slice("QUOTA_EXCEEDED:".length) : rawMsg;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                // For quota errors we leave content empty and let the
                // dedicated block render the explanation + CTA. For all
                // other errors keep the legacy "Error: ..." fallback so
                // the user can still see what broke.
                content: isQuota ? text : (text || `Error: ${msg}`),
                interrupted: !isQuota,
                quotaExceeded: isQuota,
              }
            : m
        )
      );
      // Persist partial state + mark interrupted so reloading the panel
      // shows the warning and preserves whatever text/tools/files arrived
      // before the stream died. Also push the partial text into history
      // so the next send can continue the conversation naturally.
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      finalized = true;
      if (sessionId && assistantDbId) {
        try {
          await upsertAssistantMessage({
            sessionId,
            messageId: assistantDbId,
            content: text,
            metadata: {
              partial: false,
              ...(isQuota ? { quotaExceeded: true } : { interrupted: true }),
              ...(tools.length > 0 ? { toolActivity: tools } : {}),
              ...(files.length > 0 ? { generatedFiles: files } : {}),
            },
          });
        } catch {
          // Non-blocking
        }
      }
      if (text) {
        historyRef.current.push({ role: "assistant", content: text });
      }
    } finally {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      setIsStreaming(false);
      setAgentStatus("general_assistant", "idle");
    }
  }, [goalContext, sessionId, sessionSummary]);

  // --- Start conversation (only if no history loaded) ---
  //
  // With unified goal sessions (Phase 2 refactor), this session row now
  // carries the full goal-creation + weekly-planning history, so
  // `messages.length > 0` is the common case — the auto-greet path
  // below almost never fires for goals created post-refactor. It still
  // handles legacy goals that pre-date the refactor and have an empty
  // coach history.
  //
  // taskContext handling moved to its own effect below: instead of
  // auto-sending "Help me with this task…", we now pre-fill the input
  // so the user can edit before sending. Auto-sending would have
  // silently dropped on sessions with prior history (the common case).
  useEffect(() => {
    if (startedRef.current || loadingHistory) return;
    if (messages.length > 0) {
      startedRef.current = true;
      return;
    }
    startedRef.current = true;

    if (!taskContext) {
      const greeting: ApiMessage = { role: "user", content: "Hi! I'd like to discuss my goal." };
      historyRef.current = [greeting];
      sendToApi([greeting]);
    }
  }, [taskContext, sendToApi, loadingHistory, messages.length]);

  // --- Pre-fill input when the panel is opened via "send to bot" ---
  //
  // Works regardless of session-history state, unlike the pre-refactor
  // auto-send which bailed when the session was non-empty. User can
  // still edit the draft before hitting send.
  useEffect(() => {
    if (loadingHistory) return;
    if (!taskContext) return;
    const draft = `Help me with this task: "${taskContext.title}"${taskContext.time_slot ? ` (scheduled at ${taskContext.time_slot})` : ""}`;
    setInputText(draft);
    textareaRef.current?.focus();
  }, [taskContext, loadingHistory]);

  // --- Auto-scroll ---
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isStreaming]);

  // --- Focus ---
  useEffect(() => { setTimeout(() => textareaRef.current?.focus(), 200); }, []);

  // --- Escape to close ---
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // --- Handle paste for images ---
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const att = await processFile(file);
          setPendingAttachments((prev) => [...prev, att]);
        }
        return;
      }
    }
  };

  // --- Handle file input ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const att = await processFile(files[i]);
      setPendingAttachments((prev) => [...prev, att]);
    }
    e.target.value = "";
  };

  // --- Send ---
  const handleSend = () => {
    const text = inputText.trim();
    if ((!text && pendingAttachments.length === 0) || isStreaming) return;

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: text,
      attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Persist user message to DB
    if (sessionId && text) {
      saveMessage(sessionId, "user", text).catch(console.error);
    }

    const apiContent = buildApiContent(text, pendingAttachments.length > 0 ? pendingAttachments : undefined);
    const apiMsg: ApiMessage = { role: "user", content: apiContent };
    historyRef.current.push(apiMsg);
    sendToApi([...historyRef.current]);

    setInputText("");
    setPendingAttachments([]);
    textareaRef.current?.focus();
  };

  // --- Visible messages (hide initial hidden greeting) ---
  const displayMessages = !taskContext && messages.length > 0 && messages[0]?.content === "Hi! I'd like to discuss my goal."
    ? messages.slice(1)
    : messages;

  return (
    <div
      className={`fixed top-16 bottom-0 z-[45] border-l border-[#E7DED2] bg-[#F6F3EE] flex flex-col shadow-[0_0_48px_rgba(30,34,39,0.08)] ${
        isFullscreen ? "left-20 right-0" : "right-0"
      }`}
      style={isFullscreen ? undefined : { width: panelWidth }}
    >
      {/* Resize handle — hidden in fullscreen, since the panel spans the
          full content area and there's nothing to drag against. */}
      {!isFullscreen && (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#7C2DE8]/20 active:bg-[#7C2DE8]/30 transition-colors z-10"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[#E7DED2]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-[#F6F3EE]">
            <Image src="/pink.png" alt={t("agentLabel")} width={36} height={36} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-[#2B2B2B] block truncate">{t("agentLabel")}</span>
            {panelTitle && (
              <span className="text-[10px] text-[#9B948B]">{panelTitle}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsFullscreen((v) => !v)}
            aria-label={isFullscreen ? tCommon("exitFullscreen") : tCommon("enterFullscreen")}
            title={isFullscreen ? tCommon("exitFullscreen") : tCommon("enterFullscreen")}
            className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F6F3EE] hover:text-[#2B2B2B] transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F6F3EE] hover:text-[#2B2B2B] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {displayMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${msg.role === "user"
                ? "bg-[#7C2DE8] text-white"
                : "bg-[#FFFFFF] border border-[#E7DED2] text-[#2B2B2B]"
              }`}>
              {/* Agent name + timer for assistant messages */}
              {msg.role === "assistant" && (
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold text-[#6F6A64]">{t("agentLabel")}</span>
                  <LiveTimer active={isStreaming && msg === displayMessages[displayMessages.length - 1]} />
                </div>
              )}
              {/* Tool activity badges */}
              {msg.toolActivity && msg.toolActivity.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.toolActivity.map((tool, i) => {
                    const isLatest = isStreaming && msg === displayMessages[displayMessages.length - 1] && i === msg.toolActivity!.length - 1;
                    return (
                      <span key={i} className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full ${isLatest ? "bg-[#7C2DE8]/10 text-[#7C2DE8]" : "bg-[#F6F3EE] text-[#6F6A64]"}`}>
                        {isLatest && (
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7C2DE8] opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7C2DE8]" />
                          </span>
                        )}
                        {tool.type === "web_search" || tool.type === "web_fetch" ? (
                          <Globe className="h-3 w-3" />
                        ) : (
                          <Code className="h-3 w-3" />
                        )}
                        {tool.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* User attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {msg.attachments.map((att, i) =>
                    att.type === "image" && att.preview ? (
                      <img key={i} src={att.preview} alt="attachment" className="rounded-lg max-h-32 max-w-full object-cover" />
                    ) : (
                      <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#F6F3EE] text-[10px] text-[#6F6A64]">
                        <FileText className="h-3 w-3 text-[#7C2DE8]" />
                        {att.filename}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Content */}
              {msg.role === "assistant" ? (
                <div className="prose-chat">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                  {isStreaming && msg === displayMessages[displayMessages.length - 1] && !msg.toolActivity?.length && (
                    <span className="inline-block ml-0.5 animate-pulse">|</span>
                  )}
                  {msg.quotaExceeded && (
                    <div className="mt-2 pt-2 border-t border-[#E7DED2] text-[12px] text-[#C9843D] space-y-1.5">
                      <div>{t("quotaExceeded")}</div>
                      <Link
                        href="/account"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#C9843D] text-white text-[11px] font-medium hover:bg-[#B5742F] transition-colors"
                      >
                        {t("quotaCta")}
                      </Link>
                    </div>
                  )}
                  {msg.interrupted && !msg.quotaExceeded && !(isStreaming && msg === displayMessages[displayMessages.length - 1]) && (
                    <div className="mt-2 pt-2 border-t border-[#E7DED2] text-[11px] text-[#C9843D]">
                      {t("interrupted")}
                    </div>
                  )}
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}

              {/* Generated files */}
              {msg.generatedFiles && msg.generatedFiles.length > 0 && (
                <div className="mt-3 pt-2 border-t border-[#E7DED2] space-y-1.5">
                  {msg.generatedFiles.map((f, i) => (
                    <a
                      key={i}
                      href={`/api/ai/files/${f.fileId}`}
                      download={f.filename}
                      className="flex items-center gap-2 text-xs text-[#7C2DE8] hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {f.filename}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isStreaming && displayMessages.length > 0 && displayMessages[displayMessages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-[#FFFFFF] border border-[#E7DED2] rounded-xl px-4 py-3 text-sm text-[#9B948B]">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-4 py-3">
        <div className="rounded-xl border border-[#DDD3C7] bg-[#FFFFFF] focus-within:ring-2 focus-within:ring-[#7C2DE8]/30 focus-within:border-[#7C2DE8]/50 transition-all">
          {/* Pending attachments preview */}
          {pendingAttachments.length > 0 && (
            <div className="px-3 pt-3 flex gap-2 flex-wrap">
              {pendingAttachments.map((att, i) => (
                <div key={i} className="relative group">
                  {att.type === "image" && att.preview ? (
                    <img src={att.preview} alt="" className="h-16 rounded-lg border border-[#E7DED2] object-cover" />
                  ) : (
                    <div className="h-16 px-3 rounded-lg border border-[#E7DED2] bg-[#F6F3EE] flex items-center gap-2">
                      <FileText className="h-4 w-4 text-[#7C2DE8] shrink-0" />
                      <span className="text-[10px] text-[#6F6A64] max-w-[100px] truncate">{att.filename}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#D5847A] text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t("inputPlaceholder")}
            disabled={isStreaming}
            rows={3}
            className="w-full px-3 py-3 text-sm bg-transparent outline-none placeholder:text-[#9B948B] text-[#2B2B2B] disabled:opacity-50 resize-none leading-relaxed"
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md text-[#9B948B] hover:text-[#7C2DE8] hover:bg-[#F6F3EE] transition-colors"
              title={t("attachFile")}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={handleSend}
              disabled={(!inputText.trim() && pendingAttachments.length === 0) || isStreaming}
              className="px-3 py-1.5 rounded-xl bg-[#7C2DE8] text-white text-xs font-medium hover:bg-[#6921C7] active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("send")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
