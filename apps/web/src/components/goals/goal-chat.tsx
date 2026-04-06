"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGoalChat } from "@/lib/hooks/use-goal-chat";
import { ChatMessage } from "./chat-message";
import { RoadmapPreview } from "./roadmap-preview";

interface GoalChatProps {
  initialGoal: string;
  onCancel: () => void;
}

export function GoalChat({ initialGoal, onCancel }: GoalChatProps) {
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
  } = useGoalChat();

  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const lastGoalIdRef = useRef<string | null>(null);

  // Start chat on mount
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      startChat(initialGoal);
    }
  }, [initialGoal, startChat]);

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
          className="flex items-center gap-1.5 text-sm text-[#626A73] hover:text-[#1E2227] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="h-4 w-px bg-[#E6E1D8]" />
        <h2 className="text-lg font-semibold text-[#1E2227]">
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

        {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-[#F1EEE8] rounded-lg px-4 py-3 text-sm text-[#8C939B]">
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
            <div className="bg-[#C65B52]/5 border border-[#C65B52]/20 rounded-lg px-4 py-2 text-sm text-[#C65B52]">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#E6E1D8] pt-4">
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
            className="flex-1 border border-[#D8D1C6] rounded-lg px-4 py-2.5 text-sm text-[#1E2227] placeholder:text-[#8C939B] focus:outline-none focus:ring-2 focus:ring-[#4C7CF0]/40 focus:border-transparent bg-white disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isStreaming}
            className="h-10 w-10 flex items-center justify-center rounded-lg bg-[#4C7CF0] text-white hover:bg-[#3F6FE4] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
