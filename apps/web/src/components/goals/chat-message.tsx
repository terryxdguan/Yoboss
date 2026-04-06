"use client";

import { AskQuestionCard } from "./ask-question-card";
import type { ChatMessage as ChatMessageType, AskQuestionData, UserAnswer } from "@/lib/types/goal-chat";

interface ChatMessageProps {
  message: ChatMessageType;
  onAnswer?: (answer: UserAnswer) => void;
  isStreaming?: boolean;
}

export function ChatMessage({ message, onAnswer, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "order-1" : ""}`}>
        {/* Text bubble */}
        {message.content && (
          <div
            className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? "bg-[#4C7CF0] text-white"
                : "bg-[#F1EEE8] text-[#1E2227]"
            }`}
          >
            {message.content}
            {isStreaming && (
              <span className="inline-block ml-1 animate-pulse">|</span>
            )}
          </div>
        )}

        {/* AskQuestion card */}
        {message.toolUse?.name === "ask_question" && (
          <AskQuestionCard
            data={message.toolUse.data as AskQuestionData}
            onAnswer={onAnswer || (() => {})}
            disabled={message.answered}
          />
        )}

        {/* Plan generated indicator */}
        {message.toolUse?.name === "create_goal_plan" && (
          <div className="mt-2 border border-[#4D8B6A] bg-[#4D8B6A]/5 rounded-lg px-4 py-3 text-sm text-[#4D8B6A] font-medium">
            Plan generated — review it below
          </div>
        )}
      </div>
    </div>
  );
}
