# Adjust Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the immediate-send Adjust path on the roadmap-preview and weekly plan-preview-modal with a deferred free-text card that mirrors the clarifying-question UX, fixing the underlying tool_result/tool_use_id bug.

**Architecture:** `editPlan` and `requestEdit` no longer fire the API. They push a synthetic `assistant` message with a new `adjustRequest` field; `<ChatMessage>` recognizes the field and renders a new `<AdjustRequestCard>`. When the user submits text, a new hook function `submitAdjustment(text)` builds the proper `tool_result + user-text` history pair and calls `sendToApi`. Submit is disabled while the textarea is empty.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind, next-intl, Anthropic Messages API (server-side at `/api/ai/plan`).

**Spec:** [docs/superpowers/specs/2026-05-09-adjust-flow-redesign-design.md](../specs/2026-05-09-adjust-flow-redesign-design.md)

---

## File Structure

**Files to create:**

1. `apps/web/src/components/goals/adjust-request-card.tsx` — Free-text card matching `AskQuestionCard`'s `isFreeTextOnly` style. Submit-disabled-when-empty. Cmd/Ctrl+Enter shortcut.

**Files to modify:**

1. `apps/web/src/lib/types/goal-chat.ts` — Add `adjustRequest?: { kind: "goal" | "weekly" }` to `ChatMessage`
2. `apps/web/messages/en.json` — Add `goals.adjust.*` namespace
3. `apps/web/messages/es.json` — Same keys, English values (placeholder)
4. `apps/web/messages/fr.json` — Same keys, English values (placeholder)
5. `apps/web/messages/pt.json` — Same keys, English values (placeholder)
6. `apps/web/src/lib/hooks/use-goal-session.ts` — Rewrite `editPlan` and `requestEdit` bodies; add `submitAdjustment`
7. `apps/web/src/components/goals/chat-message.tsx` — Render `<AdjustRequestCard>` when `message.adjustRequest` is set; accept new `onAdjustSubmit` prop
8. `apps/web/src/components/goals/goal-wizard-panel.tsx` — Destructure `submitAdjustment` from both `useGoalSession` instances; pass to both `<ChatMessage>` call sites

**Task ordering (each ends with a commit):**

1. Type field
2. i18n keys
3. `AdjustRequestCard` component
4. `useGoalSession` rewrite
5. `chat-message.tsx` wiring
6. `goal-wizard-panel.tsx` wiring
7. Manual verification

`npx tsc --noEmit` should pass after every task.

---

## Task 1: Add `adjustRequest` to `ChatMessage` type

**Files:**
- Modify: `apps/web/src/lib/types/goal-chat.ts:70-85`

- [ ] **Step 1: Edit the `ChatMessage` interface**

old_string:
```ts
// A message in the goal chat
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUse?: {
    id: string; // tool_use_id from Anthropic
    name: string;
    data: AskQuestionData | GoalPlanData | WeeklyPlanData;
  } | null;
  toolActivity?: ToolActivity[]; // all tool calls observed during this turn
  answered?: boolean; // for ask_question: has user answered?
  /** Rehydrated from a draft chat where the assistant turn never finished
   *  (Vercel maxDuration hit, tab closed mid-stream, etc). UI shows a
   *  "continue from here" warning. */
  interrupted?: boolean;
}
```

new_string:
```ts
// A message in the goal chat
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUse?: {
    id: string; // tool_use_id from Anthropic
    name: string;
    data: AskQuestionData | GoalPlanData | WeeklyPlanData;
  } | null;
  toolActivity?: ToolActivity[]; // all tool calls observed during this turn
  answered?: boolean; // for ask_question OR adjustRequest: has user answered?
  /** Rehydrated from a draft chat where the assistant turn never finished
   *  (Vercel maxDuration hit, tab closed mid-stream, etc). UI shows a
   *  "continue from here" warning. */
  interrupted?: boolean;
  /** Synthetic client-side flag. When set, the message renders an
   *  AdjustRequestCard inline in the chat. Set by editPlan (kind="goal")
   *  or requestEdit (kind="weekly"). Cleared (via answered:true) once the
   *  user submits text. Not persisted to draft sessions — refresh = card
   *  disappears, user can click Adjust again. */
  adjustRequest?: {
    kind: "goal" | "weekly";
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit && echo TYPECHECK_OK
```

