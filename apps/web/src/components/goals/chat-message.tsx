"use client";

import Image from "next/image";
import { AskQuestionCard } from "./ask-question-card";
import type { ChatMessage as ChatMessageType, AskQuestionData, UserAnswer } from "@/lib/types/goal-chat";

interface ChatMessageProps {
  message: ChatMessageType;
  onAnswer?: (answer: UserAnswer) => void;
  isStreaming?: boolean;
}

// Goal Coach is always General Assistant. Keep the label/avatar inline (rather
// than importing from agent-registry) so this file has no runtime dep on the
// agent catalogue — it's a presentational component.
const AGENT_LABEL = "General Assistant";
const AGENT_AVATAR = "/pink.png";

export function ChatMessage({ message, onAnswer, isStreaming }: ChatMessageProps) {
  // User message: right-aligned blue bubble, no avatar
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="bg-[#7FAEE6] text-white rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message: avatar + name + bubble (matches workflow-run-view pattern)
  const activity = message.toolActivity ?? [];
  const hasActivity = activity.length > 0;
  const latestActivity = hasActivity ? activity[activity.length - 1] : null;
  const showThinkingIndicator = isStreaming && !message.content;
  // Show the blinking cursor only while text is actively streaming in.
  // Hide it when: (a) not streaming, (b) a tool is running but text is
  // paused (the pulsing tool badge already signals activity), or (c)
  // streaming just finished (no dangling static cursor).
  const isLatestToolActive = isStreaming && hasActivity;
  const showCursor = isStreaming && message.content && !isLatestToolActive;

  return (
    <div className="flex justify-start gap-3">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[#F1ECE4] mt-1">
        <Image
          src={AGENT_AVATAR}
          alt={AGENT_LABEL}
          width={32}
          height={32}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Content column */}
      <div className="max-w-[85%] min-w-0">
        {/* Agent name header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-[#2B2B2B]">{AGENT_LABEL}</span>
        </div>

        {/* Bubble */}
        <div className="rounded-xl bg-[#FFFDF9] border border-[#E7DED2] px-4 py-3 text-sm text-[#2B2B2B]">
          {/* Tool activity badges — all tool calls observed during this turn,
              latest one gets a pulsing indicator while streaming */}
          {hasActivity && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {activity.map((tool, i) => {
                const isLatest = isStreaming && i === activity.length - 1;
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
                    {tool.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Text content OR thinking animation */}
          {message.content ? (
            <div className="leading-relaxed whitespace-pre-wrap">
              {message.content}
              {showCursor && (
                <span className="inline-block ml-0.5 animate-pulse">|</span>
              )}
            </div>
          ) : showThinkingIndicator ? (
            <div className="flex items-center gap-3 py-0.5">
              <div className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#7FAEE6] animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#7FAEE6] animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-[#7FAEE6] animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
              <span className="text-sm text-[#7FAEE6] font-medium animate-pulse">
                {latestActivity
                  ? `${AGENT_LABEL} is working…`
                  : `${AGENT_LABEL} is thinking…`}
              </span>
            </div>
          ) : null}
        </div>

        {/* AskQuestion card (rendered outside the bubble, below it) */}
        {message.toolUse?.name === "ask_question" && (
          <AskQuestionCard
            data={message.toolUse.data as AskQuestionData}
            onAnswer={onAnswer || (() => {})}
            disabled={message.answered}
          />
        )}

        {/* Plan generated indicator */}
        {message.toolUse?.name === "create_goal_plan" && (
          <div className="mt-2 border border-[#7FB38A] bg-[#7FB38A]/5 rounded-lg px-4 py-3 text-sm text-[#7FB38A] font-medium">
            Plan generated — review it below
          </div>
        )}

        {/* Weekly plan generated indicator */}
        {message.toolUse?.name === "create_weekly_plan" && (
          <div className="mt-2 border border-[#7FB38A] bg-[#7FB38A]/5 rounded-lg px-4 py-3 text-sm text-[#7FB38A] font-medium">
            Weekly plan generated — review below
          </div>
        )}
      </div>
    </div>
  );
}
