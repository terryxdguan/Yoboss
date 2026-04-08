"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Send, ImagePlus, Globe, Code, Download } from "lucide-react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GoalDetailChatContext } from "@/lib/ai/goal-detail-chat";
import type { DailyTask } from "@/lib/types/database";
import {
  getOrCreateGoalSession,
  getSessionMessages,
  saveMessage,
  updateSessionSummary,
} from "@/lib/db/actions";
import { buildMessagesWithMemory, MAX_RECENT_MESSAGES } from "@/lib/ai/session-memory";
import { setAgentStatus } from "@/lib/stores/agent-status";

interface GoalChatPanelProps {
  goalId: string;
  goalContext: GoalDetailChatContext;
  taskContext?: DailyTask | null;
  onClose: () => void;
  panelTitle?: string;
}

interface ImageAttachment {
  base64: string;
  mimeType: string;
  preview: string; // data URL for display
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
  images?: ImageAttachment[];
  toolActivity?: ToolActivity[];
  generatedFiles?: GeneratedFile[];
}

interface ApiContentBlock {
  type: "text" | "image";
  text?: string;
  source?: { type: "base64"; media_type: string; data: string };
}

interface ApiMessage {
  role: "user" | "assistant";
  content: string | ApiContentBlock[];
}

let counter = 0;
function genId() {
  return `gcm_${Date.now()}_${++counter}`;
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mimeType: file.type, preview: dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<ApiMessage[]>([]);
  const startedRef = useRef(false);
  const { width: panelWidth, onMouseDown: onResizeMouseDown } = useResize(480, 360, 720);

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
  function buildApiContent(text: string, images?: ImageAttachment[]): string | ApiContentBlock[] {
    if (!images || images.length === 0) return text;
    const blocks: ApiContentBlock[] = [];
    for (const img of images) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.base64 },
      });
    }
    if (text) blocks.push({ type: "text", text });
    return blocks;
  }

  const sendToApi = useCallback(async (apiMessages: ApiMessage[]) => {
    setIsStreaming(true);
    setAgentStatus("general_assistant", "working");
    const assistantId = genId();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "goal-detail-chat",
          messages: buildMessagesWithMemory(sessionSummary, apiMessages),
          context: goalContext,
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let text = "";
      const tools: ToolActivity[] = [];
      const files: GeneratedFile[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          if (line.startsWith("event:")) continue;
          const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;
          let event;
          try { event = JSON.parse(jsonStr); } catch { continue; }

          // Text content
          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            text += event.delta.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: text, toolActivity: tools.length > 0 ? [...tools] : undefined, generatedFiles: files.length > 0 ? [...files] : undefined } : m))
            );
          }

          // Server-side tool use started
          if (event.type === "content_block_start" && event.content_block?.type === "server_tool_use") {
            const toolName = event.content_block.name as string;
            const labels: Record<string, string> = {
              web_search: "Searching the web...",
              web_fetch: "Fetching webpage...",
              bash_code_execution: "Running code...",
              text_editor_code_execution: "Editing file...",
            };
            const activity: ToolActivity = {
              type: toolName.includes("web_search") ? "web_search" : toolName.includes("web_fetch") ? "web_fetch" : "code_execution",
              label: labels[toolName] || `Using ${toolName}...`,
            };
            tools.push(activity);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, toolActivity: [...tools] } : m))
            );
          }

          // Code execution result — check for generated files
          if (event.type === "content_block_start" && event.content_block?.type === "bash_code_execution_tool_result") {
            const result = event.content_block.content;
            if (result?.type === "bash_code_execution_result" && result.content) {
              for (const item of result.content) {
                if (item.type === "bash_code_execution_output" && item.file_id) {
                  files.push({ fileId: item.file_id, filename: item.filename || "output" });
                }
              }
              if (files.length > 0) {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, generatedFiles: [...files] } : m))
                );
              }
            }
          }

          // Also check content_block_stop for tool results with files
          if (event.type === "content_block_stop") {
            // Files may appear in the final content blocks
          }
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

      // Persist to DB
      if (sessionId && text) {
        saveMessage(sessionId, "assistant", text).catch(console.error);

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
            body: JSON.stringify({ oldSummary: sessionSummary, messages: messagesToCompress }),
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
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${msg}` } : m
        )
      );
    } finally {
      setIsStreaming(false);
      setAgentStatus("general_assistant", "idle");
    }
  }, [goalContext]);

  // --- Start conversation (only if no history loaded) ---
  useEffect(() => {
    if (startedRef.current || loadingHistory) return;
    // If we loaded history from DB, don't auto-start
    if (messages.length > 0) {
      startedRef.current = true;
      return;
    }
    startedRef.current = true;

    if (taskContext) {
      const msg = `Help me with this task: "${taskContext.title}"${taskContext.time_slot ? ` (scheduled at ${taskContext.time_slot})` : ""}`;
      setMessages([{ id: genId(), role: "user", content: msg }]);
      if (sessionId) saveMessage(sessionId, "user", msg).catch(console.error);
      const apiMsg: ApiMessage = { role: "user", content: msg };
      historyRef.current = [apiMsg];
      sendToApi([apiMsg]);
    } else if (messages.length === 0) {
      // Only greet if empty session and no task context
      const greeting: ApiMessage = { role: "user", content: "Hi! I'd like to discuss my goal." };
      historyRef.current = [greeting];
      sendToApi([greeting]);
    }
  }, [taskContext, sendToApi, loadingHistory, messages.length, sessionId]);

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
          const img = await readFileAsBase64(file);
          setPendingImages((prev) => [...prev, img]);
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
      if (files[i].type.startsWith("image/")) {
        const img = await readFileAsBase64(files[i]);
        setPendingImages((prev) => [...prev, img]);
      }
    }
    e.target.value = "";
  };

  // --- Send ---
  const handleSend = () => {
    const text = inputText.trim();
    if ((!text && pendingImages.length === 0) || isStreaming) return;

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: text,
      images: pendingImages.length > 0 ? [...pendingImages] : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Persist user message to DB
    if (sessionId && text) {
      saveMessage(sessionId, "user", text).catch(console.error);
    }

    const apiContent = buildApiContent(text, pendingImages.length > 0 ? pendingImages : undefined);
    const apiMsg: ApiMessage = { role: "user", content: apiContent };
    historyRef.current.push(apiMsg);
    sendToApi([...historyRef.current]);

    setInputText("");
    setPendingImages([]);
    textareaRef.current?.focus();
  };

  // --- Visible messages (hide initial hidden greeting) ---
  const displayMessages = !taskContext && messages.length > 0 && messages[0]?.content === "Hi! I'd like to discuss my goal."
    ? messages.slice(1)
    : messages;

  return (
    <div
      className="shrink-0 border-l border-[#E7DED2] bg-[#F6F3EE] flex flex-col h-[calc(100vh-96px)] sticky top-0 relative"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#7FAEE6]/20 active:bg-[#7FAEE6]/30 transition-colors z-10"
      />

      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[#E7DED2]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-[#F1ECE4]">
            <Image src="/pink.png" alt="General Assistant" width={36} height={36} className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-[#2B2B2B] block truncate">General Assistant</span>
            <span className="text-[10px] text-[#9B948B]">{panelTitle || "Goal Coach"}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {displayMessages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-xl px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-[#7FAEE6] text-white"
                : "bg-[#FFFDF9] border border-[#E7DED2] text-[#2B2B2B]"
            }`}>
              {/* Tool activity badges */}
              {msg.toolActivity && msg.toolActivity.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.toolActivity.map((tool, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#F1ECE4] text-[#6F6A64]">
                      {tool.type === "web_search" || tool.type === "web_fetch" ? (
                        <Globe className="h-3 w-3" />
                      ) : (
                        <Code className="h-3 w-3" />
                      )}
                      {tool.label}
                    </span>
                  ))}
                </div>
              )}

              {/* User images */}
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {msg.images.map((img, i) => (
                    <img
                      key={i}
                      src={img.preview}
                      alt="attachment"
                      className="rounded-lg max-h-32 max-w-full object-cover"
                    />
                  ))}
                </div>
              )}

              {/* Content */}
              {msg.role === "assistant" ? (
                <div className="prose-chat">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                  {isStreaming && msg === displayMessages[displayMessages.length - 1] && (
                    <span className="inline-block ml-0.5 animate-pulse">|</span>
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
                      className="flex items-center gap-2 text-xs text-[#7FAEE6] hover:underline"
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
            <div className="bg-[#FFFDF9] border border-[#E7DED2] rounded-xl px-4 py-3 text-sm text-[#9B948B]">
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
        <div className="rounded-xl border border-[#DDD3C7] bg-[#FFFDF9] focus-within:ring-2 focus-within:ring-[#7FAEE6]/30 focus-within:border-[#7FAEE6]/50 transition-all">
          {/* Pending images preview */}
          {pendingImages.length > 0 && (
            <div className="px-3 pt-3 flex gap-2 flex-wrap">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.preview} alt="" className="h-16 rounded-lg border border-[#E7DED2] object-cover" />
                  <button
                    onClick={() => setPendingImages((prev) => prev.filter((_, j) => j !== i))}
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
            placeholder="Ask about your goal..."
            disabled={isStreaming}
            rows={3}
            className="w-full px-3 py-3 text-sm bg-transparent outline-none placeholder:text-[#9B948B] text-[#2B2B2B] disabled:opacity-50 resize-none leading-relaxed"
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md text-[#9B948B] hover:text-[#7FAEE6] hover:bg-[#F1ECE4] transition-colors"
              title="Upload image"
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={handleSend}
              disabled={(!inputText.trim() && pendingImages.length === 0) || isStreaming}
              className="px-3 py-1.5 rounded-lg bg-[#7FAEE6] text-white text-xs font-medium hover:bg-[#6A9DDA] active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
