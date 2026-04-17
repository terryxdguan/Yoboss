"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import type {
  ChatMessage,
  WeeklyPlanData,
  UserAnswer,
  AskQuestionData,
} from "@/lib/types/goal-chat";
import {
  createWeeklyDraft,
  saveMessage,
  upsertAssistantMessage,
  markWeeklyDraftConfirmed,
} from "@/lib/db/actions";
import { createClient } from "@/lib/db/client";
import {
  fixDoubleSerializedPlan,
  type AnthropicMessage,
  type AnthropicContentBlock,
  type RebuiltHistory,
} from "@/lib/ai/draft-history";

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

// Maps Anthropic tool names to the friendly label shown in the streaming
// "is working on…" indicator. Mirror of the table in use-goal-session.ts;
// kept inline so this hook has no dependency on the other hook's
// internals. Add new tools here when the weekly-plan prompt grows.
const TOOL_LABELS: Record<string, string> = {
  ask_question: "Asking a clarifying question",
  create_weekly_plan: "Creating your weekly schedule",
};

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

export type WeeklyPlanChatStage = "chatting" | "preview" | "saving" | "done";

export interface UseWeeklyPlanChatInitialDraft {
  sessionId: string;
  rebuilt: RebuiltHistory;
  /** Restore the phase/week context so confirmPlan knows where to write. */
  phaseId: string;
  weekStart: string;
}

export interface UseWeeklyPlanChatOptions {
  initialDraft?: UseWeeklyPlanChatInitialDraft | null;
}

