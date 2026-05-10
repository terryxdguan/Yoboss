# Adjust Flow Redesign — Design Spec

**Date:** 2026-05-09
**Status:** Approved (pending implementation plan)

## Problem

Both the Goal-Creation roadmap-preview and the Weekly-Planning plan-preview-modal have an "Adjust" button. Clicking it today:

1. **Sends a fixed user message** ("I'd like to adjust the [weekly] plan. What would you change?") to the chat without giving the user any input field.
2. **Immediately fires `/api/ai/plan`** with that message + a `tool_result` for the previous plan tool_use_id.
3. **Fails with "Failed to fetch"** in practice — the request is rejected (likely because `lastToolUseIdRef.current` is empty or because the orphaned tool block crosses the memory-compression window).

Result: the user can never actually adjust a plan.

What the user wants instead:

- Click Adjust → a free-text question card appears in the chat (same visual pattern as the final clarifying "Anything else worth mentioning?" card).
- User types what they'd like changed.
- On submit, the AI generates a revised plan, which surfaces in the same preview modal.
- The new plan also has Adjust → repeat indefinitely.
- Empty submission is **not allowed** — the button stays disabled until text is entered.

## Goal

Replace the immediate-send adjust path with a deferred-on-user-input path, in both the Goal-Creation and Weekly-Planning flows. Fix the underlying API failure as part of the rewrite.

## Non-Goals

- No change to the `create_goal_plan` / `create_weekly_plan` tool schemas, system prompts, or `/api/ai/plan` route.
- No change to the existing `ask_question` clarifying flow (`AskQuestionCard`, `answerQuestion` hook function).
- No change to plan/weekly preview rendering or save logic.
- No change to memory compression itself, only a defensive check that the latest tool_use is preserved when an adjust request is sent.

---

## Component Inventory

| Component | Status | Notes |
|---|---|---|
| `apps/web/src/lib/hooks/use-goal-session.ts` | Modified | `editPlan` and `requestEdit` no longer call `sendToApi`; they push an adjust-prompt assistant message and set a flag. New `submitAdjustment(text)` does the actual API send |
| `apps/web/src/lib/types/goal-chat.ts` | Modified | Add optional `adjustRequest` field to `ChatMessage` |
| `apps/web/src/components/goals/adjust-request-card.tsx` | New | Free-text card matching `AskQuestionCard`'s `isFreeTextOnly` styling. Submit-disabled-when-empty |
| `apps/web/src/components/goals/chat-message.tsx` | Modified | Render `<AdjustRequestCard>` when `message.adjustRequest` is set |
| `apps/web/src/components/goals/goal-wizard-panel.tsx` | Modified | Wire `submitAdjustment` from both `useGoalSession` instances down through `<ChatMessage>` (or via context-style prop) |
| `apps/web/messages/{en,es,fr,pt}.json` | Modified | Add `goals.adjust.*` keys |

---

## Data Model: `ChatMessage.adjustRequest`

Extend `ChatMessage`:

```ts
export interface ChatMessage {
  // ...existing fields...
  /** Synthetic client-side flag. When set, the message renders an
   *  AdjustRequestCard inline in the chat instead of the assistant's
   *  text content. Set by editPlan/requestEdit; cleared by setting
   *  `answered: true` once the user submits. */
  adjustRequest?: {
    kind: "goal" | "weekly";
  };
}
```

The message itself is `role: "assistant"` with `content: ""` (the card carries its own copy from i18n), so the chat scrollback reads naturally: assistant card → user reply → assistant turn.

---

## Hook Flow (`useGoalSession`)

### `editPlan` (goal-creation) — rewritten

```ts
const editPlan = useCallback(async () => {
  setStage("chatting");

  // Don't fire the API yet. Push a synthetic adjust-prompt message and
  // wait for the user to type what they'd like changed.
  const promptMsg: ChatMessage = {
    id: genId(),
    role: "assistant",
    content: "",
    adjustRequest: { kind: "goal" },
  };
  setMessages((prev) => [...prev, promptMsg]);
}, []);
```

### `requestEdit` (weekly-planning) — rewritten

```ts
const requestEdit = useCallback(async () => {
  if (intentRef.current !== "weekly-planning") return;
  setWeeklyPreview(null);

  const promptMsg: ChatMessage = {
    id: genId(),
    role: "assistant",
    content: "",
    adjustRequest: { kind: "weekly" },
  };
  setMessages((prev) => [...prev, promptMsg]);
}, []);
```

### `submitAdjustment(text)` — new

Called when the user submits text in `<AdjustRequestCard>`. Sends the actual API request with proper tool_result handling.