Expected: `TYPECHECK_OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/types/goal-chat.ts
git commit -m "$(cat <<'EOF'
types(goal-chat): add adjustRequest field to ChatMessage

Synthetic client-only flag that triggers an AdjustRequestCard render
inline in the chat. Used by the new deferred-input adjust flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `goals.adjust.*` i18n keys

**Files:**
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/es.json`
- Modify: `apps/web/messages/fr.json`
- Modify: `apps/web/messages/pt.json`

For all four locales: locate the `goals.askQuestion` block (an existing nested namespace under `goals`) and insert a new sibling `adjust` block right after it. Use English copy for all locales (placeholder, consistent with existing redesign convention).

- [ ] **Step 1: Find the `askQuestion` block in en.json**

```bash
grep -n '"askQuestion"' apps/web/messages/en.json
```

Expected: a single match. Note the line number; the `}` closing this block is the insertion target.

- [ ] **Step 2: Read 10 lines around the match in en.json so the Edit has unique context**

Use the Read tool with offset = the line number from Step 1, limit 15.

- [ ] **Step 3: Insert the `adjust` block after the closing `}` of `askQuestion` in en.json**

Find the unique closing snippet for `askQuestion` (the keys are: `freeTextPlaceholder`, `freeTextHint`, `submit`, `skipAndContinue`, `other`, `otherPlaceholder`, `continue`). The block ends with one of these key lines followed by `},`. Use Edit with a unique multi-line `old_string` and an extended `new_string` that adds the `adjust` block.

old_string (en.json):
```json
    "askQuestion": {
```

Replace by reading the full askQuestion block and pasting it back unchanged but with `"adjust": { … },` inserted as a sibling immediately after it.

A safer pattern: locate the unique line that ends the `askQuestion` block (the `}` closing it), and insert the new block right after. To do this with Edit, use the closing of `askQuestion` plus the next sibling key as anchor:

```bash
grep -n -A 1 '^    },' apps/web/messages/en.json | grep -B 1 'goals' | head
```

Then use Edit with old_string spanning the `},` line and the next sibling line, inserting the `adjust` block in between.

Concrete Edit for en.json:

old_string (find unique tail of askQuestion + the next sibling start; if there is no `chatMessage` namespace, use `wizard` or whatever sibling is next — verify by reading the file first):

```json
    "askQuestion": {
      "freeTextPlaceholder": "Anything else worth mentioning? Skills, constraints, preferences, specific things to include — or leave empty.",
      "freeTextHint": "⌘/Ctrl + Enter to submit",
      "submit": "Submit",
      "skipAndContinue": "Skip and continue",
      "other": "Other",
      "otherPlaceholder": "Type your answer…",
      "continue": "Continue"
    },
```

If your en.json's `askQuestion` block has a different exact shape, copy it verbatim into `old_string` and replicate it inside `new_string` with the new block appended. The point is: insert this immediately after the `askQuestion` block's closing `},`:

new_string (en.json):
```json
    "askQuestion": {
      "freeTextPlaceholder": "Anything else worth mentioning? Skills, constraints, preferences, specific things to include — or leave empty.",
      "freeTextHint": "⌘/Ctrl + Enter to submit",
      "submit": "Submit",
      "skipAndContinue": "Skip and continue",
      "other": "Other",
      "otherPlaceholder": "Type your answer…",
      "continue": "Continue"
    },
    "adjust": {
      "goalPrompt": "What would you like to adjust about the roadmap?",
      "weeklyPrompt": "What would you like to adjust about the weekly plan?",
      "placeholder": "Tell us what should change — phases, timing, focus, anything specific…",
      "submit": "Submit",
      "hint": "⌘/Ctrl + Enter"
    },
```

If the exact body of `askQuestion` in your en.json differs, read it first and copy its shape verbatim into both halves of the Edit. The only addition is the trailing `"adjust": { … },` block.

- [ ] **Step 4: Mirror Step 3 for es.json, fr.json, pt.json**

For each locale, read the `askQuestion` block, then Edit with the same `adjust` block tacked onto its tail. Use the English values verbatim — these are placeholders consistent with the prior landing redesign.

- [ ] **Step 5: Validate JSON**

