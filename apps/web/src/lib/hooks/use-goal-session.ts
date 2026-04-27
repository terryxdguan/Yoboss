"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import type {
  ChatMessage,
  GoalChatStage,
  GoalPlanData,
  UserAnswer,
  AskQuestionData,
  WeeklyPlanData,
} from "@/lib/types/goal-chat";
import type { WeeklyPlanChatContext } from "@/lib/ai/weekly-plan-chat";
import type { GoalDetailChatContext } from "@/lib/ai/goal-detail-chat";
import {
  createGoal,
  createPhases,
  createWeeklyPlan,
  createDailyTasks,
  createGoalDraft,
  saveMessage,
  upsertAssistantMessage,
  updateSessionSummary,
  markGoalDraftConfirmed,
} from "@/lib/db/actions";
import { getWeekStart, getTodayDayOfWeek } from "@/lib/utils/date";
import {
  fixDoubleSerializedPlan,
  type AnthropicMessage,
  type AnthropicContentBlock,
  type RebuiltHistory,
} from "@/lib/ai/draft-history";
import {
  buildMessagesWithMemory,
  MAX_RECENT_MESSAGES,
} from "@/lib/ai/session-memory";

let msgCounter = 0;
function genId() {
  return `msg_${Date.now()}_${++msgCounter}`;
}

// Maps Anthropic tool names to the friendly label shown in the streaming
// "is working on…" indicator. Anything not in this map gets a generic
// fallback so new tools still render something meaningful.
const TOOL_LABELS: Record<string, string> = {
  ask_question: "Asking a clarifying question",
  create_goal_plan: "Building your goal plan",
  create_weekly_plan: "Creating your weekly schedule",
};

// Labels for Anthropic's server-side tools used in the coach intent.
// Unlike client-side tool_use (ask_question / create_goal_plan), these
// are executed by Anthropic's backend — the client just surfaces a
// "working on…" badge while they run.
const SERVER_TOOL_LABELS: Record<string, string> = {
  web_search: "Searching the web",
  web_fetch: "Fetching a page",
  code_execution: "Running code",
};

/** Data loaded from a persisted draft session. Callers can get this by
 *  server-calling `loadDraftSession(id)` and running the result through
 *  `rebuildDraftHistory`. When supplied, the hook hydrates its initial
 *  state from the draft instead of starting a blank conversation. */
export interface UseGoalSessionInitialDraft {
  sessionId: string;
  rebuilt: RebuiltHistory;
  /** Prior rolling Haiku summary stored on chat_sessions.summary. Pass
   *  the raw column value through; the hook uses it to seed its
   *  `sessionSummary` state so the very first post-resume turn already
   *  ships a compressed context to the model. Null for fresh sessions
   *  that never got summarized. */
  sessionSummary?: string | null;
}

export interface UseGoalSessionOptions {
  initialDraft?: UseGoalSessionInitialDraft | null;
  /** Which planning sub-flow this hook instance is driving. Decides
   *  the system prompt + tool subset the server uses for each turn.
   *  Defaults to "goal-creation" for backward compat with existing
   *  /goals/create page. */
  intent?: "goal-creation" | "weekly-planning" | "coach";
  /** Required when intent === "weekly-planning". Snapshot of goal +
   *  phase + week index — injected into the system prompt server-side. */
  weeklyContext?: WeeklyPlanChatContext;
  /** Required when intent === "coach". Snapshot of goal/phases/week
   *  tasks used to inject context into the system prompt server-side. */
  coachContext?: GoalDetailChatContext;
  /** Fires when a `create_weekly_plan` tool finalizes. Goal-creation
   *  flow uses the existing `plan` state; weekly-planning callers use
   *  this callback (or read `weeklyPreview` state from the return). */
  onWeeklyPlanGenerated?: (plan: WeeklyPlanData) => void;
}

