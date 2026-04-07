"use client";

import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
  WeeklyPlanData,
  UserAnswer,
  AskQuestionData,
} from "@/lib/types/goal-chat";
import { createClient } from "@/lib/db/client";
export interface WeeklyPlanChatContext {
  goalTitle: string;
  goalDescription: string;
  phaseTitle: string;
  phaseDescription: string;
  weekNumber: number;
  estimatedWeeks: number;
  isMidWeekStart: boolean;
  startDayOfWeek?: number;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function buildInitialMessage(context: WeeklyPlanChatContext): string {
  const midWeekNote = context.isMidWeekStart
    ? `\nNote: It's already ${DAY_NAMES[context.startDayOfWeek!]}, so only plan from ${DAY_NAMES[context.startDayOfWeek!]} through Sunday.`
    : "";

  return `Help me plan this week for my goal.

Goal: ${context.goalTitle}
${context.goalDescription ? `Description: ${context.goalDescription}` : ""}
Current Phase: ${context.phaseTitle} — ${context.phaseDescription}
Week ${context.weekNumber} of estimated ${context.estimatedWeeks} weeks${midWeekNote}`;
}

let msgCounter = 0;
function genId() {
  return `msg_${Date.now()}_${++msgCounter}`;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export type WeeklyPlanChatStage = "chatting" | "preview" | "saving" | "done";

export function useWeeklyPlanChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<WeeklyPlanChatStage>("chatting");
  const [isStreaming, setIsStreaming] = useState(false);
  const [plan, setPlan] = useState<WeeklyPlanData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const historyRef = useRef<AnthropicMessage[]>([]);
  const lastToolUseIdRef = useRef<string | null>(null);
  const contextRef = useRef<{ phaseId: string; weekStart: string } | null>(null);

  const sendToApi = useCallback(
    async (apiMessages: AnthropicMessage[]) => {
      setIsStreaming(true);
      setError(null);

      const assistantMsgId = genId();
      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "" },
      ]);

      try {
        const res = await fetch("/api/ai/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "weekly-chat",
            messages: apiMessages,
          }),
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let textContent = "";
        let currentToolName = "";
        let currentToolId = "";
        let toolInputJson = "";
        let inToolUse = false;

        const contentBlocks: AnthropicContentBlock[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.trim());

