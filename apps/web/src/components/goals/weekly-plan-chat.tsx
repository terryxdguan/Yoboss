"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Check, Calendar, Pencil, Sparkles } from "lucide-react";
import { useWeeklyPlanChat, type WeeklyPlanChatContext, type UseWeeklyPlanChatInitialDraft } from "@/lib/hooks/use-weekly-plan-chat";
import { ChatMessage } from "./chat-message";
import type { WeeklyPlanData } from "@/lib/types/goal-chat";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface TaskContext {
  id: string;
  title: string;
  description: string | null;
  time_slot: string | null;
}

interface WeeklyPlanChatPanelProps {
  open: boolean;
  onClose: () => void;
  context: WeeklyPlanChatContext;
  phaseId: string;
  weekStart: string;
  onPlanSaved: () => void;
  taskContext?: TaskContext | null;
  /** Pass a rehydrated draft to resume an interrupted weekly plan chat. */
  initialDraft?: UseWeeklyPlanChatInitialDraft | null;
}

function PlanPreviewModal({
  plan,
  onConfirm,
  onEdit,
  isSaving,
}: {
  plan: WeeklyPlanData;
  onConfirm: () => void;
  onEdit: () => void;
  isSaving: boolean;
}) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const tasksByDay: Record<number, WeeklyPlanData["tasks"]> = {};
  for (const task of tasks) {
    if (!tasksByDay[task.day_of_week]) tasksByDay[task.day_of_week] = [];
    tasksByDay[task.day_of_week].push(task);
  }

  const totalTasks = tasks.length;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.time_estimate_minutes || 0), 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-[#E7DED2]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#7FAEE6]/10">
              <Calendar className="h-5 w-5 text-[#7FAEE6]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2B2B2B]">Weekly Plan Preview</h2>
              <p className="text-xs text-[#9B948B]">
                {totalTasks} tasks · ~{totalHours}h total
              </p>
            </div>
          </div>
          {plan.ai_summary && (
            <p className="text-sm text-[#6F6A64] leading-relaxed">{plan.ai_summary}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
              const tasks = tasksByDay[dayIdx];
              if (!tasks || tasks.length === 0) return null;
              return (
                <div key={dayIdx} className="bg-[#F6F3EE] rounded-xl p-4 border border-[#E7DED2]/50">
                  <p className="text-sm font-semibold text-[#2B2B2B] mb-2">{DAY_NAMES[dayIdx]}</p>
                  <ul className="space-y-2">
                    {tasks.map((task, i) => (
                      <li key={i} className="text-sm text-[#6F6A64]">
                        <p className="text-[#2B2B2B]">{task.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {task.time_slot && (
                            <span className="text-[11px] text-[#9B948B]">{task.time_slot}</span>
                          )}
                          {task.time_estimate_minutes && (
                            <span className="text-[11px] text-[#9B948B]">
                              {task.time_estimate_minutes} min
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E7DED2] flex items-center gap-3">
          <button
            onClick={onConfirm}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 bg-[#7FB38A] text-white text-sm font-medium py-3 rounded-xl hover:bg-[#3D7A5A] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isSaving ? "Saving..." : "Looks good, save it!"}
          </button>
          <button
            onClick={onEdit}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 text-sm font-medium py-3 px-5 rounded-xl border border-[#DDD3C7] text-[#6F6A64] hover:bg-[#F1ECE4] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Adjust
          </button>
        </div>
      </div>
    </div>
  );
}

export function WeeklyPlanChatPanel({
  open,
  onClose,
  context,
  phaseId,
  weekStart,
  onPlanSaved,
  taskContext,
  initialDraft,
}: WeeklyPlanChatPanelProps) {
  const {
    messages,
    stage,
    isStreaming,
    plan,
    error,
    startChat,
    sendMessage,
    answerQuestion,
    confirmPlan,
    editPlan,
    reset,
  } = useWeeklyPlanChat({ initialDraft });

  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // Skip startChat when resuming a draft — the hook already hydrated
    // state from initialDraft.
    if (initialDraft) {
      startedRef.current = true;
      return;
    }
    if (open && !startedRef.current) {
      startedRef.current = true;
      if (taskContext) {
        const taskMsg = `Help me with this task: "${taskContext.title}"${taskContext.time_slot ? ` (scheduled at ${taskContext.time_slot})` : ""}. I'd like to break it down, get tips, or brainstorm how to approach it.`;
        startChat(context, phaseId, weekStart);
        setTimeout(() => sendMessage(taskMsg), 500);
      } else {
        startChat(context, phaseId, weekStart);
      }
    }
  }, [open, context, phaseId, weekStart, startChat, taskContext, sendMessage, initialDraft]);

  useEffect(() => {
    if (!open) {
      startedRef.current = false;
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    if (stage === "done") {
      onPlanSaved();
      onClose();
    }
  }, [stage, onPlanSaved, onClose]);

  const handleSend = () => {
    if (!inputText.trim() || isStreaming) return;
    sendMessage(inputText.trim());
    setInputText("");
    inputRef.current?.focus();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && stage !== "preview" && stage !== "saving") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, stage]);

  if (!open) return null;

  return (
    <>
      {/* Inline chat panel — NOT fixed, sits in the page flex layout */}
      <div className="w-96 shrink-0 border-l border-[#E7DED2] bg-[#F6F3EE] flex flex-col h-[calc(100vh-96px)] sticky top-0">
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-[#E7DED2]">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-[#7FAEE6] shrink-0" />
            <span className="text-sm font-medium text-[#2B2B2B] truncate">
              {taskContext ? "AI Coach" : "Plan Your Week"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {messages.slice(1).map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onAnswer={answerQuestion}
              isStreaming={
                isStreaming && idx === messages.length - 2 && msg.role === "assistant"
              }
            />
          ))}

          {isStreaming && messages.length > 1 && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="bg-[#F1ECE4] rounded-lg px-4 py-3 text-sm text-[#9B948B]">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="bg-[#D5847A]/5 border border-[#D5847A]/20 rounded-lg px-4 py-2 text-sm text-[#D5847A]">
                {error}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[#E7DED2] px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              disabled={isStreaming || stage === "saving"}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-[#9B948B] text-[#2B2B2B] disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isStreaming || stage === "saving"}
              className="p-1.5 text-[#7FAEE6] hover:text-[#6A9DDA] transition-colors disabled:opacity-40"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Plan preview modal — centered overlay */}
      {(stage === "preview" || stage === "saving") && plan && (
        <PlanPreviewModal
          plan={plan}
          onConfirm={confirmPlan}
          onEdit={editPlan}
          isSaving={stage === "saving"}
        />
      )}
    </>
  );
}