```ts
const submitAdjustment = useCallback(async (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return;  // defensive — card already disables empty submit
  if (isStreaming) return;

  // Mark the prompt card answered so it stops accepting input.
  setMessages((prev) =>
    prev.map((m) =>
      m.adjustRequest && !m.answered ? { ...m, answered: true } : m
    )
  );

  // Push the user's reply as a normal message.
  const userMsg: ChatMessage = {
    id: genId(),
    role: "user",
    content: trimmed,
  };
  setMessages((prev) => [...prev, userMsg]);

  // Build the tool_result + user-text pair for Anthropic.
  const toolUseId = lastToolUseIdRef.current;
  if (!toolUseId) {
    // Defensive: should never happen because the Adjust button only
    // appears after a plan tool_use was emitted. Surface an error so
    // we notice in production rather than silently sending an orphaned
    // user message that confuses the model.
    console.error("[use-goal-session] submitAdjustment: missing tool_use_id");
    setError("Something went wrong. Please refresh and try again.");
    return;
  }

  // Persist both halves first (best-effort) so a refresh mid-stream
  // doesn't lose the adjust request.
  if (sessionIdRef.current) {
    try {
      await saveMessage(sessionIdRef.current, "user", `Adjustment request: ${trimmed}`, {
        toolResultFor: toolUseId,
      });
      await saveMessage(sessionIdRef.current, "user", trimmed);
    } catch (err) {
      console.error("[use-goal-session] submitAdjustment persist failed:", err);
    }
  }

  historyRef.current.push({
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: toolUseId,
        // Putting the user's actual text in the tool_result is what makes
        // the AI revise the plan. The trailing user message is a backup
        // copy the model can re-read if compression drops the result.
        content: `User would like the following adjustments: ${trimmed}`,
      },
    ],
  });
  historyRef.current.push({ role: "user", content: trimmed });

  sendToApi([...historyRef.current]);
}, [isStreaming, sendToApi]);
```

Returned from the hook:

```ts
return {
  // ...existing returns...
  editPlan,        // unchanged identifier; new behavior
  requestEdit,     // unchanged identifier; new behavior
  submitAdjustment // NEW
};
```

### Why this fixes "Failed to fetch"

The current code immediately fires `sendToApi` with `tool_use_id: ""` if the ref is unset. Anthropic 400s on an empty tool_use_id, but the streaming reader can surface that as a generic fetch failure depending on where the 400 lands.

The new flow:
- Doesn't send anything until the user types — eliminates the "ghost send" path.
- Hard-fails early (with a clear error message) if `lastToolUseIdRef.current` is empty, instead of generating a malformed Anthropic call.
- Puts the user's text inside the `tool_result` content (which the model is required to consume) AND as a follow-up user message — this redundancy survives memory compression even if the original tool_use turn gets dropped from the rolling-5 window: the tool_result-tagged user message stays paired with the last assistant tool_use in `buildMessagesWithMemory`'s output as long as both are within the window, and the duplicate plain user message guarantees the model still sees the request even if compression clipped one half.

---

## UI: `AdjustRequestCard`

New component matching the visual style of `AskQuestionCard`'s free-text branch (lines 75–108 of [ask-question-card.tsx](../../apps/web/src/components/goals/ask-question-card.tsx)).

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface AdjustRequestCardProps {
  /** "goal" or "weekly" — picks which i18n string to show as the question
   *  prompt (so we can phrase it naturally for each context). */
  kind: "goal" | "weekly";
  onSubmit: (text: string) => void;
  /** True once the user has answered (or while a streamed response is
   *  in flight) — disables editing. */
  disabled?: boolean;
}

