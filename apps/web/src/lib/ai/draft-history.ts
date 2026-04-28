// Draft chat history rebuild — used by use-goal-session.
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
// both goal-creation and weekly-planning intents need identical rehydration
// logic, and it's easy to test as a pure function of the DB rows.

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

  // Pre-pass: collect every tool_use_id that already has a matching
  // tool_result in history. `metadata.answered` was never persisted on
  // the assistant row, so without this the resumed UI renders every
  // past ask_question as still-interactive — the user can misclick an
  // old goal-creation question and fire a stale tool_result.
  const answeredToolUseIds = new Set<string>();
  for (const row of messages) {
    if (row.role === "user" && row.metadata?.toolResultFor) {
      answeredToolUseIds.add(row.metadata.toolResultFor);
    }
  }

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
      } else if (latestToolUseId && needsToolResultBefore(apiMessages)) {
        // Edge case: a plain-text user message was saved after an
        // assistant tool_use WITHOUT the required tool_result (this
        // happens when the plan preview crashes and the user types
        // directly into the input). The Anthropic API requires a
        // tool_result between the tool_use and the next user text.
        // Auto-inject a synthetic tool_result so the conversation
        // can continue without a permanent 400 loop.
        apiMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: latestToolUseId,
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
          fixDoubleSerializedPlan(candidate);
          if (Array.isArray(candidate?.phases)) {
            latestGoalPlan = candidate;
          }
        } else if (toolUse.name === "create_weekly_plan") {
          const candidate = toolUse.data as WeeklyPlanData;
          if (typeof candidate?.tasks === "string") {
            try { (candidate as unknown as Record<string, unknown>).tasks = JSON.parse(candidate.tasks as unknown as string); } catch { /* ignore */ }
          }
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
        answered:
          row.metadata?.answered === true ||
          (uiToolUse ? answeredToolUseIds.has(uiToolUse.id) : false),
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

/** Fix Claude's double-serialization quirk where nested arrays in
 *  create_goal_plan tool_use are emitted as JSON strings instead of
 *  inline arrays. Mutates the candidate in place. */
export function fixDoubleSerializedPlan(plan: GoalPlanData): void {
  const p = plan as unknown as Record<string, unknown>;
  if (typeof p.phases === "string") {
    try { p.phases = JSON.parse(p.phases as string); } catch { /* leave as-is */ }
  }
  // Also fix nested milestones arrays inside each phase — same quirk
  // can hit one level deeper.
  if (Array.isArray(p.phases)) {
    for (const phase of p.phases as Record<string, unknown>[]) {
      if (typeof phase.milestones === "string") {
        try { phase.milestones = JSON.parse(phase.milestones as string); } catch { /* leave as-is */ }
      }
    }
  }
}

/** Returns true if the last API message is an assistant turn containing a
 *  tool_use block that hasn't been followed by a tool_result yet. The
 *  Anthropic API returns 400 if we send a plain user message in that case. */
function needsToolResultBefore(apiMsgs: AnthropicMessage[]): boolean {
  if (apiMsgs.length === 0) return false;
  const last = apiMsgs[apiMsgs.length - 1];
  if (last.role !== "assistant") return false;
  if (!Array.isArray(last.content)) return false;
  return last.content.some((b) => b.type === "tool_use");
}