export function useWeeklyPlanChat(options?: UseWeeklyPlanChatOptions) {
  const initialDraft = options?.initialDraft ?? null;

  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (!initialDraft) return [];
    const msgs = initialDraft.rebuilt.uiMessages.map((m) => ({ ...m }));
    if (initialDraft.rebuilt.lastAssistantInterrupted) {
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
          msgs[i] = { ...msgs[i], interrupted: true };
          break;
        }
      }
    }
    return msgs;
  }, [initialDraft]);

  const initialStage: WeeklyPlanChatStage = initialDraft
    ? initialDraft.rebuilt.latestWeeklyPlan
      ? "preview"
      : "chatting"
    : "chatting";

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [stage, setStage] = useState<WeeklyPlanChatStage>(initialStage);
  const [isStreaming, setIsStreaming] = useState(false);
  const [plan, setPlan] = useState<WeeklyPlanData | null>(
    initialDraft?.rebuilt.latestWeeklyPlan ?? null
  );
  const [error, setError] = useState<string | null>(null);

  const historyRef = useRef<AnthropicMessage[]>(
    initialDraft ? [...initialDraft.rebuilt.apiMessages] : []
  );
  const lastToolUseIdRef = useRef<string | null>(
    initialDraft?.rebuilt.latestToolUseId ?? null
  );
  const sessionIdRef = useRef<string | null>(initialDraft?.sessionId ?? null);
  const contextRef = useRef<{ phaseId: string; weekStart: string } | null>(
    initialDraft
      ? { phaseId: initialDraft.phaseId, weekStart: initialDraft.weekStart }
      : null
  );

  // ------------------------------------------------------------
  // Streaming turn
  // ------------------------------------------------------------

  const sendToApi = useCallback(async (apiMessages: AnthropicMessage[]) => {
    setIsStreaming(true);
    setError(null);

    const assistantMsgId = genId();
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);

    const sessionId = sessionIdRef.current;
    let assistantDbId: string | null = null;
    if (sessionId) {
      try {
        const placeholder = await upsertAssistantMessage({
          sessionId,
          messageId: null,
          content: "",
          metadata: { partial: true },
        });
        assistantDbId = placeholder.id;
      } catch (err) {
        console.error("[use-weekly-plan-chat] placeholder failed:", err);
      }
    }

    let textContent = "";
    let currentToolName = "";
    let currentToolId = "";
    let toolInputJson = "";
    let inToolUse = false;
    const contentBlocks: AnthropicContentBlock[] = [];
    let finalToolUse: { id: string; name: string; data: unknown } | null = null;

    let flushInFlight = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let finalized = false;

    const flushNow = async () => {
      if (flushInFlight || finalized || !assistantDbId || !sessionId) return;
      flushInFlight = true;
      try {
        await upsertAssistantMessage({
          sessionId,
          messageId: assistantDbId,
          content: textContent,
          metadata: {
            partial: true,
            ...(finalToolUse ? { toolUse: finalToolUse } : {}),
          },
        });
      } catch { /* non-blocking */ }
      flushInFlight = false;
    };

    const scheduleFlush = () => {
      if (flushTimer || finalized) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushNow();
      }, 2000);
    };

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
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `API error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.trim());

        for (const line of lines) {
          if (line.startsWith("event:")) continue;
          const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;

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

              // Surface a "working on…" badge in the bubble. Without
              // this the user sees a static empty message during the
              // long silent JSON streaming for create_weekly_plan.
              const label =
                TOOL_LABELS[currentToolName] || `Running ${currentToolName}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolActivity: [
                          ...(m.toolActivity || []),
                          { type: currentToolName, label },
                        ],
                      }
                    : m
                )
              );
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
              scheduleFlush();
            }
            if (delta?.type === "input_json_delta" && delta.partial_json) {
              toolInputJson += delta.partial_json;
              // Bump live char count so the "Drafting your plan…" card
              // has something to count during the silent JSON stream.
              const chunkLen = delta.partial_json.length;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMsgId || !m.toolActivity?.length) return m;
                  const updated = m.toolActivity.slice();
                  const last = updated[updated.length - 1];
                  updated[updated.length - 1] = {
                    ...last,
                    draftingChars: (last.draftingChars ?? 0) + chunkLen,
                  };
                  return { ...m, toolActivity: updated };
                })
              );
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

                finalToolUse = {
                  id: currentToolId,
                  name: currentToolName,
                  data: toolInput,
                };

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
                  scheduleFlush();
                }

                if (currentToolName === "create_weekly_plan") {
                  const planData = toolInput as WeeklyPlanData;
                  // Fix Claude double-serialization quirk
                  if (typeof planData.tasks === "string") {
                    try {
                      (planData as unknown as Record<string, unknown>).tasks = JSON.parse(planData.tasks as unknown as string);
                    } catch { /* guard below catches it */ }
                  }
                  if (!Array.isArray(planData.tasks)) {
                    console.error(
                      "[use-weekly-plan-chat] create_weekly_plan: tasks not array.",
                      "type:", typeof planData.tasks,
                      "keys:", Object.keys(planData),
                    );
                  } else {
                    setPlan(planData);
                    setStage("preview");
                  }
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
                  scheduleFlush();
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
        content: finalToolUse ? contentBlocks : textContent,
      });

      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      finalized = true;
      if (sessionId && assistantDbId) {
        try {
          await upsertAssistantMessage({
            sessionId,
            messageId: assistantDbId,
            content: textContent,
            metadata: {
              partial: false,
              ...(finalToolUse ? { toolUse: finalToolUse } : {}),
            },
          });
        } catch (err) {
          console.error("[use-weekly-plan-chat] final upsert failed:", err);
        }
      } else if (sessionId && textContent) {
        try {
          await saveMessage(sessionId, "assistant", textContent, {
            ...(finalToolUse ? { toolUse: finalToolUse } : {}),
          });
        } catch (err) {
          console.error("[use-weekly-plan-chat] legacy save failed:", err);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Something went wrong";
      setError(errMsg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: textContent || "Sorry, something went wrong. Please try again.", interrupted: true }
            : m
        )
      );
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      finalized = true;
      if (sessionId && assistantDbId) {
        try {
          await upsertAssistantMessage({
            sessionId,
            messageId: assistantDbId,
            content: textContent,
            metadata: {
              partial: false,
              interrupted: true,
              ...(finalToolUse ? { toolUse: finalToolUse } : {}),
            },
          });
        } catch { /* non-blocking */ }
      }
    } finally {
      setIsStreaming(false);
    }
  }, []);

  // ------------------------------------------------------------
  // Start a fresh chat
  // ------------------------------------------------------------

  const startChat = useCallback(
    async (context: WeeklyPlanChatContext, phaseId: string, weekStart: string) => {
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

      if (!sessionIdRef.current) {
        try {
          const session = await createWeeklyDraft({
            weeklyContext: {
              phaseId,
              weekStart,
              goalTitle: context.goalTitle,
              goalDescription: context.goalDescription,
              phaseTitle: context.phaseTitle,
              phaseDescription: context.phaseDescription,
              weekNumber: context.weekNumber,
              estimatedWeeks: context.estimatedWeeks,
              isMidWeekStart: context.isMidWeekStart,
              startDayOfWeek: context.startDayOfWeek,
            },
            title: `Week ${context.weekNumber}: ${context.phaseTitle}`.slice(0, 60),
          });
          sessionIdRef.current = session.id;
        } catch (err) {
          console.error("[use-weekly-plan-chat] createWeeklyDraft failed:", err);
        }
      }

      if (sessionIdRef.current) {
        try {
          await saveMessage(sessionIdRef.current, "user", initialText);
        } catch (err) {
          console.error("[use-weekly-plan-chat] saveMessage (initial) failed:", err);
        }
      }

      sendToApi([apiMsg]);
    },
    [sendToApi]
  );

  // ------------------------------------------------------------
  // Free-form user message (with tool_result auto-injection)
  // ------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      const lastEntry = historyRef.current[historyRef.current.length - 1];
      const needsToolResult =
        lastEntry?.role === "assistant" &&
        Array.isArray(lastEntry.content) &&
        lastEntry.content.some(
          (b: AnthropicContentBlock) => b.type === "tool_use"
        );

      if (needsToolResult && lastToolUseIdRef.current) {
        const syntheticResult: AnthropicMessage = {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: lastToolUseIdRef.current,
              content: text,
            },
          ],
        };
        historyRef.current.push(syntheticResult);
        if (sessionIdRef.current) {
          try {
            await saveMessage(sessionIdRef.current, "user", text, {
              toolResultFor: lastToolUseIdRef.current,
            });
          } catch (err) {
            console.error("[use-weekly-plan-chat] saveMessage failed:", err);
          }
        }
      } else {
        const apiMsg: AnthropicMessage = { role: "user", content: text };
        historyRef.current.push(apiMsg);
        if (sessionIdRef.current) {
          try {
            await saveMessage(sessionIdRef.current, "user", text);
          } catch (err) {
            console.error("[use-weekly-plan-chat] saveMessage failed:", err);
          }
        }
      }

      sendToApi([...historyRef.current]);
    },
    [sendToApi]
  );

  // ------------------------------------------------------------
  // Answer an ask_question
  // ------------------------------------------------------------

  const answerQuestion = useCallback(
    async (answer: UserAnswer) => {
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

      const toolUseId = lastToolUseIdRef.current || "";
      const toolResultMsg: AnthropicMessage = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: JSON.stringify(answer),
          },
        ],
      };
      historyRef.current.push(toolResultMsg);

      if (sessionIdRef.current) {
        try {
          await saveMessage(sessionIdRef.current, "user", answerText, {
            toolResultFor: toolUseId,
          });
        } catch (err) {
          console.error("[use-weekly-plan-chat] saveMessage (answer) failed:", err);
        }
      }

      sendToApi([...historyRef.current]);
    },
    [sendToApi]
  );

  // ------------------------------------------------------------
  // Confirm
  // ------------------------------------------------------------

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

      if (sessionIdRef.current) {
        try {
          await markWeeklyDraftConfirmed(sessionIdRef.current, weeklyPlanRecord.id);
        } catch (err) {
          console.error("[use-weekly-plan-chat] markWeeklyDraftConfirmed failed:", err);
        }
      }

      setStage("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("confirmPlan error:", msg);
      setError(msg);
      setStage("preview");
    }
  }, [plan]);

  // ------------------------------------------------------------
  // Edit plan
  // ------------------------------------------------------------

  const editPlan = useCallback(async () => {
    setStage("chatting");
    const editText = "I'd like to adjust the plan. What would you change?";
    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content: editText,
    };
    setMessages((prev) => [...prev, userMsg]);

    const toolUseId = lastToolUseIdRef.current || "";
    const toolResultMsg: AnthropicMessage = {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: "User wants to edit the plan",
        },
      ],
    };
    historyRef.current.push(toolResultMsg);

    const editMsg: AnthropicMessage = { role: "user", content: editText };
    historyRef.current.push(editMsg);

    if (sessionIdRef.current) {
      try {
        await saveMessage(sessionIdRef.current, "user", "User wants to edit the plan", {
          toolResultFor: toolUseId,
        });
        await saveMessage(sessionIdRef.current, "user", editText);
      } catch (err) {
        console.error("[use-weekly-plan-chat] editPlan persist failed:", err);
      }
    }

    sendToApi([...historyRef.current]);
  }, [sendToApi]);

  // ------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------

  const reset = useCallback(() => {
    setMessages([]);
    setStage("chatting");
    setPlan(null);
    setError(null);
    historyRef.current = [];
    lastToolUseIdRef.current = null;
    contextRef.current = null;
    sessionIdRef.current = null;
  }, []);

  return {
    messages,
    stage,
    isStreaming,
    plan,
    error,
    draftSessionId: sessionIdRef.current,
    startChat,
    sendMessage,
    answerQuestion,
    confirmPlan,
    editPlan,
    reset,
  };
}