          for (const line of lines) {
            if (line.startsWith("event:")) continue;
            const jsonStr = line.startsWith("data: ")
              ? line.slice(6)
              : line;

            let event;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            if (event.type === "content_block_start") {
              const block = event.content_block;
              if (block?.type === "tool_use") {
                inToolUse = true;
                currentToolName = block.name || "";
                currentToolId = block.id || "";
                toolInputJson = "";
              }
            }

            if (event.type === "content_block_delta") {
              const delta = event.delta;
              if (delta?.type === "text_delta" && delta.text) {
                textContent += delta.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: textContent }
                      : m
                  )
                );
              }
              if (delta?.type === "input_json_delta" && delta.partial_json) {
                toolInputJson += delta.partial_json;
              }
            }

            if (event.type === "content_block_stop") {
              if (inToolUse && toolInputJson) {
                try {
                  const toolInput = JSON.parse(toolInputJson);
                  lastToolUseIdRef.current = currentToolId;

                  if (textContent) {
                    contentBlocks.push({ type: "text", text: textContent });
                  }
                  contentBlocks.push({
                    type: "tool_use",
                    id: currentToolId,
                    name: currentToolName,
                    input: toolInput,
                  });

                  if (currentToolName === "ask_question") {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              content: textContent,
                              toolUse: {
                                id: currentToolId,
                                name: "ask_question",
                                data: toolInput as AskQuestionData,
                              },
                            }
                          : m
                      )
                    );
                  }

                  if (currentToolName === "create_weekly_plan") {
                    const planData = toolInput as WeeklyPlanData;
                    setPlan(planData);
                    setStage("preview");
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? {
                              ...m,
                              content: textContent,
                              toolUse: {
                                id: currentToolId,
                                name: "create_weekly_plan",
                                data: planData,
                              },
                            }
                          : m
                      )
                    );
                  }
                } catch {
                  console.error("Failed to parse tool input:", toolInputJson);
                }

                inToolUse = false;
                currentToolName = "";
                toolInputJson = "";
              } else if (!inToolUse && textContent) {
                contentBlocks.push({ type: "text", text: textContent });
              }
            }
          }
        }

        historyRef.current.push({
          role: "assistant",
          content:
            contentBlocks.length > 0
              ? contentBlocks
              : textContent,
        });
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "Something went wrong";
        setError(errMsg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: "Sorry, something went wrong. Please try again." }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    []
  );

  const startChat = useCallback(
    (context: WeeklyPlanChatContext, phaseId: string, weekStart: string) => {
      contextRef.current = { phaseId, weekStart };
      setStage("chatting");
      setMessages([]);
      setPlan(null);
      setError(null);

      const initialText = buildInitialMessage(context);

      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: initialText,
      };
      setMessages([userMsg]);

      const apiMsg: AnthropicMessage = { role: "user", content: initialText };
      historyRef.current = [apiMsg];
      sendToApi([apiMsg]);
    },
    [sendToApi]
  );

  const sendMessage = useCallback(
    (text: string) => {
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      const apiMsg: AnthropicMessage = { role: "user", content: text };
      historyRef.current.push(apiMsg);
      sendToApi([...historyRef.current]);
    },
    [sendToApi]
  );

  const answerQuestion = useCallback(
    (answer: UserAnswer) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.toolUse?.name === "ask_question" && !m.answered
            ? { ...m, answered: true }
            : m
        )
      );

      const answerText = answer.other_text
        ? `${answer.selected.join(", ")}. Additional: ${answer.other_text}`
        : answer.selected.join(", ");

      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: answerText,
      };
      setMessages((prev) => [...prev, userMsg]);

      const toolResultMsg: AnthropicMessage = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: lastToolUseIdRef.current || "",
            content: JSON.stringify(answer),
          },
        ],
      };
      historyRef.current.push(toolResultMsg);
      sendToApi([...historyRef.current]);
    },
    [sendToApi]
  );

  const confirmPlan = useCallback(async () => {
    if (!plan || !contextRef.current) return;
    setStage("saving");
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { phaseId, weekStart } = contextRef.current;

      // Delete any existing empty/broken weekly plan for this phase+week
      const { data: existingPlans } = await supabase
        .from("weekly_plans")
        .select("id")
        .eq("phase_id", phaseId)
        .eq("week_start", weekStart);
      if (existingPlans && existingPlans.length > 0) {
        const existingIds = existingPlans.map((p) => p.id);
        await supabase.from("daily_tasks").delete().in("weekly_plan_id", existingIds);
        await supabase.from("weekly_plans").delete().in("id", existingIds);
      }

      const { data: weeklyPlanRecord, error: wpErr } = await supabase
        .from("weekly_plans")
        .insert({
          phase_id: phaseId,
          user_id: user.id,
          week_start: weekStart,
          ai_summary: plan.ai_summary,
        })
        .select()
        .single();
      if (wpErr) throw wpErr;

      const tasksToInsert = plan.tasks.map((t) => ({
        weekly_plan_id: weeklyPlanRecord.id,
        day_of_week: t.day_of_week,
        title: t.title,
        description: t.description,
        time_estimate_minutes: t.time_estimate_minutes,
        time_slot: t.time_slot,
        sort_order: t.sort_order,
      }));

      const { error: taskErr } = await supabase
        .from("daily_tasks")
        .insert(tasksToInsert);
      if (taskErr) throw taskErr;

      setStage("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("confirmPlan error:", msg);
      setError(msg);
      setStage("preview");
    }
  }, [plan]);

  const editPlan = useCallback(() => {
    setStage("chatting");
    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content: "I'd like to adjust the plan. What would you change?",
    };
    setMessages((prev) => [...prev, userMsg]);

    const toolResultMsg: AnthropicMessage = {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: lastToolUseIdRef.current || "",
          content: "User wants to edit the plan",
        },
      ],
    };
    historyRef.current.push(toolResultMsg);

    const editMsg: AnthropicMessage = {
      role: "user",
      content: "I'd like to adjust the plan. What would you change?",
    };
    historyRef.current.push(editMsg);
    sendToApi([...historyRef.current]);
  }, [sendToApi]);

  const reset = useCallback(() => {
    setMessages([]);
    setStage("chatting");
    setPlan(null);
    setError(null);
    historyRef.current = [];
    lastToolUseIdRef.current = null;
    contextRef.current = null;
  }, []);

  return {
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
  };
}