export function useGoalSession(options?: UseGoalSessionOptions) {
  const initialDraft = options?.initialDraft ?? null;
  const intent = options?.intent ?? "goal-creation";

  // ------------------------------------------------------------
  // State / refs (hydrated from draft if provided)
  // ------------------------------------------------------------
  //
  // On draft resume we want the UI to look as if the conversation never
  // stopped: all previous user/assistant messages present, the plan
  // preview re-populated, and the Anthropic API history ready for the
  // next continuation turn. All of that comes from `initialDraft.rebuilt`
  // which was produced by rebuildDraftHistory.

  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (!initialDraft) return [];
    const msgs: ChatMessage[] = initialDraft.rebuilt.uiMessages.map((m) => ({
      ...m,
    }));
    // Tag the last assistant row as interrupted so the UI can render the
    // "continue from here" warning without a separate code path.
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

  const initialStage: GoalChatStage = initialDraft
    ? initialDraft.rebuilt.latestGoalPlan
      ? "preview"
      : "chatting"
    : "input";

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [stage, setStage] = useState<GoalChatStage>(initialStage);
  const [isStreaming, setIsStreaming] = useState(false);
  const [plan, setPlan] = useState<GoalPlanData | null>(
    initialDraft?.rebuilt.latestGoalPlan ?? null
  );
  const [weeklyPreview, setWeeklyPreview] = useState<WeeklyPlanData | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  // Rolling Haiku summary of turns older than the last 5. Hydrated from
  // chat_sessions.summary on resume; updated client-side every 5 new
  // turns via /api/ai/summarize (same pattern as GoalChatPanel and the
  // team agent chat). The hook sends `summary + last 5 messages` to
  // the model each turn instead of the full history.
  const [sessionSummary, setSessionSummary] = useState<string | null>(
    initialDraft?.sessionSummary ?? null
  );

  // Full Anthropic history (with tool_use / tool_result blocks) that the
  // hook sends to /api/ai/plan on each turn. Hydrated from the draft if
  // resuming, otherwise empty until startChat seeds it.
  const historyRef = useRef<AnthropicMessage[]>(
    initialDraft ? [...initialDraft.rebuilt.apiMessages] : []
  );
  const lastToolUseIdRef = useRef<string | null>(
    initialDraft?.rebuilt.latestToolUseId ?? null
  );
  const sessionIdRef = useRef<string | null>(initialDraft?.sessionId ?? null);

  // Keep the latest weekly-planning option values in refs so that
  // sendToApi (whose useCallback identity is stable) reads fresh values
  // on every turn without forcing the streaming function to re-create.
  const intentRef = useRef(intent);
  intentRef.current = intent;
  const weeklyContextRef = useRef(options?.weeklyContext);
  weeklyContextRef.current = options?.weeklyContext;
  const coachContextRef = useRef(options?.coachContext);
  coachContextRef.current = options?.coachContext;
  const onWeeklyPlanGeneratedRef = useRef(options?.onWeeklyPlanGenerated);
  onWeeklyPlanGeneratedRef.current = options?.onWeeklyPlanGenerated;
  const sessionSummaryRef = useRef(sessionSummary);
  sessionSummaryRef.current = sessionSummary;

  // ------------------------------------------------------------
  // Streaming turn — the core of draft persistence.
  // ------------------------------------------------------------

  const sendToApi = useCallback(async (apiMessages: AnthropicMessage[]) => {
    setIsStreaming(true);
    setError(null);

    // Placeholder assistant message in React state.
    const assistantMsgId = genId();
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);

    // Create the DB placeholder up front so throttled flushes have a row
    // to update. If the session isn't ready or the insert fails we fall
    // back to a final upsert at the end of the turn (still better than
    // the old "lose everything on interrupt" behavior).
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
        console.error("[use-goal-session] Failed to create placeholder:", err);
      }
    }

    // Accumulators that survive into catch/finally.
    let textContent = "";
    let currentToolName = "";
    let currentToolId = "";
    let toolInputJson = "";
    let inToolUse = false;
    const contentBlocks: AnthropicContentBlock[] = [];
    let finalToolUse: { id: string; name: string; data: unknown } | null =
      null;

    // Throttled flush — at most one DB upsert every 2s. Mirrors the
    // pattern used by goal-chat-panel.tsx and team chat page.
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
      } catch {
        // Non-blocking; next flush will retry with the newer state.
      }
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
      const currentIntent = intentRef.current;
      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "goal-session",
          intent: currentIntent,
          context:
            currentIntent === "weekly-planning" && weeklyContextRef.current
              ? { weekly: weeklyContextRef.current }
              : currentIntent === "coach" && coachContextRef.current
              ? { coach: coachContextRef.current }
              : undefined,
          // Computed from the client's local clock so the prompt can skip
          // past days of the current week. Server has no reliable view of
          // the user's local day. Only the goal-creation intent's prompt
          // consumes this; weekly-planning already carries it inside
          // context.weekly. Harmless extra field for the coach intent.
          todayDow: getTodayDayOfWeek(),
          // Client-side context compression — send summary + last 5
          // instead of the full history. The rolling summary itself is
          // refreshed in the background every 5 turns below; until the
          // first refresh lands, a session that never hit the threshold
          // just sends `last 5` with no summary note.
          messages: buildMessagesWithMemory(
            sessionSummaryRef.current,
            apiMessages as unknown as { role: string; content: string | object[] }[],
          ) as unknown as AnthropicMessage[],
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

              // Immediately surface a "working on…" indicator in the UI.
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
            if (block?.type === "server_tool_use") {
              // Anthropic server-side tools (web_search / web_fetch /
              // code_execution). Unlike client-side tool_use, these have
              // no input_json_delta stream we need to consume — Anthropic
              // runs them and emits the result block directly. We just
              // surface them as toolActivity badges so the user sees
              // "Searching…" etc.
              const name = block.name || "";
              const label =
                SERVER_TOOL_LABELS[name] || `Running ${name}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolActivity: [
                          ...(m.toolActivity || []),
                          { type: name, label },
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
              // Bump live char count on the active tool badge so the
              // "Drafting your plan…" card has something to count
              // while the JSON streams silently. partial_json arrives
              // in moderate (50-200 char) chunks so this drives ~10-20
              // re-renders/sec, which is fine.
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

                // Remember for the final DB upsert: this is how resumed
                // drafts recover the structured plan without re-running
                // the model. Only the last tool_use of the turn wins
                // (turns typically have at most one ask_question OR one
                // create_goal_plan).
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

                if (currentToolName === "create_goal_plan") {
                  const planData = toolInput as GoalPlanData;
                  // Claude occasionally double-serializes nested fields in
                  // complex tool schemas — phases comes back as a JSON
                  // string instead of an inline array. Detect and fix.
                  fixDoubleSerializedPlan(planData);
                  if (!Array.isArray(planData.phases)) {
                    console.error(
                      "[use-goal-session] create_goal_plan: phases still not an array after deserialization fix.",
                      "type:", typeof planData.phases,
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
                              name: "create_goal_plan",
                              data: planData,
                            },
                          }
                        : m
                    )
                  );
                  scheduleFlush();
                }

                if (currentToolName === "create_weekly_plan") {
                  const weeklyData = toolInput as WeeklyPlanData;
                  // Same double-serialization quirk as create_goal_plan —
                  // Claude occasionally returns nested arrays as JSON
                  // strings.
                  if (typeof weeklyData.tasks === "string") {
                    try {
                      (weeklyData as unknown as Record<string, unknown>).tasks =
                        JSON.parse(weeklyData.tasks as unknown as string);
                    } catch {
                      /* guard below catches it */
                    }
                  }
                  if (!Array.isArray(weeklyData.tasks)) {
                    console.error(
                      "[use-goal-session] create_weekly_plan: tasks not array.",
                      "type:", typeof weeklyData.tasks,
                      "keys:", Object.keys(weeklyData),
                    );
                  } else {
                    setWeeklyPreview(weeklyData);
                    setStage("preview");
                    onWeeklyPlanGeneratedRef.current?.(weeklyData);
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
                              data: weeklyData,
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
              // Pure text block ended — add to history blocks. We'll
              // emit as a plain string at the end if there was no
              // tool_use.
              contentBlocks.push({ type: "text", text: textContent });
            }
          }
        }
      }

      // Update history with the assistant's full response. If no tool_use
      // was emitted, collapse to plain string to match the existing
      // convention for text-only turns.
      historyRef.current.push({
        role: "assistant",
        content: finalToolUse ? contentBlocks : textContent,
      });

      // Finalize the DB row with partial=false.
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
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
          console.error("[use-goal-session] Final upsert failed:", err);
        }
      } else if (sessionId && textContent) {
        // Placeholder was never created — save via legacy path so we at
        // least persist the completed turn.
        try {
          await saveMessage(sessionId, "assistant", textContent, {
            ...(finalToolUse ? { toolUse: finalToolUse } : {}),
          });
        } catch (err) {
          console.error("[use-goal-session] Legacy save failed:", err);
        }
      }

      // Rolling summary refresh — mirrors the pattern in GoalChatPanel
      // and the team agent chat. Every MAX_RECENT_MESSAGES new turns,
      // regenerate the summary in the background via /api/ai/summarize
      // and persist to chat_sessions.summary. The model sees an updated
      // summary starting from the next turn; the current turn is
      // already sent. Fire-and-forget — no await so the UI isn't
      // blocked while Haiku runs.
      if (sessionId) {
        const totalTurns = historyRef.current.length;
        if (
          totalTurns > MAX_RECENT_MESSAGES &&
          totalTurns % MAX_RECENT_MESSAGES === 1
        ) {
          const messagesToCompress = historyRef.current
            .slice(0, -MAX_RECENT_MESSAGES)
            .map((m) => ({
              role: m.role,
              content:
                typeof m.content === "string" ? m.content : "[media content]",
            }));
          fetch("/api/ai/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              oldSummary: sessionSummaryRef.current,
              messages: messagesToCompress,
            }),
          })
            .then((r) => r.json())
            .then(async (data: { summary?: string }) => {
              if (data.summary) {
                setSessionSummary(data.summary);
                try {
                  await updateSessionSummary(sessionId, data.summary);
                } catch (err) {
                  console.error(
                    "[use-goal-session] updateSessionSummary failed:",
                    err,
                  );
                }
              }
            })
            .catch((err) =>
              console.error("[use-goal-session] summarize failed:", err),
            );
        }
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Something went wrong";
      setError(errMsg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content:
                  textContent ||
                  "Sorry, something went wrong. Please try again.",
                interrupted: true,
              }
            : m
        )
      );

      // Persist whatever partial state we have plus the interrupted flag.
      // Keeps the draft resumable: the next mount will see a partial last
      // assistant row and the UI can let the user continue.
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
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
        } catch {
          // Non-blocking
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }, []);

  // ------------------------------------------------------------
  // Start a fresh chat — creates the draft session + persists the
  // opening user message before kicking off the first stream.
  // ------------------------------------------------------------

  const startChat = useCallback(
    async (goalText: string) => {
      setStage("chatting");
      const userMsgId = genId();
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: "user",
        content: goalText,
      };
      setMessages([userMsg]);

      const apiMsg: AnthropicMessage = { role: "user", content: goalText };
      historyRef.current = [apiMsg];

      // Create the draft session. Failure here is non-fatal — the chat
      // still streams, just without persistence. The in-memory state
      // still works so the user can finish the conversation, they just
      // lose the ability to resume on refresh. We log and continue.
      if (!sessionIdRef.current) {
        try {
          // Use the first line of the user's input (up to 60 chars) as a
          // human-readable title for the Continue draft list.
          const title = goalText.slice(0, 60) || "New Goal Draft";
          const session = await createGoalDraft({ title });
          sessionIdRef.current = session.id;
        } catch (err) {
          console.error("[use-goal-session] createGoalDraft failed:", err);
        }
      }

      if (sessionIdRef.current) {
        try {
          await saveMessage(sessionIdRef.current, "user", goalText);
        } catch (err) {
          console.error(
            "[use-goal-session] saveMessage (initial) failed:",
            err
          );
        }
      }

      sendToApi([apiMsg]);
    },
    [sendToApi]
  );

  // ------------------------------------------------------------
  // Free-form user follow-up message.
  //
  // IMPORTANT: if the last assistant turn emitted a tool_use block
  // (ask_question, create_goal_plan, etc.), the Anthropic API requires
  // the very next user message to be a tool_result. Sending plain text
  // instead causes a 400 and permanently poisons the conversation.
  //
  // This happens in practice when: plan preview crashes → overlay
  // disappears → user types directly in the input box → sendMessage
  // pushes plain text → all subsequent API calls fail.
  //
  // Fix: detect a pending tool_use via lastToolUseIdRef and auto-inject
  // a synthetic tool_result before the user's free-text message.
  // ------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);

      // If the last assistant turn had a tool_use that hasn't been
      // answered with a tool_result yet, inject one now. We detect
      // this by checking whether the last entry in historyRef is an
      // assistant message with content blocks (tool_use lives there).
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
            console.error("[use-goal-session] saveMessage failed:", err);
          }
        }
      } else {
        const apiMsg: AnthropicMessage = { role: "user", content: text };
        historyRef.current.push(apiMsg);

        if (sessionIdRef.current) {
          try {
            await saveMessage(sessionIdRef.current, "user", text);
          } catch (err) {
            console.error("[use-goal-session] saveMessage failed:", err);
          }
        }
      }

      sendToApi([...historyRef.current]);
    },
    [sendToApi]
  );

  // ------------------------------------------------------------
  // Answer an ask_question — emits a tool_result block on the API side
  // and persists the answer as a regular user row with toolResultFor
  // metadata so rebuildDraftHistory can round-trip it.
  // ------------------------------------------------------------

  const answerQuestion = useCallback(
    async (answer: UserAnswer) => {
      // Mark the question as answered in UI (stops rendering buttons).
      setMessages((prev) =>
        prev.map((m) =>
          m.toolUse?.name === "ask_question" && !m.answered
            ? { ...m, answered: true }
            : m
        )
      );

      // Format the answer text for the UI bubble.
      const answerText = answer.other_text
        ? `${answer.selected.join(", ")}. Additional: ${answer.other_text}`
        : answer.selected.join(", ");

      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: answerText,
      };
      setMessages((prev) => [...prev, userMsg]);

      // Add tool_result to history (required by Anthropic API).
      const toolUseId = lastToolUseIdRef.current || "";
      const toolResultContent = JSON.stringify(answer);
      const toolResultMsg: AnthropicMessage = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: toolResultContent,
          },
        ],
      };
      historyRef.current.push(toolResultMsg);

      // Persist: store the rendered answer text as the row content and
      // stash the tool_use_id in metadata. rebuildDraftHistory will
      // re-emit a proper tool_result block on resume using the content
      // as the inner payload. That means the Anthropic-side content of
      // the tool_result block changes from `stringify(answer)` to
      // `answerText` after a resume round-trip — functionally
      // equivalent as far as the model is concerned since both are
      // human-readable representations of the same answer, but worth
      // flagging if we ever switch to a strict JSON-only tool_result
      // convention.
      if (sessionIdRef.current) {
        try {
          await saveMessage(sessionIdRef.current, "user", answerText, {
            toolResultFor: toolUseId,
          });
        } catch (err) {
          console.error(
            "[use-goal-session] saveMessage (answer) failed:",
            err
          );
        }
      }
      // Mark the answered flag on the assistant row in the DB too so the
      // AskQuestion card stays disabled on reload.
      if (sessionIdRef.current) {
        try {
          // We only store answered=true via the next upsertAssistantMessage
          // in-flight, but for past rows we'd need a dedicated update.
          // Leaving this as a TODO — the worst case is the card re-appears
          // enabled on reload and the user clicks it again, which would
          // send a duplicate tool_result. Low priority since a normal
          // successful turn immediately follows the answer and rewrites
          // the assistant row anyway.
        } catch {
          // intentional
        }
      }

      sendToApi([...historyRef.current]);
    },
    [sendToApi]
  );

  // ------------------------------------------------------------
  // Confirm — writes the real goal/phase/weekly_plan rows and marks
  // the draft session as confirmed so it drops off the Continue list.
  // ------------------------------------------------------------

  const confirmPlan = useCallback(async () => {
    if (!plan) return;
    setStage("saving");
    setError(null);

    try {
      // Step 1: createGoal must come first — everything below needs goal.id.
      const goal = await createGoal({
        title: plan.goal_title,
        description: plan.goal_description,
      });

      // Step 2: kick off everything that only needs goal.id IN PARALLEL.
      // Was previously: phases → weekly_plan → daily_tasks → N×addTodo
      // → markDraftConfirmed strung as five sequential await chains
      // (~5 round-trips). Now they fan out and total wall time is
      // dominated by the longest branch (the phases→weekly→tasks chain
      // for plans with a weekly_schedule, otherwise just phases).
      //
      // The weekly-schedule branch still has internal ordering because
      // createWeeklyPlan needs phases[0].id and createDailyTasks needs
      // weeklyPlan.id — those stay serial inside the branch but the
      // branch itself races against the todo + draft-mark branches.

      const writeWeeklySchedule = async () => {
        // createPhases bulk-inserts each phase's milestones into the
        // phase_tasks table (table name kept for now; row semantic is
        // milestone — read-only sub-phase markers, not actionable todos).
        const phases = await createPhases(
          goal.id,
          plan.phases.map((p) => ({
            title: p.title,
            description: p.description,
            estimated_weeks: p.estimated_weeks,
            milestones: p.milestones ?? [],
          }))
        );
        if (plan.weekly_schedule && phases.length > 0) {
          const firstPhase = phases[0];
          const weeklyPlan = await createWeeklyPlan({
            phase_id: firstPhase.id,
            week_start: getWeekStart(),
            ai_summary: plan.weekly_schedule.ai_summary,
          });
          // Defense-in-depth: even though the goal-creation prompt now tells
          // the model to skip past days, a non-zero portion of generations
          // still emit Mon/Tue tasks when the user creates a goal mid-week.
          // Drop them here so the user never sees stale "past" rows.
          const todayDow = getTodayDayOfWeek();
          const futureTasks = plan.weekly_schedule.tasks.filter(
            (t) => t.day_of_week >= todayDow,
          );
          if (futureTasks.length > 0) {
            await createDailyTasks(
              weeklyPlan.id,
              futureTasks.map((t) => ({
                day_of_week: t.day_of_week,
                title: t.title,
                description: t.description,
                time_estimate_minutes: t.time_estimate_minutes,
                time_slot: t.time_slot,
                sort_order: t.sort_order,
              }))
            );
          }
        }
      };

      const markDraftConfirmed = async () => {
        if (!sessionIdRef.current) return;
        try {
          await markGoalDraftConfirmed(sessionIdRef.current, goal.id);
        } catch (err) {
          // Non-fatal — the real goal is already written; worst case
          // the stale draft stays on the Continue list for the user
          // to dismiss manually.
          console.error(
            "[use-goal-session] markGoalDraftConfirmed failed:",
            err
          );
        }
      };

      await Promise.all([
        writeWeeklySchedule(),
        markDraftConfirmed(),
      ]);

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

  // ------------------------------------------------------------
  // Request an edit round — emits a tool_result for the plan tool_use
  // and follows up with a plain-text "please adjust" user message.
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

    // Send tool_result for the create_goal_plan call, then the edit message
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
        // Persist the tool_result as a tool_result-tagged user row so
        // rebuildDraftHistory can recreate the block. The actual content
        // we write is the human-readable "User wants to edit the plan"
        // string; the original JSON-less nature of this one is fine
        // because it's not a structured answer.
        await saveMessage(
          sessionIdRef.current,
          "user",
          "User wants to edit the plan",
          { toolResultFor: toolUseId }
        );
        await saveMessage(sessionIdRef.current, "user", editText);
      } catch (err) {
        console.error("[use-goal-session] editPlan persist failed:", err);
      }
    }

    sendToApi([...historyRef.current]);
  }, [sendToApi]);

  // ------------------------------------------------------------
  // Weekly-planning equivalent of editPlan — clears the weekly preview
  // and asks the model to revise. No-op for goal-creation intent so
  // existing /goals/create callers never accidentally hit this path.
  // ------------------------------------------------------------

  const requestEdit = useCallback(async () => {
    if (intentRef.current !== "weekly-planning") return;
    setWeeklyPreview(null);
    const editText =
      "I'd like to adjust the weekly plan. What would you change?";
    const userMsg: ChatMessage = {
      id: genId(),
      role: "user",
      content: editText,
    };
    setMessages((prev) => [...prev, userMsg]);

    const toolUseId = lastToolUseIdRef.current || "";
    historyRef.current.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: "User wants to adjust the plan",
        },
      ],
    });
    historyRef.current.push({ role: "user", content: editText });

    if (sessionIdRef.current) {
      try {
        await saveMessage(
          sessionIdRef.current,
          "user",
          "User wants to adjust the plan",
          { toolResultFor: toolUseId }
        );
        await saveMessage(sessionIdRef.current, "user", editText);
      } catch (err) {
        console.error(
          "[use-goal-session] requestEdit persist failed:",
          err
        );
      }
    }

    sendToApi([...historyRef.current]);
  }, [sendToApi]);

  return {
    messages,
    stage,
    isStreaming,
    plan,
    weeklyPreview,
    clearWeeklyPreview: () => setWeeklyPreview(null),
    error,
    draftSessionId: sessionIdRef.current,
    startChat,
    sendMessage,
    answerQuestion,
    confirmPlan,
    editPlan,
    requestEdit,
  };
}
