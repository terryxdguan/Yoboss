"use client";

import Image from "next/image";
import { Loader2 } from "lucide-react";
import { AskQuestionCard } from "./ask-question-card";
import { LiveTimer } from "@/components/ui/live-timer";
import type { ChatMessage as ChatMessageType, AskQuestionData, UserAnswer } from "@/lib/types/goal-chat";

// Tool calls whose input JSON streams silently for many seconds — these
// get the dedicated "Drafting your plan…" progress card instead of just
// the pulsing badge, so users see something concrete advancing.
const PLAN_DRAFTING_TOOLS = new Set(["create_goal_plan", "create_weekly_plan"]);

interface ChatMessageProps {
  message: ChatMessageType;
  onAnswer?: (answer: UserAnswer) => void;
  isStreaming?: boolean;
}

// Goal Coach is always General Assistant. Keep the label/avatar inline (rather
// than importing from agent-registry) so this file has no runtime dep on the
// agent catalogue — it's a presentational component.
const AGENT_LABEL = "Assistant";
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
  // Show the rich "Drafting your plan…" progress card when the latest
  // tool is a plan-generating one AND the toolUse hasn't been finalized
  // yet (toolUse is set on content_block_stop, so its presence means
  // the JSON has been parsed and the preview modal is already opening).
  const showDraftingCard =
    isStreaming &&
    latestActivity !== null &&
    PLAN_DRAFTING_TOOLS.has(latestActivity.type) &&
    !message.toolUse;

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
          <LiveTimer active={!!isStreaming} />
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

          {/* Drafting-plan progress card — shown while the model is
              streaming the create_*_plan tool body, which is otherwise
              silent for many seconds. Live char count so users see
              concrete progress instead of a frozen-looking spinner. */}
          {showDraftingCard && (
            <div className="mt-1 mb-2 flex items-center gap-3 rounded-lg bg-[#7FAEE6]/8 border border-[#7FAEE6]/25 px-3.5 py-2.5">
              <Loader2 className="h-4 w-4 text-[#7FAEE6] animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#2B2B2B]">
                  Drafting your plan…
                </p>
                <p className="text-xs text-[#6F6A64] tabular-nums">
                  {(latestActivity?.draftingChars ?? 0).toLocaleString()} characters generated
                </p>
              </div>
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
