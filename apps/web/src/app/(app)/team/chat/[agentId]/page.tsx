"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Send,
  Paperclip,
  FileText,
  Trash2,
  MessageSquare,
  Globe,
  Code,
  Download,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import { setAgentStatus } from "@/lib/stores/agent-status";
import {
  getAgentSessions,
  createChatSession,
  updateSessionTitle,
  deleteSession,
  getSessionMessages,
  getSessionMessageCount,
  saveMessage,
  updateSessionSummary,
  getSession,
} from "@/lib/db/actions";
import { buildMessagesWithMemory, MAX_RECENT_MESSAGES } from "@/lib/ai/session-memory";
import type { ChatSession, ChatMessage as DBChatMessage } from "@/lib/types/database";
import { processFile, buildContentBlocks, ACCEPTED_FILE_TYPES, type FileAttachment } from "@/lib/utils/file-upload";
import Image from "next/image";

interface GeneratedFile {
  fileId: string;
  filename: string;
  isDataUri?: boolean;
}

interface ToolActivity {
  type: "web_search" | "web_fetch" | "code_execution";
  label: string;
}

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: FileAttachment[];
  toolActivity?: ToolActivity[];
  generatedFiles?: GeneratedFile[];
}

let counter = 0;
function genId() {
  return `acm_${Date.now()}_${++counter}`;
}


