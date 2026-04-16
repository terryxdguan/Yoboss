// Draft chat history rebuild — shared between use-goal-chat and
// use-weekly-plan-chat.
//
// When a draft session is resumed, we need to reconstruct two things from
// the persisted chat_messages rows:
//
//   1. The UI ChatMessage[] that the hook renders (with toolUse / answered
//      on assistant rows and plain content on user rows).
//   2. The Anthropic-format history the hook sends to /api/ai/plan on the
//      next turn. This has to round-trip the tool_use / tool_result blocks
//      so the Claude API can continue the conversation from where it left
//      off without losing tool state.
//
// The reason this is a separate helper rather than inline in the hook:
// both goal-chat and weekly-plan-chat need identical rehydration logic,
// and it's easy to test as a pure function of the DB rows.

import type { ChatMessage as DBChatMessage } from "@/lib/types/database";
import type {
  ChatMessage as UIChatMessage,
  AskQuestionData,
  GoalPlanData,
  WeeklyPlanData,
} from "@/lib/types/goal-chat";

export interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface RebuiltHistory {
  /** Messages for React state — shape the UI components already render. */
  uiMessages: UIChatMessage[];
  /** Anthropic API history — pass directly to /api/ai/plan `messages`. */
  apiMessages: AnthropicMessage[];
  /** Latest create_goal_plan tool_use payload, if any. Hook hydrates
   *  `plan` state from this so the preview pane shows up on resume. */
  latestGoalPlan: GoalPlanData | null;
  /** Latest create_weekly_plan tool_use payload, if any. */
  latestWeeklyPlan: WeeklyPlanData | null;
  /** tool_use_id of the most recent ask_question / create_*_plan that still
   *  needs a follow-up. Hook stores this in lastToolUseIdRef so editPlan
   *  and answerQuestion know which tool_use id to emit tool_result for. */
  latestToolUseId: string | null;
  /** True if the last assistant message is marked partial or interrupted.
   *  UI uses this to decide whether to render the interrupted warning and
   *  offer "continue from here". */
  lastAssistantInterrupted: boolean;
}

/** Rebuild UI + Anthropic history from persisted draft chat messages.
 *
 *  Assumptions:
 *  - `messages` is sorted by created_at ascending (the loadDraftSession
 *    helper already orders this way).
 *  - User messages that are tool_result responses have
 *    `metadata.toolResultFor` set to the tool_use_id they're answering.
 *    Their `content` field is the stringified JSON payload that was
 *    originally sent to Anthropic as the tool_result body.
 *  - Assistant messages that emitted a tool_use block have it stored on
 *    `metadata.toolUse = { id, name, data }`. `content` is the
 *    accompanying text (may be empty).
 */
export function rebuildDraftHistory(messages: DBChatMessage[]): RebuiltHistory {
  const uiMessages: UIChatMessage[] = [];
  const apiMessages: AnthropicMessage[] = [];
  let latestGoalPlan: GoalPlanData | null = null;
  let latestWeeklyPlan: WeeklyPlanData | null = null;
  let latestToolUseId: string | null = null;
  let lastAssistantInterrupted = false;

  for (const row of messages) {
    if (row.role === "user") {
      const toolResultFor = row.metadata?.toolResultFor;

      // UI side: user messages always render as plain content. tool_result
      // responses get stringified in content already (answerQuestion stores
      // the rendered answer text; the original JSON is re-parsed below for
      // the Anthropic history).
      uiMessages.push({
        id: row.id,
        role: "user",
        content: row.content,
      });

      if (toolResultFor) {
        // For the API side, reconstitute a proper tool_result block.
        apiMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolResultFor,
              content: row.content,
            },
          ],
        });
      } else {
        apiMessages.push({ role: "user", content: row.content });
      }
      continue;
    }

    if (row.role === "assistant") {
      const toolUse = row.metadata?.toolUse;
      const partial = row.metadata?.partial === true;
      const interrupted = row.metadata?.interrupted === true;
      lastAssistantInterrupted = partial || interrupted;

      // UI side: attach toolUse if present so the preview / question UI
      // can re-render from it.
      let uiToolUse: UIChatMessage["toolUse"] = undefined;
      if (toolUse && typeof toolUse === "object") {
        uiToolUse = {
          id: toolUse.id,
          name: toolUse.name,
          data: toolUse.data as AskQuestionData | GoalPlanData | WeeklyPlanData,
        };
        latestToolUseId = toolUse.id;

        if (toolUse.name === "create_goal_plan") {
          const candidate = toolUse.data as GoalPlanData;
          // Only accept plans with a valid phases array — Claude can
          // emit malformed tool_use on interrupted/resumed conversations.
          if (Array.isArray(candidate?.phases)) {
            latestGoalPlan = candidate;
          }
        } else if (toolUse.name === "create_weekly_plan") {
          const candidate = toolUse.data as WeeklyPlanData;
          if (Array.isArray(candidate?.tasks)) {
            latestWeeklyPlan = candidate;
          }
        }
      }

      uiMessages.push({
        id: row.id,
        role: "assistant",
        content: row.content,
        toolUse: uiToolUse,
        answered: row.metadata?.answered === true,
      });

      // API side: emit text block + optional tool_use block. If the assistant
      // turn only has text (no tool_use), fall back to plain string content
      // so we don't bloat the payload with a single-element array.
      if (toolUse) {
        const blocks: AnthropicContentBlock[] = [];
        if (row.content) {
          blocks.push({ type: "text", text: row.content });
        }
        blocks.push({
          type: "tool_use",
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.data as Record<string, unknown>,
        });
        apiMessages.push({ role: "assistant", content: blocks });
      } else {
        apiMessages.push({ role: "assistant", content: row.content });
      }
      continue;
    }

    // Unknown role — skip but don't crash. Shouldn't happen in practice.
  }

  return {
    uiMessages,
    apiMessages,
    latestGoalPlan,
    latestWeeklyPlan,
    latestToolUseId,
    lastAssistantInterrupted,
  };
}
