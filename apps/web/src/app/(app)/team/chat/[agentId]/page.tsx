"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Send,
  ImagePlus,
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
import Image from "next/image";

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: { base64: string; mimeType: string; preview: string }[];
}

let counter = 0;
function genId() {
  return `acm_${Date.now()}_${++counter}`;
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({ base64: dataUrl.split(",")[1], mimeType: file.type, preview: dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AgentChatPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const router = useRouter();

  const agent = [...DEFAULT_AGENTS, ...ALL_AGENTS].find((a) => a.id === agentId);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [pendingImages, setPendingImages] = useState<{ base64: string; mimeType: string; preview: string }[]>([]);
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

          if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
            text += event.delta.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m))
            );
          }
        }
      }

      historyRef.current.push({ role: "assistant", content: text });

      // Save to DB
      await saveMessage(activeSessionId, "assistant", text);

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
    if ((!text && pendingImages.length === 0) || isStreaming || !activeSessionId) return;

    const userMsg: UIMessage = { id: genId(), role: "user", content: text, images: pendingImages.length > 0 ? [...pendingImages] : undefined };
    setMessages((prev) => [...prev, userMsg]);

    // Build API content
    let apiContent: string | object[] = text;
    if (pendingImages.length > 0) {
      const blocks: object[] = [];
      for (const img of pendingImages) {
        blocks.push({ type: "image", source: { type: "base64", media_type: img.mimeType, data: img.base64 } });
      }
      if (text) blocks.push({ type: "text", text });
      apiContent = blocks;
    }

    historyRef.current.push({ role: "user", content: apiContent });

    // Save user message to DB
    await saveMessage(activeSessionId, "user", text);

    setInputText("");
    setPendingImages([]);
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
          const img = await readFileAsBase64(file);
          setPendingImages((prev) => [...prev, img]);
        }
        return;
      }
    }
  };

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

  const displayName = agent.id === "general_assistant" ? agent.name : agent.label;

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
                <Image src={agent.avatar} alt={agent.name} width={32} height={32} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[#7FAEE6]/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-[#7FAEE6]">{agent.name.charAt(0)}</span>
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
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {msg.images.map((img, i) => (
                      <img key={i} src={img.preview} alt="" className="rounded-lg max-h-32 object-cover" />
                    ))}
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
            {/* Pending images */}
            {pendingImages.length > 0 && (
              <div className="px-3 pt-3 flex gap-2 flex-wrap shrink-0">
                {pendingImages.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img.preview} alt="" className="h-14 rounded-lg border border-[#E7DED2] object-cover" />
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
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
              <button
                onClick={handleSend}
                disabled={(!inputText.trim() && pendingImages.length === 0) || isStreaming}
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
