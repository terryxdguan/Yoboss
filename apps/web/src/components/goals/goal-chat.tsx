"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGoalSession, type UseGoalSessionInitialDraft } from "@/lib/hooks/use-goal-session";
import { ChatMessage } from "./chat-message";
import { RoadmapPreview } from "./roadmap-preview";

interface GoalChatProps {
  /** Text of the opening user message. Ignored when `initialDraft` is
   *  provided — resuming a draft uses whatever opening message is
   *  already persisted on the session. */
  initialGoal: string;
  onCancel: () => void;
  /** Pass a rehydrated draft from GoalDraftList to resume an in-progress
   *  conversation instead of starting a fresh one. */
  initialDraft?: UseGoalSessionInitialDraft | null;
}

export function GoalChat({ initialGoal, onCancel, initialDraft }: GoalChatProps) {
  const router = useRouter();
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
  } = useGoalSession({ initialDraft });

  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const lastGoalIdRef = useRef<string | null>(null);

  // Start chat on mount — but only when we're not resuming a draft.
  // Resume hydrates the hook state directly from `initialDraft`, so
  // firing startChat would reset the conversation and create a second
  // draft row pointing at nothing.
  useEffect(() => {
    if (initialDraft) {
      started.current = true;
      return;
    }
    if (!started.current) {
      started.current = true;
      startChat(initialGoal);
    }
  }, [initialGoal, startChat, initialDraft]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Navigate to new goal page on done
  useEffect(() => {
    if (stage === "done" && lastGoalIdRef.current) {
      router.push(`/goals/${lastGoalIdRef.current}`);
    }
  }, [stage, router]);

  const handleSend = () => {
    if (!inputText.trim() || isStreaming) return;
    sendMessage(inputText.trim());
    setInputText("");
    inputRef.current?.focus();
  };

  const handleConfirm = async () => {
    const goalId = await confirmPlan();
    if (goalId) {
      lastGoalIdRef.current = goalId;
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-96px)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm text-[#6F6A64] hover:text-[#2B2B2B] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="h-4 w-px bg-[#E7DED2]" />
        <h2 className="text-lg font-semibold text-[#2B2B2B]">
          Goal Coach
        </h2>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 pb-4"
      >
        {messages.map((msg, idx) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onAnswer={answerQuestion}
            isStreaming={
              isStreaming && idx === messages.length - 1 && msg.role === "assistant"
            }
          />
        ))}

        {error && (
          <div className="flex justify-center">
            <div className="bg-[#D5847A]/5 border border-[#D5847A]/20 rounded-lg px-4 py-2 text-sm text-[#D5847A]">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#E7DED2] pt-4">
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
            disabled={isStreaming}
            className="flex-1 border border-[#DDD3C7] rounded-lg px-4 py-2.5 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/40 focus:border-transparent bg-[#FFFDF9] disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isStreaming}
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Roadmap preview overlay */}
      {(stage === "preview" || stage === "saving") && plan && (
        <RoadmapPreview
          plan={plan}
          onConfirm={handleConfirm}
          onEdit={editPlan}
          isSaving={stage === "saving"}
          error={error}
        />
      )}
    </div>
  );
}