```bash
cd apps/web && node -e "['en','es','fr','pt'].forEach(l => JSON.parse(require('fs').readFileSync('messages/'+l+'.json','utf8')))" && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Typecheck**

```bash
cd apps/web && npx tsc --noEmit && echo TYPECHECK_OK
```

Expected: `TYPECHECK_OK`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/es.json apps/web/messages/fr.json apps/web/messages/pt.json
git commit -m "$(cat <<'EOF'
i18n(goals): add adjust namespace for AdjustRequestCard

goalPrompt / weeklyPrompt / placeholder / submit / hint strings used
by the new free-text Adjust card in the goal-creation and weekly
planning flows. Other locales get the English values as placeholders
(follow-up: native translations).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `AdjustRequestCard`

**Files:**
- Create: `apps/web/src/components/goals/adjust-request-card.tsx`

- [ ] **Step 1: Create the file**

Write the full content:

```tsx
"use client";

// Free-text-only card rendered in the goal-wizard chat when the user
// clicks "Adjust" on the roadmap preview or weekly plan modal. Visual
// pattern mirrors AskQuestionCard's isFreeTextOnly branch so the user
// experiences the same idiom they already know from the final
// "Anything else?" clarifying question.

import { useState } from "react";
import { useTranslations } from "next-intl";

interface AdjustRequestCardProps {
  /** "goal" or "weekly" — picks which i18n string to show as the
   *  question prompt so the wording matches the surrounding flow. */
  kind: "goal" | "weekly";
  onSubmit: (text: string) => void;
  /** True once the user has submitted (or while a streamed response
   *  is in flight). Disables editing and hides the action row. */
  disabled?: boolean;
}