export default function AgentChatPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const router = useRouter();

  const agent = [...DEFAULT_AGENTS, ...ALL_AGENTS].find((a) => a.id === agentId);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState("");
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [inputHeight, setInputHeight] = useState(160);
  const inputDragging = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string | object[] }[]>([]);

  // Load sessions on mount
  useEffect(() => {
    if (!agentId) return;
    getAgentSessions(agentId).then(async (data) => {
      if (data.length === 0) {
        // Auto-create first session
        const newSession = await createChatSession({ agentId, title: "New Chat" });
        setSessions([newSession]);
        setActiveSessionId(newSession.id);
      } else {
        setSessions(data);
        setActiveSessionId(data[0].id);
      }
      setLoading(false);
    });
  }, [agentId]);

  // Load messages and summary when active session changes
  useEffect(() => {
    if (!activeSessionId) return;
    Promise.all([
      getSessionMessages(activeSessionId, 50),
      getSession(activeSessionId),
    ]).then(([data, session]) => {
      const uiMsgs: UIMessage[] = data.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        generatedFiles: m.metadata?.generatedFiles as GeneratedFile[] | undefined,
        toolActivity: m.metadata?.toolActivity as ToolActivity[] | undefined,
      }));
      setMessages(uiMsgs);
      setSessionSummary(session?.summary || null);
      historyRef.current = data.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    });
  }, [activeSessionId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isStreaming]);

  const sendToApi = useCallback(async (apiMessages: { role: string; content: string | object[] }[]) => {
    if (!agent || !activeSessionId) return;
    setIsStreaming(true);
    setAgentStatus(agentId, "working");
    const assistantId = genId();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      // Apply session memory: summary + last 5 messages
      const recentMessages = buildMessagesWithMemory(sessionSummary, apiMessages);

      const res = await fetch("/api/ai/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptFile: agent.promptFile,
          messages: recentMessages,
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

          // Error from API
          if (event.type === "error") {
            throw new Error(event.error?.message || "AI service error");
          }

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
              }
            }
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

      // Save to DB with metadata
      const metadata = (files.length > 0 || tools.length > 0) ? {
        generatedFiles: files.length > 0 ? files : undefined,
        toolActivity: tools.length > 0 ? tools : undefined,
      } : undefined;
      await saveMessage(activeSessionId, "assistant", text, metadata);

      // Auto-title: if this is the first exchange, use the user's first message as title
      if (messages.length <= 1) {
        const firstUserMsg = messages.find((m) => m.role === "user")?.content || inputText;
        const autoTitle = firstUserMsg.slice(0, 30) + (firstUserMsg.length > 30 ? "..." : "");
        if (autoTitle) {
          await updateSessionTitle(activeSessionId, autoTitle);
          setSessions((prev) =>
            prev.map((s) => (s.id === activeSessionId ? { ...s, title: autoTitle } : s))
          );
        }
      }

      // Session memory: generate rolling summary when messages exceed threshold
      const totalMessages = historyRef.current.length;
      if (totalMessages > MAX_RECENT_MESSAGES && totalMessages % MAX_RECENT_MESSAGES === 1) {
        // Compress older messages into summary (async, non-blocking)
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
              await updateSessionSummary(activeSessionId, data.summary);
            }
          })
          .catch(console.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: `Error: ${msg}` } : m))
      );
    } finally {
      setIsStreaming(false);
      setAgentStatus(agentId, "idle");
    }
  }, [agent, activeSessionId, messages, inputText]);

  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && pendingAttachments.length === 0) || isStreaming || !activeSessionId) return;

    const userMsg: UIMessage = { id: genId(), role: "user", content: text, attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined };
    setMessages((prev) => [...prev, userMsg]);

    // Build API content
    const apiContent = buildContentBlocks(text, pendingAttachments.length > 0 ? pendingAttachments : undefined);

    historyRef.current.push({ role: "user", content: apiContent });

    // Save user message to DB
    await saveMessage(activeSessionId, "user", text);

    setInputText("");
    setPendingAttachments([]);
    textareaRef.current?.focus();

    sendToApi([...historyRef.current]);
  };

  const handleNewSession = async () => {
    if (!agentId) return;
    const newSession = await createChatSession({ agentId, title: "New Chat" });
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      setActiveSessionId(remaining[0]?.id || null);
    }
  };

  const handleTitleSave = async (sessionId: string) => {
    const trimmed = editTitleText.trim();
    if (trimmed) {
      await updateSessionTitle(sessionId, trimmed);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
      );
    }
    setEditingTitleId(null);
  };

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const att = await processFile(files[i]);
      setPendingAttachments((prev) => [...prev, att]);
    }
    e.target.value = "";
  };

  if (!agent) {
    return (
      <div className="text-center py-24">
        <p className="text-[#6F6A64]">Agent not found</p>
        <button onClick={() => router.push("/team")} className="text-sm text-[#7FAEE6] mt-2 hover:underline">
          Back to Team
        </button>
      </div>
    );
  }

  const displayName = agent.label;

  return (
    <div className="flex h-[calc(100vh-96px)] -mx-6 md:-mx-8 -mb-12">
      {/* Session Sidebar */}
      <div className="w-56 shrink-0 border-r border-[#E7DED2] bg-[#F6F3EE] flex flex-col">
        {/* Back + Agent info */}
        <div className="px-3 py-4 border-b border-[#E7DED2]">
          <button
            onClick={() => router.push("/team")}
            className="flex items-center gap-1.5 text-xs text-[#6F6A64] hover:text-[#2B2B2B] transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Team
          </button>
          <div className="flex items-center gap-2.5">
            {agent.avatar ? (
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#E7DED2] shrink-0">
                <Image src={agent.avatar} alt={agent.label} width={32} height={32} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[#7FAEE6]/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-[#7FAEE6]">{agent.label.charAt(0)}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#2B2B2B] truncate">{displayName}</p>
              <p className="text-[10px] text-[#9B948B] truncate">{agent.description.slice(0, 40)}...</p>
            </div>
          </div>
        </div>

        {/* New Session Button */}
        <div className="px-3 py-2">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#7FAEE6] hover:bg-[#7FAEE6]/5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Chat
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-2">
          {loading ? (
            <p className="text-xs text-[#9B948B] text-center py-4">Loading...</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-1 px-2 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors ${
                  activeSessionId === session.id
                    ? "bg-[#7FAEE6]/10 text-[#2B2B2B]"
                    : "text-[#6F6A64] hover:bg-[#E7DED2]/50"
                }`}
                onClick={() => setActiveSessionId(session.id)}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                {editingTitleId === session.id ? (
                  <input
                    autoFocus
                    value={editTitleText}
                    onChange={(e) => setEditTitleText(e.target.value)}
                    onBlur={() => handleTitleSave(session.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleTitleSave(session.id); if (e.key === "Escape") setEditingTitleId(null); }}
                    className="flex-1 text-xs bg-[#FFFDF9] border border-[#7FAEE6]/40 rounded px-1 py-0.5 outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="flex-1 text-xs truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingTitleId(session.id);
                      setEditTitleText(session.title);
                    }}
                  >
                    {session.title}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#D5847A]/10 transition-all"
                >
                  <Trash2 className="h-3 w-3 text-[#D5847A]" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-[#FFFDF9] min-w-0">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-16">
              <MessageSquare className="h-10 w-10 text-[#E7DED2] mx-auto mb-3" />
              <p className="text-sm text-[#9B948B]">Start a conversation with {displayName}</p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-[#7FAEE6] text-white"
                  : "bg-[#F6F3EE] border border-[#E7DED2] text-[#2B2B2B]"
              }`}>
                {/* Tool activity badges */}
                {msg.toolActivity && msg.toolActivity.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {msg.toolActivity.map((tool, i) => {
                      const isLatest = isStreaming && msg === messages[messages.length - 1] && i === msg.toolActivity!.length - 1;
                      return (
                        <span key={i} className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full ${isLatest ? "bg-[#7FAEE6]/10 text-[#7FAEE6]" : "bg-[#F1ECE4] text-[#6F6A64]"}`}>
                          {isLatest && (
                            <span className="relative flex h-2 w-2 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7FAEE6] opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7FAEE6]" />
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

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {msg.attachments.map((att, i) =>
                      att.type === "image" && att.preview ? (
                        <img key={i} src={att.preview} alt="attachment" className="rounded-lg max-h-32 max-w-full object-cover" />
                      ) : (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#F1ECE4] text-[10px] text-[#6F6A64]">
                          <FileText className="h-3 w-3 text-[#7FAEE6]" />
                          {att.filename}
                        </div>
                      )
                    )}
                  </div>
                )}
                {msg.role === "assistant" ? (
                  <div className="prose-chat">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    {isStreaming && msg === messages[messages.length - 1] && (
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
                        href={f.isDataUri ? f.fileId : `/api/ai/files/${f.fileId}`}
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

          {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="bg-[#F6F3EE] border border-[#E7DED2] rounded-xl px-4 py-3 text-sm text-[#9B948B]">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area — resizable */}
        <div className="px-6 pb-4">
          {/* Drag handle */}
          <div className="flex justify-center py-1">
            <div
              className="w-10 h-1 rounded-full bg-[#DDD3C7] cursor-row-resize hover:bg-[#9B948B] transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                inputDragging.current = true;
                const startY = e.clientY;
                const startH = inputHeight;
                document.body.style.cursor = "row-resize";
                document.body.style.userSelect = "none";
                const onMove = (ev: MouseEvent) => {
                  if (!inputDragging.current) return;
                  const delta = startY - ev.clientY;
                  setInputHeight(Math.min(400, Math.max(100, startH + delta)));
                };
                const onUp = () => {
                  inputDragging.current = false;
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
            />
          </div>

          <div
            className="rounded-xl border border-[#DDD3C7] bg-[#F6F3EE] focus-within:ring-2 focus-within:ring-[#7FAEE6]/30 focus-within:border-[#7FAEE6]/50 transition-all flex flex-col"
            style={{ height: inputHeight }}
          >
            {/* Pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="px-3 pt-3 flex gap-2 flex-wrap">
                {pendingAttachments.map((att, i) => (
                  <div key={i} className="relative group">
                    {att.type === "image" && att.preview ? (
                      <img src={att.preview} alt="" className="h-16 rounded-lg border border-[#E7DED2] object-cover" />
                    ) : (
                      <div className="h-16 px-3 rounded-lg border border-[#E7DED2] bg-[#F6F3EE] flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#7FAEE6] shrink-0" />
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

            {/* Textarea — fills remaining space */}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={`Type a message... (Enter to send)`}
              disabled={isStreaming}
              className="flex-1 w-full px-4 py-3 text-sm bg-transparent outline-none placeholder:text-[#9B948B] text-[#2B2B2B] disabled:opacity-50 resize-none leading-relaxed"
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 pb-2 shrink-0">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 rounded-md text-[#9B948B] hover:text-[#7FAEE6] hover:bg-[#E7DED2] transition-colors"
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} multiple onChange={handleFileSelect} className="hidden" />
              <button
                onClick={handleSend}
                disabled={(!inputText.trim() && pendingAttachments.length === 0) || isStreaming}
                className="px-4 py-1.5 rounded-lg bg-[#7FAEE6] text-white text-xs font-medium hover:bg-[#6A9DDA] active:scale-[0.97] transition-all disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