export function AdjustRequestCard({ kind, onSubmit, disabled = false }: AdjustRequestCardProps) {
  const t = useTranslations("goals.adjust");
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  const question = kind === "weekly" ? t("weeklyPrompt") : t("goalPrompt");

  return (
    <div className="border border-[#E7DED2] rounded-lg bg-[#FFFDF9] p-4 mt-2">
      <p className="text-sm font-medium text-[#2B2B2B] mb-3">{question}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        rows={3}
        placeholder={t("placeholder")}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter to submit, mirroring AskQuestionCard.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        className="w-full resize-none border border-[#DDD3C7] rounded-lg px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 focus:border-transparent bg-[#FFFDF9] mb-3 disabled:opacity-60"
      />
      {!disabled && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-[#007AFF] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("submit")}
          </button>
          <span className="text-[11px] text-[#9B948B]">{t("hint")}</span>
        </div>
      )}
    </div>
  );
}
```

---

## Wiring in `chat-message.tsx`

`<ChatMessage>` already branches on toolUse vs plain text. Add a third branch:

```tsx
// At the top of the assistant-message render path:
if (message.adjustRequest) {
  return (
    <AdjustRequestCard
      kind={message.adjustRequest.kind}
      onSubmit={onAdjustSubmit /* new prop, see below */}
      disabled={message.answered ?? false}
    />
  );
}
```

`<ChatMessage>` gets a new prop `onAdjustSubmit?: (text: string) => void`, threaded from `<GoalWizardPanel>` from each `useGoalSession` instance's `submitAdjustment`.

---

## Wiring in `goal-wizard-panel.tsx`

Both `useGoalSession` call sites destructure `submitAdjustment` and pass it into the chat list:

```tsx
{messages.map((m, i) => (
  <ChatMessage
    key={m.id}
    message={m}
    onAnswer={hook.answerQuestion}
    onAdjustSubmit={hook.submitAdjustment}
    // ...other props
  />
))}
```

The Adjust buttons (`onEdit={editPlan}` for goal, `onEdit={sessionHook.requestEdit}` for weekly) keep their existing names and call sites — only the function bodies inside the hook changed.

---

## i18n Additions

Add under a new `goals.adjust` namespace in all four locales:

```json
"goals": {
  ...
  "adjust": {
    "goalPrompt": "What would you like to adjust about the roadmap?",
    "weeklyPrompt": "What would you like to adjust about the weekly plan?",
    "placeholder": "Tell us what should change — phases, timing, focus, anything specific…",
    "submit": "Submit",
    "hint": "⌘/Ctrl + Enter"
  }
}
```

Use the same English strings as placeholders for es/fr/pt initially (consistent with the previous landing-redesign approach), or translate inline if cheap.

---

## Flow Walkthrough

### Goal-Creation Adjust

1. AI emits `create_goal_plan` tool_use → `lastToolUseIdRef` captures the id.
2. `<RoadmapPreview>` shows; user clicks Adjust.
3. `editPlan()` runs:
   - `setStage("chatting")`
   - Pushes `{ role:"assistant", adjustRequest:{kind:"goal"} }` to messages.
   - **No API call.**
4. The chat re-renders; `<ChatMessage>` sees `adjustRequest` and renders `<AdjustRequestCard kind="goal">`.
5. User types "Compress the first phase to 2 weeks instead of 4." Submit becomes enabled.
6. User clicks Submit → `submitAdjustment("Compress the first phase to 2 weeks instead of 4.")`.
7. Hook marks the card `answered: true`, pushes a `role:"user"` message with the text, builds `[tool_result, user_text]` history pair, calls `sendToApi`.
8. AI streams response → emits new `create_goal_plan` → `lastToolUseIdRef` updates → preview re-opens.
9. Adjust on the new preview → repeats from step 3.

### Weekly-Planning Adjust

Same as above with `kind:"weekly"` and `requestEdit` instead of `editPlan`. The `setWeeklyPreview(null)` line stays so the modal closes when the prompt card appears.

### Edge: empty submit

Submit button disabled until `trimmed.length > 0`. Cmd/Ctrl+Enter no-ops when empty.

### Edge: missing tool_use_id

`submitAdjustment` early-returns with a user-visible error (rare; only happens if state is corrupted). Console error logged for monitoring.

### Edge: in-flight stream when Adjust is clicked

`<RoadmapPreview>` and `<PlanPreviewModal>` only render after the previous stream completed (the preview is gated on the tool_use being emitted). So Adjust can't be clicked mid-stream. Safety check in `submitAdjustment` for `isStreaming` is defensive only.

### Edge: user closes/refreshes mid-card

The synthetic `adjustRequest` message is in-memory only; it's not persisted to the draft session DB. Refresh = card disappears. Acceptable: user can click Adjust again. We don't pollute the persisted history with synthetic markers.

---

## Testing Plan

Manual checklist:

1. `cd apps/web && npm run dev`. Navigate to a goal that has its weekly plan generated.
2. Click Adjust on the weekly plan modal → modal closes; new card appears in chat with the prompt and a textarea.
3. Submit button is disabled while textarea is empty. Type one character → enabled. Delete it → disabled again.
4. Type "Move Wednesday's task to Thursday." Click Submit. The card disables. A user message bubble appears with that text. AI streams a new plan. Modal reopens with the revised plan.
5. Click Adjust again → second prompt card appears, etc.
6. Repeat for goal-creation: from a fresh goal input, run through clarifying Qs, hit the roadmap preview, click Adjust, verify the same flow.
7. `cd apps/web && npx tsc --noEmit` passes.
8. `cd apps/web && npx next build` passes.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Persisted draft chats from before this change have the old "I'd like to adjust the plan" message hard-coded into history | Old messages render harmlessly as plain user text; no UI change needed. New flow is forward-only. |
| `lastToolUseIdRef` is wired correctly today but a future refactor could lose it | The defensive guard in `submitAdjustment` surfaces a clear error instead of failing silently. |
| Memory compression drops the tool_use turn that the tool_result references | Mitigated by also including the user's text as a plain user message right after the tool_result block. The model can read intent from either half. |
| Two ChatMessage cards visible simultaneously if user clicks Adjust on the modal but the modal animation hasn't finished closing | `requestEdit` already does `setWeeklyPreview(null)` synchronously. The modal closes before the next render shows the new card. |

---

## Out of Scope (Followups)

- Surfacing the AI's revision summary inline ("Changed: phases 2 & 3 swapped").
- Voice-to-text for the textarea.
- Persisting in-progress adjust text across refreshes.
- Internationalizing es/fr/pt with native translations (initial values are English placeholders).