export function AdjustRequestCard({
  kind,
  onSubmit,
  disabled = false,
}: AdjustRequestCardProps) {
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

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit && echo TYPECHECK_OK
```

Expected: `TYPECHECK_OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/goals/adjust-request-card.tsx
git commit -m "$(cat <<'EOF'
feat(goals): add AdjustRequestCard

Free-text-only card matching AskQuestionCard's isFreeTextOnly styling.
Submit is disabled while the textarea is empty; Cmd/Ctrl+Enter submits.
"goal" / "weekly" kind picks the appropriate i18n prompt string.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Rewrite `editPlan` / `requestEdit`; add `submitAdjustment`

**Files:**
- Modify: `apps/web/src/lib/hooks/use-goal-session.ts`

There are three changes inside the same file:

(a) `editPlan` (currently lines ~1004–1051): replace its body with a synthetic-message push.
(b) `requestEdit` (currently lines ~1059–1102): same transformation.
(c) Add new `submitAdjustment` function and include it in the returned object.

- [ ] **Step 1: Locate the current `editPlan`**

```bash
grep -n "const editPlan = useCallback" apps/web/src/lib/hooks/use-goal-session.ts
```

Confirm it points to the block starting with `const editPlan = useCallback(async () => {` and ending with `}, [sendToApi]);`.

- [ ] **Step 2: Replace the `editPlan` body**

old_string:
```ts
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
```

new_string:
```ts
  // Click of "Adjust" on the roadmap preview. We don't fire the API
  // here anymore — instead we push a synthetic adjust-prompt assistant
  // message and wait for the user to type what they'd like changed.
  // The actual tool_result + sendToApi happens in submitAdjustment.
  const editPlan = useCallback(async () => {
    setStage("chatting");
    const promptMsg: ChatMessage = {
      id: genId(),
      role: "assistant",
      content: "",
      adjustRequest: { kind: "goal" },
    };
    setMessages((prev) => [...prev, promptMsg]);
  }, []);
```

- [ ] **Step 3: Replace the `requestEdit` body**

old_string:
```ts
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
```

new_string:
```ts
  // Weekly-planning equivalent of editPlan. Closes the preview modal
  // (via setWeeklyPreview(null)) and pushes the synthetic adjust card.
  // No API call until the user types — see submitAdjustment.
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

- [ ] **Step 4: Add `submitAdjustment` between `requestEdit` and the `return {…}` block**

old_string (just the start of the return block, used as anchor):
```ts
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
```

new_string:
```ts
  // Called by AdjustRequestCard when the user submits text. Builds the
  // proper tool_result + user-text pair against the most recent plan
  // tool_use and fires sendToApi. The user's text is included in BOTH
  // the tool_result content AND a follow-up user message — the
  // redundancy lets the model still see intent if memory compression
  // happens to drop one half of the pair.
  const submitAdjustment = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (isStreaming) return;

      // Mark every outstanding adjust card as answered so the UI
      // disables further input. (In practice there will only ever be
      // one outstanding card at a time, but this is robust.)
      setMessages((prev) =>
        prev.map((m) =>
          m.adjustRequest && !m.answered ? { ...m, answered: true } : m
        )
      );

      // Push the user's reply as a normal chat bubble.
      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);

      const toolUseId = lastToolUseIdRef.current;
      if (!toolUseId) {
        // Defensive: should never happen because the Adjust button only
        // appears after a plan tool_use was emitted. Log so we notice
        // in production rather than sending an orphaned user message.
        console.error(
          "[use-goal-session] submitAdjustment: missing tool_use_id"
        );
        setError("Something went wrong. Please refresh and try again.");
        return;
      }

      // Persist both halves so a refresh mid-stream doesn't lose the
      // adjust request. Best-effort — we still send to the API even if
      // these throw.
      if (sessionIdRef.current) {
        try {
          await saveMessage(
            sessionIdRef.current,
            "user",
            `Adjustment request: ${trimmed}`,
            { toolResultFor: toolUseId }
          );
          await saveMessage(sessionIdRef.current, "user", trimmed);
        } catch (err) {
          console.error(
            "[use-goal-session] submitAdjustment persist failed:",
            err
          );
        }
      }

      historyRef.current.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: `User would like the following adjustments: ${trimmed}`,
          },
        ],
      });
      historyRef.current.push({ role: "user", content: trimmed });

      sendToApi([...historyRef.current]);
    },
    [isStreaming, sendToApi]
  );

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
    submitAdjustment,
  };
}
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit && echo TYPECHECK_OK
```

Expected: `TYPECHECK_OK`. If there's an error about an unused `AnthropicMessage` import that the old `editPlan`/`requestEdit` referenced, leave it — other parts of the file still use the type.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/hooks/use-goal-session.ts
git commit -m "$(cat <<'EOF'
feat(use-goal-session): defer Adjust send until user types

editPlan and requestEdit now push a synthetic adjustRequest assistant
message and wait. New submitAdjustment(text) does the actual API
send — building a tool_result against the most recent plan tool_use
plus a duplicate user-text message so memory compression can't drop
both halves of the request.

Defensive guard surfaces an error if lastToolUseIdRef is empty, which
was the previous silent-failure path that landed users on a generic
"Failed to fetch".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire `AdjustRequestCard` into `chat-message.tsx`

**Files:**
- Modify: `apps/web/src/components/goals/chat-message.tsx`

- [ ] **Step 1: Add the import + extend the props interface**

old_string:
```tsx
import { AskQuestionCard } from "./ask-question-card";
import { LiveTimer } from "@/components/ui/live-timer";
import type { ChatMessage as ChatMessageType, AskQuestionData, UserAnswer } from "@/lib/types/goal-chat";
```

new_string:
```tsx
import { AskQuestionCard } from "./ask-question-card";
import { AdjustRequestCard } from "./adjust-request-card";
import { LiveTimer } from "@/components/ui/live-timer";
import type { ChatMessage as ChatMessageType, AskQuestionData, UserAnswer } from "@/lib/types/goal-chat";
```

- [ ] **Step 2: Extend `ChatMessageProps`**

old_string:
```tsx
interface ChatMessageProps {
  message: ChatMessageType;
  onAnswer?: (answer: UserAnswer) => void;
  isStreaming?: boolean;
}
```

new_string:
```tsx
interface ChatMessageProps {
  message: ChatMessageType;
  onAnswer?: (answer: UserAnswer) => void;
  /** Called when the user submits text in an AdjustRequestCard. The
   *  hook layer handles the rest (persistence + tool_result + API). */
  onAdjustSubmit?: (text: string) => void;
  isStreaming?: boolean;
}
```

- [ ] **Step 3: Destructure `onAdjustSubmit` in the function signature**

old_string:
```tsx
export function ChatMessage({ message, onAnswer, isStreaming }: ChatMessageProps) {
```

new_string:
```tsx
export function ChatMessage({ message, onAnswer, onAdjustSubmit, isStreaming }: ChatMessageProps) {
```

- [ ] **Step 4: Add the `adjustRequest` render branch**

The user-message branch (lines 27–37) returns early. The assistant branch starts at line 39. Insert the `adjustRequest` check immediately after the user-message early return — before the assistant-branch variables are computed — so a synthetic adjust message bypasses the `toolActivity` / `showCursor` / `showDraftingCard` logic entirely.

old_string:
```tsx
  // User message: right-aligned blue bubble, no avatar
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="bg-[#007AFF] text-white rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message: avatar + name + bubble (matches workflow-run-view pattern)
```

new_string:
```tsx
  // User message: right-aligned blue bubble, no avatar
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%]">
          <div className="bg-[#007AFF] text-white rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Synthetic adjust-request card. Rendered as an assistant-side bubble
  // (left-aligned, with avatar) so it visually reads as the AI asking
  // the user a follow-up question, mirroring the clarifying-question
  // pattern. The card itself owns the textarea + submit affordance.
  if (message.adjustRequest) {
    return (
      <div className="flex justify-start gap-3">
        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[#F1ECE4] mt-1">
          <Image
            src={AGENT_AVATAR}
            alt={AGENT_LABEL}
            width={32}
            height={32}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="max-w-[85%] min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-[#2B2B2B]">{AGENT_LABEL}</span>
          </div>
          <AdjustRequestCard
            kind={message.adjustRequest.kind}
            onSubmit={(text) => onAdjustSubmit?.(text)}
            disabled={message.answered ?? false}
          />
        </div>
      </div>
    );
  }

  // Assistant message: avatar + name + bubble (matches workflow-run-view pattern)
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit && echo TYPECHECK_OK
```

Expected: `TYPECHECK_OK`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/goals/chat-message.tsx
git commit -m "$(cat <<'EOF'
feat(chat-message): render AdjustRequestCard for adjustRequest messages

New early branch renders the synthetic adjust card with an
assistant-side avatar so it visually reads as the AI asking a
follow-up — same idiom as the free-text clarifying question.
Threads onAdjustSubmit through to the card.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire `submitAdjustment` in `goal-wizard-panel.tsx`

**Files:**
- Modify: `apps/web/src/components/goals/goal-wizard-panel.tsx`

The file has two `useGoalSession` call sites (goal-creation around line 273, weekly-planning around line 518) and two `<ChatMessage>` mappers (around line 345 and line 618). Each needs to destructure `submitAdjustment` and pass it as `onAdjustSubmit`.

- [ ] **Step 1: Destructure `submitAdjustment` from the goal-creation hook**

old_string (around line 273):
```tsx
  const {
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
  } = useGoalSession({ initialDraft });
```

new_string:
```tsx
  const {
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
    submitAdjustment,
  } = useGoalSession({ initialDraft });
```

- [ ] **Step 2: Pass `onAdjustSubmit` to the goal-creation `<ChatMessage>` mapper**

old_string:
```tsx
        {messages.map((msg, idx) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onAnswer={answerQuestion}
            isStreaming={
              isStreaming && idx === messages.length - 1 && msg.role === "assistant"
            }
          />
        ))}
```

new_string:
```tsx
        {messages.map((msg, idx) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onAnswer={answerQuestion}
            onAdjustSubmit={submitAdjustment}
            isStreaming={
              isStreaming && idx === messages.length - 1 && msg.role === "assistant"
            }
          />
        ))}
