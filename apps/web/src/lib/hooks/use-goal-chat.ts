"use client";

import { useState, useCallback, useRef } from "react";
import type {
  ChatMessage,
  GoalChatStage,
  GoalPlanData,
  UserAnswer,
  AskQuestionData,
} from "@/lib/types/goal-chat";
import { createGoal, createPhases, createWeeklyPlan, createDailyTasks, addTodo } from "@/lib/db/actions";
import { getWeekStart } from "@/lib/utils/date";

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

export function useGoalChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<GoalChatStage>("input");
  const [isStreaming, setIsStreaming] = useState(false);
  const [plan, setPlan] = useState<GoalPlanData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track full Anthropic-format history for API calls
  const historyRef = useRef<AnthropicMessage[]>([]);
  // Track the last tool_use_id for tool_result responses
  const lastToolUseIdRef = useRef<string | null>(null);

  const sendToApi = useCallback(
    async (apiMessages: AnthropicMessage[]) => {
      setIsStreaming(true);
      setError(null);

      // Add assistant placeholder message
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
            action: "goal-chat",
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

        // Collect all content blocks for the history
        const contentBlocks: AnthropicContentBlock[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.trim());

          for (const line of lines) {
            // Handle SSE format: "event: xxx" + "data: {json}"
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

                  // Add text block to history if there was text before this tool
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

                  if (currentToolName === "create_goal_plan") {
                    const planData = toolInput as GoalPlanData;
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
                                name: "create_goal_plan",
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
                // Pure text block ended
                contentBlocks.push({ type: "text", text: textContent });
              }
            }
          }
        }

        // Update history with the assistant's full response
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
    (goalText: string) => {
      setStage("chatting");
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: goalText,
      };
      setMessages([userMsg]);

      const apiMsg: AnthropicMessage = { role: "user", content: goalText };
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
      // Mark the question as answered in UI
      setMessages((prev) =>
        prev.map((m) =>
          m.toolUse?.name === "ask_question" && !m.answered
            ? { ...m, answered: true }
            : m
        )
      );

      // Format the answer text
      const answerText = answer.other_text
        ? `${answer.selected.join(", ")}. Additional: ${answer.other_text}`
        : answer.selected.join(", ");

      // Add user message to UI
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: answerText,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add tool_result to history (required by Anthropic API)
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
    if (!plan) return;
    setStage("saving");
    setError(null);

    try {
      const goal = await createGoal({
        title: plan.goal_title,
        description: plan.goal_description,
      });

      const phases = await createPhases(
        goal.id,
        plan.phases.map((p) => ({
          title: p.title,
          description: p.description,
          estimated_weeks: p.estimated_weeks,
        }))
      );

      // For short goals: save the direct weekly schedule
      if (plan.weekly_schedule && phases.length > 0) {
        const firstPhase = phases[0];
        const weeklyPlan = await createWeeklyPlan({
          phase_id: firstPhase.id,
          week_start: getWeekStart(),
          ai_summary: plan.weekly_schedule.ai_summary,
        });
        await createDailyTasks(
          weeklyPlan.id,
          plan.weekly_schedule.tasks.map((t) => ({
            day_of_week: t.day_of_week,
            title: t.title,
            description: t.description,
            time_estimate_minutes: t.time_estimate_minutes,
            time_slot: t.time_slot,
            sort_order: t.sort_order,
          }))
        );
      }

      // Save auto-generated goal todos
      if (plan.goal_todos && plan.goal_todos.length > 0) {
        for (const todo of plan.goal_todos) {
          await addTodo(todo.title, "Goal", todo.priority, null, goal.id);
        }
      }

      setStage("done");
      return goal.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("confirmPlan error:", msg);
      setError(msg);
      setStage("preview");
      return null;
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

    // Send tool_result for the create_goal_plan call, then the edit message
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
  };
}