```

- [ ] **Step 3: Pass `onAdjustSubmit` to the weekly-planning `<ChatMessage>` mapper**

old_string:
```tsx
        {sessionHook.messages.map((m, i) => (
          <ChatMessage
            key={m.id}
            message={m}
            onAnswer={sessionHook.answerQuestion}
            isStreaming={
              sessionHook.isStreaming && i === sessionHook.messages.length - 1
            }
          />
        ))}
```

new_string:
```tsx
        {sessionHook.messages.map((m, i) => (
          <ChatMessage
            key={m.id}
            message={m}
            onAnswer={sessionHook.answerQuestion}
            onAdjustSubmit={sessionHook.submitAdjustment}
            isStreaming={
              sessionHook.isStreaming && i === sessionHook.messages.length - 1
            }
          />
        ))}
```

The weekly-planning `sessionHook` was created via `const sessionHook = useGoalSession({...})` (around line 518). Its returned object now exposes `submitAdjustment` directly — no extra destructuring needed at that call site.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit && echo TYPECHECK_OK
```

Expected: `TYPECHECK_OK`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/goals/goal-wizard-panel.tsx
git commit -m "$(cat <<'EOF'
feat(goal-wizard-panel): wire submitAdjustment to ChatMessage

Both useGoalSession instances (goal-creation and weekly-planning)
expose submitAdjustment; the matching ChatMessage mappers thread it
through onAdjustSubmit so the AdjustRequestCard can submit the user's
text up to the hook layer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verification

**Files:** none.

- [ ] **Step 1: Final typecheck**

```bash
cd apps/web && npx tsc --noEmit && echo TYPECHECK_OK
```

Expected: `TYPECHECK_OK`.

- [ ] **Step 2: Production build**

```bash
cd apps/web && npx next build 2>&1 | tail -20
```

Expected: build completes (no errors). Warnings about unused i18n keys are acceptable.

- [ ] **Step 3: Manual click-through**

Run `cd apps/web && npm run dev` (or use the preview-server tooling if available). Open a goal that already has both a roadmap and a generated weekly plan.

For the **weekly plan** flow:
1. Open the goal → click "Generate weekly plan with AI" (or whatever opens the weekly chat) → wait for the modal to appear with a freshly-generated plan.
2. Click **Adjust**.
3. Modal closes. A new assistant card appears in the chat with the prompt "What would you like to adjust about the weekly plan?" and a textarea.
4. Submit button is disabled. Type a single character → Submit becomes enabled. Delete → disabled again.
5. Type "Move Wednesday's research task to Thursday." Click Submit.
6. Card disables. A user message bubble appears with the same text. The AI streams a response, emits a new `create_weekly_plan` tool_use, and the modal reopens with the revised plan.
7. Click Adjust on the new modal → another prompt card appears in the chat. The flow repeats.

For the **goal-creation roadmap** flow:
1. Start a fresh goal from `/goals?new=1`. Run through the clarifying questions until the roadmap preview opens.
2. Click **Adjust**.
3. Roadmap preview hides; a new assistant prompt card appears with "What would you like to adjust about the roadmap?".
4. Type "Compress phase 1 to 2 weeks." Submit.
5. AI streams; a new `create_goal_plan` arrives; the roadmap preview re-opens with the revised plan.
6. Click Adjust again → second prompt card. Loop works.

Verify console has no `Failed to fetch` errors and no Supabase / persistence errors.

- [ ] **Step 4: Output the test points for the user**

Per project convention, never `git push` without explicit user instruction. Output:

```
Branch: claude/adjust-flow-redesign-a9494b — committed locally, 7 commits ahead of main.

Manual test points to verify on your local dev server:

1. Open a goal with an existing weekly plan → Adjust button on the modal opens
   the new in-chat free-text card.
2. Submit is disabled until you type something. Cmd/Ctrl+Enter submits.
3. After submit, the AI streams a revised weekly plan; new modal opens.
4. Adjust on the new modal works the same way — repeatable indefinitely.
5. Same flow on goal-creation roadmap (Adjust on the roadmap preview card).
6. No "Failed to fetch" errors in console at any step.
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Implementing task |
|---|---|
| `ChatMessage.adjustRequest` field | Task 1 |
| `editPlan` rewrite | Task 4 Step 2 |
| `requestEdit` rewrite | Task 4 Step 3 |
| `submitAdjustment` new function | Task 4 Step 4 |
| `AdjustRequestCard` component | Task 3 |
| `chat-message.tsx` adjust branch | Task 5 Step 4 |
| `goal-wizard-panel.tsx` wiring | Task 6 |
| i18n `goals.adjust.*` keys | Task 2 |
| Bug fix: defensive empty `tool_use_id` | Task 4 Step 4 (`submitAdjustment` guard) |
| Bug fix: redundant user text vs. compression | Task 4 Step 4 (sends text both as tool_result content and as a follow-up user message) |
| Empty submission disabled | Task 3 (`canSubmit` derives from `trimmed.length > 0`) |
| Both Goal-creation + Weekly-planning covered | Tasks 4 (both functions) + Task 6 (both call sites) |
| Manual test plan | Task 7 |

No gaps.

**2. Placeholder scan:** No "TBD", "implement later", or "similar to". Every step has the actual code or command. Task 2 Step 3 acknowledges the engineer should read the actual `askQuestion` block first since exact whitespace varies — this is concrete instruction, not a placeholder.

**3. Type consistency:**
- `adjustRequest: { kind: "goal" | "weekly" }` defined in Task 1, consumed in Task 3 (`AdjustRequestCardProps.kind`), Task 4 (`{ kind: "goal" }` and `{ kind: "weekly" }`), Task 5 (`message.adjustRequest.kind`).
- `submitAdjustment(text: string) => Promise<void>` (technically returned as `(text: string) => void` since the hook awaits internally — but Task 5's `onAdjustSubmit?: (text: string) => void` and Task 6's pass-through both treat it as `(text: string) => void`. Consistent.
- `onAdjustSubmit` prop name consistent across `ChatMessageProps` (Task 5) and call sites (Task 6).
