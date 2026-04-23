# Unified Goal Session Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collapse the three separate chat-session types per goal (goal-draft, weekly-draft, coach) into a single long-running session per goal, where every flow (Goal → Phase Plan, Phase → Weekly Schedule, AI Coach Q&A, "send item to bot") appends to the same conversation history and the model can always see prior turns.

**Architecture:** Keep one `chat_sessions` row per goal — enforced by the existing `unique(user_id, goal_id) WHERE goal_id IS NOT NULL` index. The session bootstraps with `goal_id=null` during goal creation, then gets bound to the new goal at confirm time. After binding, all subsequent intents (weekly planning, coach Q&A) read+append to that same session. A single backend dispatcher picks the correct system prompt + tool subset based on the `intent` the client passes per turn — the model itself is one general assistant whose role narrows by intent.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS), `@anthropic-ai/sdk` streaming, existing `useGoalChat` SSE reader pattern.

---

## Architectural Decisions (locked in)

1. **One assistant, multiple intents.** The model is a "general assistant"; we inject an intent-specific system prompt addendum + the right tool subset per turn. No persona switching. (per user)
2. **Tool outputs stay as overlay modals** (RoadmapPreview, PlanPreviewModal). No inline rendering. (per user)
3. **Coach folds into the same session** in Phase 2. No per-agent isolation. (per user)
4. **Phase 1's slide-out weekly-plan UX gets replaced by full-screen.** The drafting card and stream-handler code we just shipped is reused in the new unified hook. (per user)
5. **Lazy backfill for legacy goals.** Goals confirmed before this refactor ships have no unified session. On first goal-page visit after deploy, `getOrCreateGoalSession(goalId)` creates an empty stub; the model starts that goal's chat with no prior history but with full goal/phase context injected via the system prompt.
6. **No new SQL migration needed.** The existing schema (chat_sessions with goal_id + metadata.intent) supports everything; only behavior changes.
7. **Context cap (Phase 3 only):** keep the most recent 30 turns in-flight to the model. Earlier turns persist in DB and remain visible in the UI. Phase 3 adds an "older messages summarized" placeholder if turn count > 50.

---

## Backend Architecture Reference

After all three phases, the data model behaves like this:

```
chat_sessions (one row per goal)
├── id
├── user_id
├── goal_id              -- null during bootstrap, set at confirm
├── agent_id = '__goal-session__'  -- single discriminator going forward
├── metadata jsonb {
│     intent: 'goal-creation' | 'goal-active',  -- coarse lifecycle
│     confirmedAt: ISO timestamp (set at confirm),
│     resultGoalId: goals.id (set at confirm; redundant with goal_id col but kept for legacy reads),
│     latestWeeklyContext: { phaseId, weekStart, ... } (last weekly-plan turn's snapshot),
│   }
├── created_at
└── updated_at

chat_messages (unchanged — all intents append here)
└── (existing schema)
```

Backend dispatcher (`/api/ai/plan` route, action `goal-session`):

```
POST /api/ai/plan
{
  action: "goal-session",
  sessionId: <existing session id>,
  intent: "goal-creation" | "weekly-planning" | "coach",
  context: { ...intent-specific snapshot, e.g. weekly={phaseId,weekStart,...} },
  messages: [...full Anthropic message history, possibly truncated by client to 30],
}

Server picks:
  goal-creation  → SYSTEM = goal-chat-prompt.ts  | TOOLS = ask_question + create_goal_plan
  weekly-planning → SYSTEM = weekly-plan-chat.ts  | TOOLS = ask_question + create_weekly_plan
  coach           → SYSTEM = goal-detail-chat.ts  | TOOLS = web_search + web_fetch + code_execution
```

---

# Phase 1: Unified session for goal-creation + weekly-planning

**Outcome:** When a user creates a goal, that goal's chat session is bound to the goal at confirm. Clicking "Plan this week" on the goal page navigates to a full-screen chat that loads the prior conversation and continues it in `weekly-planning` intent. Coach (right-side panel) stays unchanged this phase.

**Scope of Phase 1:** ~10 tasks, ~half a day of focused work.

---

### Task 1.1: Add `goal_id` binding to `markGoalDraftConfirmed`

**Files:**
- Modify: `apps/web/src/lib/db/actions.ts:886-916`

**Why:** Today `markGoalDraftConfirmed` only writes `metadata.resultGoalId` and `confirmedAt`. The session's `goal_id` column stays null forever, so we can't look up "the session for goal X". Setting `goal_id` on the row promotes the goal-draft session to be the canonical session for that goal — and the existing unique index makes sure no other session exists for the same (user, goal) pair.

**Step 1: Read existing function (lines 886-916)** — confirm shape.

**Step 2: Modify the update payload** to also set `goal_id`:

```ts
const { error } = await supabase
  .from("chat_sessions")
  .update({
    metadata: merged,
    goal_id: goalId, // NEW — promotes draft to the goal's main session
    updated_at: new Date().toISOString(),
  })
  .eq("id", sessionId)
  .eq("user_id", user.id);
```

**Step 3: Update the doc-comment block at lines 794-809** to reflect that confirm binds the session to the goal and that the same session is reused for weekly-planning + coach (Phase 2).

**Step 4: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

**Step 5: Commit**

```bash
git add apps/web/src/lib/db/actions.ts
git commit -m "feat(chat): bind goal-draft session to goal_id on confirm"
```

---

### Task 1.2: Add `getOrCreateGoalSession` helper

**Files:**
- Modify: `apps/web/src/lib/db/actions.ts` (add new function near the existing draft helpers around line 945)

**Why:** Phase 1's weekly-planning UI needs to find "the session for goal X" given just `goalId`. For goals confirmed AFTER Phase 1 ships, this session exists (Task 1.1 wrote it). For legacy goals confirmed before, we lazily create an empty stub.

**Step 1: Add function**

```ts
/** Find the canonical chat session for a goal, or create an empty stub if
 *  this goal pre-dates the unified-session refactor. The unique index on
 *  (user_id, goal_id) guarantees at most one row exists per goal — Task 1.1
 *  binds new goals at confirm; this helper covers legacy goals on first
 *  visit. The stub has no message history; the model starts that goal's
 *  weekly-planning conversation cold but with goal+phase context injected
 *  via the system prompt. */
export async function getOrCreateGoalSession(
  goalId: string
): Promise<ChatSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fast path: existing session.
  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("goal_id", goalId)
    .maybeSingle();

  if (existing) return existing;

  // Legacy goal — lazily create a stub.
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      user_id: user.id,
      agent_id: "__goal-draft__", // single discriminator going forward
      goal_id: goalId,
      title: "Goal session",
      metadata: {
        intent: "goal-active",
        confirmedAt: new Date().toISOString(),
        resultGoalId: goalId,
      },
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

**Step 2: Typecheck.** Run `cd apps/web && npx tsc --noEmit`. Expected clean.

**Step 3: Commit**

```bash
git add apps/web/src/lib/db/actions.ts
git commit -m "feat(chat): add getOrCreateGoalSession for lazy backfill"
```

---

### Task 1.3: Add backend dispatcher for the unified `goal-session` action

**Files:**
- Modify: `apps/web/src/app/api/ai/plan/route.ts`

**Why:** A single API entry point so the client doesn't have to know which AI module to call per intent. Picks the right system prompt + tools server-side.

**Step 1: Add a new branch in the action switch (after the existing `goal-chat` block):**

```ts
if (action === "goal-session") {
  const { messages, intent, context } = body as {
    messages: Anthropic.MessageParam[];
    intent: "goal-creation" | "weekly-planning";
    context?: {
      weekly?: WeeklyPlanChatContext;
    };
  };

  let stream;
  let logRoute: string;
  if (intent === "weekly-planning") {
    if (!context?.weekly) {
      return NextResponse.json(
        { error: "weekly intent requires context.weekly" },
        { status: 400 }
      );
    }
    stream = await chatWithWeeklyPlanCoach(messages);
    logRoute = "goal-session-weekly";
  } else {
    stream = await chatWithGoalCoach(messages);
    logRoute = "goal-session-creation";
  }

  return new Response(
    streamWithUsageLog(stream, user.id, logRoute, "claude-opus-4-7"),
    { headers: SSE_HEADERS }
  );
}
```

**Step 2: Add the `WeeklyPlanChatContext` import:**

```ts
import { chatWithWeeklyPlanCoach, type WeeklyPlanChatContext } from "@/lib/ai/weekly-plan-chat";
```

**Step 3: Inject the weekly-context as a synthetic first user message inside `chatWithWeeklyPlanCoach`.** Today the client sends `buildInitialMessage(context)` as the first user turn. After Phase 1 the unified hook will pass the whole prior conversation, so we need the context to be PRE-PENDED to messages instead of being a user-typed turn. Modify `chatWithWeeklyPlanCoach` signature:

In `apps/web/src/lib/ai/weekly-plan-chat.ts`:

```ts
export async function chatWithWeeklyPlanCoach(
  messages: Anthropic.MessageParam[],
  weeklyContext?: WeeklyPlanChatContext  // NEW optional
) {
  const client = getAnthropicClient();
  const systemPrompt = weeklyContext
    ? `${SYSTEM_PROMPT}\n\nCURRENT CONTEXT:\n${buildContextBlock(weeklyContext)}`
    : SYSTEM_PROMPT;

  const stream = await client.messages.stream({
    model: MODELS.opus,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [ASK_QUESTION_TOOL, CREATE_WEEKLY_PLAN_TOOL],
    messages,
  });
  return stream;
}

function buildContextBlock(c: WeeklyPlanChatContext): string {
  return `Goal: ${c.goalTitle}
${c.goalDescription ? `Description: ${c.goalDescription}\n` : ""}Current Phase: ${c.phaseTitle} — ${c.phaseDescription}
Week ${c.weekNumber} of estimated ${c.estimatedWeeks} weeks${c.isMidWeekStart ? `\nNote: It's already ${["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][c.startDayOfWeek!]}, so only plan from that day through Sunday.` : ""}`;
}
```

In the new dispatcher branch (Step 1), pass `context.weekly`:

```ts
stream = await chatWithWeeklyPlanCoach(messages, context.weekly);
```

**Step 4: Typecheck.**

**Step 5: Commit**

```bash
git add apps/web/src/app/api/ai/plan/route.ts apps/web/src/lib/ai/weekly-plan-chat.ts
git commit -m "feat(api): add goal-session dispatcher with intent-based prompt"
```

---

### Task 1.4: Refactor `useGoalChat` into `useGoalSession`

**Files:**
- Rename: `apps/web/src/lib/hooks/use-goal-chat.ts` → `apps/web/src/lib/hooks/use-goal-session.ts`
- Modify: all importers (search for `from "@/lib/hooks/use-goal-chat"`)

**Why:** The hook becomes the single source of truth for ALL streaming chat against a goal session. Adding an `intent` option lets the same hook drive both flows. We rename so future readers understand the broader scope.

**Step 1: Rename the file**

```bash
git mv apps/web/src/lib/hooks/use-goal-chat.ts apps/web/src/lib/hooks/use-goal-session.ts
```

**Step 2: Inside the file, rename the exported hook**

`useGoalChat` → `useGoalSession`
`UseGoalChatOptions` → `UseGoalSessionOptions`
`UseGoalChatInitialDraft` → `UseGoalSessionInitialDraft`

**Step 3: Add new options for intent + weekly context**

In the `UseGoalSessionOptions` interface:

```ts
export interface UseGoalSessionOptions {
  initialDraft?: UseGoalSessionInitialDraft | null;
  /** Which planning sub-flow this hook instance is driving. Decides
   *  the system prompt + tool subset the server uses for each turn. */
  intent?: "goal-creation" | "weekly-planning";
  /** Required when intent === "weekly-planning". Snapshot of goal + phase
   *  + week index — injected into the system prompt server-side. */
  weeklyContext?: WeeklyPlanChatContext;
  /** Fires when a `create_weekly_plan` tool finalizes. Goal-creation flow
   *  doesn't need this (that flow uses RoadmapPreview which the parent
   *  reads directly via the returned `plan` state). */
  onWeeklyPlanGenerated?: (plan: WeeklyPlanData) => void;
}
```

Import `WeeklyPlanData` and `WeeklyPlanChatContext` types at the top.

**Step 4: Switch the API call to the new dispatcher**

Find the `fetch("/api/ai/plan", ...)` call (around line 192 in the renamed file). Change the request body:

```ts
body: JSON.stringify({
  action: "goal-session",
  intent: options?.intent ?? "goal-creation",
  context: options?.intent === "weekly-planning"
    ? { weekly: options.weeklyContext }
    : undefined,
  messages: apiMessages,
}),
```

**Step 5: Handle `create_weekly_plan` tool result**

Inside the `content_block_stop` handler (around line 274 in the original file), there's already a branch for `create_goal_plan`. Add a parallel branch for `create_weekly_plan`:

```ts
if (currentToolName === "create_weekly_plan") {
  const weeklyData = toolInput as WeeklyPlanData;
  // Same double-serialization quirk as create_goal_plan
  if (typeof weeklyData.tasks === "string") {
    try {
      (weeklyData as unknown as Record<string, unknown>).tasks = JSON.parse(weeklyData.tasks as unknown as string);
    } catch { /* guard below catches it */ }
  }
  if (!Array.isArray(weeklyData.tasks)) {
    console.error(
      "[use-goal-session] create_weekly_plan: tasks not array.",
      "type:", typeof weeklyData.tasks,
      "keys:", Object.keys(weeklyData),
    );
  } else {
    options?.onWeeklyPlanGenerated?.(weeklyData);
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
```

Also extend the `TOOL_LABELS` map (top of the file) to include `create_weekly_plan: "Creating your weekly schedule"`.

**Step 6: Update all importers**

Search: `grep -rln "use-goal-chat" apps/web/src` — should find ~3-4 files (page.tsx, goal-chat.tsx, etc.)

In each, replace:
- `from "@/lib/hooks/use-goal-chat"` → `from "@/lib/hooks/use-goal-session"`
- `useGoalChat(` → `useGoalSession(`
- `UseGoalChatInitialDraft` → `UseGoalSessionInitialDraft`

**Step 7: Typecheck.** Expected clean.

**Step 8: Commit**

```bash
git add apps/web/src/lib/hooks/use-goal-session.ts apps/web/src/components/goals/ apps/web/src/app/
git commit -m "refactor(chat): rename useGoalChat → useGoalSession, add intent + weekly tool"
```

---

### Task 1.5: Build the full-screen weekly-planning page

**Files:**
- Create: `apps/web/src/app/(app)/goals/[id]/plan-week/page.tsx`
- Modify: `apps/web/src/components/goals/goal-chat.tsx` (light extension, see Step 2)

**Why:** The user clicks "Plan this week" on the goal detail page → arrives at this full-screen route. We mount `useGoalSession` with `intent="weekly-planning"`, hydrate from the goal's existing session, and reuse the existing `GoalChat` UI shell + `PlanPreviewModal` for the result.

**Step 1: Create the page**

```tsx
// apps/web/src/app/(app)/goals/[id]/plan-week/page.tsx
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { getOrCreateGoalSession, loadDraftSession } from "@/lib/db/actions";
import { rebuildDraftHistory } from "@/lib/ai/draft-history";
import { getWeekStart } from "@/lib/utils/date";
import { PlanWeekClient } from "@/components/goals/plan-week-client";

export default async function PlanWeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Load goal + active phase server-side so we can build the weekly context.
  const { data: goal } = await supabase
    .from("goals")
    .select("*, phases(*)")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .single();
  if (!goal) notFound();

  const activePhase =
    goal.phases?.find((p: { status: string }) => p.status === "in_progress") ??
    goal.phases?.[0];
  if (!activePhase) notFound();

  // Find or create the unified session for this goal, then rehydrate its
  // message history so the client mounts with the prior conversation
  // visible above the new turn.
  const session = await getOrCreateGoalSession(goalId);
  const loaded = await loadDraftSession(session.id);
  const rebuilt = loaded ? rebuildDraftHistory(loaded.messages) : null;

  return (
    <PlanWeekClient
      goalId={goalId}
      goal={{ title: goal.title, description: goal.description ?? "" }}
      phase={{
        id: activePhase.id,
        title: activePhase.title,
        description: activePhase.description ?? "",
        estimatedWeeks: activePhase.estimated_weeks ?? 4,
      }}
      weekStart={getWeekStart()}
      session={{ id: session.id, rebuilt }}
    />
  );
}
```

**Step 2: Create the client component**

```tsx
// apps/web/src/components/goals/plan-week-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { ChatMessage } from "./chat-message";
import { PlanPreviewModal } from "./plan-preview-modal";
import { useGoalSession } from "@/lib/hooks/use-goal-session";
import type { RebuiltHistory } from "@/lib/ai/draft-history";
import { ArrowLeft } from "lucide-react";
import { getTodayDayOfWeek } from "@/lib/utils/date";
import { createDailyTasks, createWeeklyPlan } from "@/lib/db/actions";

interface PlanWeekClientProps {
  goalId: string;
  goal: { title: string; description: string };
  phase: { id: string; title: string; description: string; estimatedWeeks: number };
  weekStart: string;
  session: { id: string; rebuilt: RebuiltHistory | null };
}

export function PlanWeekClient({ goalId, goal, phase, weekStart, session }: PlanWeekClientProps) {
  const router = useRouter();
  const todayDow = getTodayDayOfWeek();

  const sessionHook = useGoalSession({
    initialDraft: session.rebuilt
      ? { sessionId: session.id, rebuilt: session.rebuilt }
      : null,
    intent: "weekly-planning",
    weeklyContext: {
      goalTitle: goal.title,
      goalDescription: goal.description,
      phaseTitle: phase.title,
      phaseDescription: phase.description,
      weekNumber: 1,
      estimatedWeeks: phase.estimatedWeeks,
      isMidWeekStart: todayDow > 0,
      startDayOfWeek: todayDow,
    },
    onWeeklyPlanGenerated: (plan) => {
      // PlanPreviewModal will render via sessionHook.weeklyPreview state
      // (added in Task 1.4 — the hook stashes the latest plan there).
    },
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="border-b border-[#E7DED2] px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push(`/goals/${goalId}`)}
          className="text-[#9B948B] hover:text-[#2B2B2B]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold text-[#2B2B2B]">Plan this week</h1>
          <p className="text-xs text-[#6F6A64]">{phase.title}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {sessionHook.messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              isStreaming={
                sessionHook.isStreaming && i === sessionHook.messages.length - 1
              }
              onAnswer={sessionHook.answerQuestion}
            />
          ))}
        </div>
      </div>

      {sessionHook.weeklyPreview && (
        <PlanPreviewModal
          plan={sessionHook.weeklyPreview}
          onConfirm={async () => {
            const created = await createWeeklyPlan({
              phase_id: phase.id,
              week_start: weekStart,
              ai_summary: sessionHook.weeklyPreview!.ai_summary,
            });
            await createDailyTasks(
              created.id,
              sessionHook.weeklyPreview!.tasks.map((t) => ({
                day_of_week: t.day_of_week,
                title: t.title,
                description: t.description,
                time_estimate_minutes: t.time_estimate_minutes,
                time_slot: t.time_slot,
                sort_order: t.sort_order,
              }))
            );
            router.push(`/goals/${goalId}`);
          }}
          onEdit={sessionHook.requestEdit}
          isSaving={sessionHook.stage === "saving"}
        />
      )}
    </div>
  );
}
```

**Step 3: Extract `PlanPreviewModal` from `weekly-plan-chat.tsx` into its own file**

```bash
# Create apps/web/src/components/goals/plan-preview-modal.tsx
# Move the PlanPreviewModal component (lines 30-150ish) from weekly-plan-chat.tsx
# Export as a named export.
```

The component itself is unchanged — just relocated so plan-week-client can import it without dragging in the whole slide-out.

**Step 4: Add `weeklyPreview` state to `useGoalSession`**

In the renamed hook, add a new state and expose it:

```ts
const [weeklyPreview, setWeeklyPreview] = useState<WeeklyPlanData | null>(null);
```

Inside the `create_weekly_plan` branch (Task 1.4 Step 5), set it:

```ts
setWeeklyPreview(weeklyData);
options?.onWeeklyPlanGenerated?.(weeklyData);
```

Add to the return object:

```ts
return {
  ...,
  weeklyPreview,
  clearWeeklyPreview: () => setWeeklyPreview(null),
};
```

**Step 5: Add a `requestEdit` method** for the "edit" button on the preview. Mirrors existing `editPlan` for goal-creation:

```ts
const requestEdit = useCallback(async () => {
  if (intent !== "weekly-planning") return;
  setWeeklyPreview(null);
  // Send an edit-request message — same pattern as editPlan for goal-creation
  const editText = "I'd like to adjust the weekly plan. What would you change?";
  const userMsg: ChatMessage = { id: genId(), role: "user", content: editText };
  setMessages((prev) => [...prev, userMsg]);
  const toolUseId = lastToolUseIdRef.current || "";
  historyRef.current.push({
    role: "user",
    content: [{ type: "tool_result", tool_use_id: toolUseId, content: "User wants to adjust the plan" }],
  });
  historyRef.current.push({ role: "user", content: editText });
  sendToApi([...historyRef.current]);
}, [intent, sendToApi]);
```

Expose in return.

**Step 6: Typecheck + smoke test the route**

Run `cd apps/web && npx tsc --noEmit`. Expected clean.

Spin up dev server: `npm run dev`. Navigate to `/goals/<some-goal-id>/plan-week` while logged in. Expected: page renders, prior conversation messages visible, no crashes.

**Step 7: Commit**

```bash
git add apps/web/src/app/\(app\)/goals/\[id\]/plan-week/ apps/web/src/components/goals/plan-week-client.tsx apps/web/src/components/goals/plan-preview-modal.tsx apps/web/src/lib/hooks/use-goal-session.ts
git commit -m "feat(goals): full-screen plan-week route reusing the goal session"
```

---

### Task 1.6: Replace the WeeklyPlanChatPanel slide-out with a navigation link

**Files:**
- Modify: `apps/web/src/app/(app)/goals/[id]/page.tsx`

**Why:** The existing `rightPanel === "plan-chat"` branch (line 584-) mounts the slide-out. We replace the trigger button to instead navigate to `/goals/[id]/plan-week`. The slide-out component itself stays in the codebase for now (Task 1.8 deletes it once the new route is verified live).

**Step 1: Find the button that sets `rightPanel = "plan-chat"`**

Run: `grep -nE "plan-chat|setRightPanel" apps/web/src/app/\(app\)/goals/\[id\]/page.tsx`

**Step 2: Replace the click handler** to use `router.push("/goals/${id}/plan-week")` instead of `setRightPanel("plan-chat")`.

Add `import { useRouter } from "next/navigation"` if not already present.

**Step 3: Remove the `<WeeklyPlanChatPanel ...>` JSX block** (lines 584-~610) and the `WeeklyPlanChatPanel` import.

**Step 4: Typecheck + smoke test**

The "Plan this week" button should now route the user to the full-screen page.

**Step 5: Commit**

```bash
git add apps/web/src/app/\(app\)/goals/\[id\]/page.tsx
git commit -m "feat(goals): swap weekly plan slide-out for full-screen route"
```

---

### Task 1.7: Stop creating new `__weekly-draft__` sessions

**Files:**
- Modify: `apps/web/src/lib/db/actions.ts` — mark `createWeeklyDraft` as deprecated; the new flow doesn't call it
- (No code deletion — keeping the function so legacy data still loads)

**Step 1: Add a JSDoc deprecation marker** to `createWeeklyDraft`:

```ts
/**
 * @deprecated Phase 1 of the unified-session refactor: weekly planning
 * now appends to the goal's main session. Existing __weekly-draft__
 * rows in the DB are still readable via loadDraftSession, but no new
 * ones should be created. Will be removed in Phase 3.
 */
export async function createWeeklyDraft(params: { ... }): Promise<ChatSession> {
```

**Step 2: Verify nothing in the codebase still calls it.** Run:

```bash
grep -rn "createWeeklyDraft" apps/web/src
```

Expected: only the function definition itself, no callers (because Task 1.5 routed the new flow through `getOrCreateGoalSession`).

If callers remain (e.g., from `weekly-plan-chat.tsx` slide-out), update them to use the goal session OR confirm they're in dead code that Task 1.8 will delete.

**Step 3: Commit**

```bash
git add apps/web/src/lib/db/actions.ts
git commit -m "chore(chat): deprecate createWeeklyDraft (replaced by goal session)"
```

---

### Task 1.8: Delete the slide-out weekly chat code

**Files:**
- Delete: `apps/web/src/components/goals/weekly-plan-chat.tsx`
- Delete: `apps/web/src/lib/hooks/use-weekly-plan-chat.ts`
- Modify: `apps/web/src/app/api/ai/plan/route.ts` — remove the now-unused `weekly-chat` action

**Why:** Phase 1 replaced both surface and hook. Verifying nothing imports them, then deleting.

**Step 1: Verify no imports**

```bash
grep -rn "weekly-plan-chat\|useWeeklyPlanChat" apps/web/src
```

Expected: zero matches outside the files about to be deleted.

**Step 2: Delete files**

```bash
rm apps/web/src/components/goals/weekly-plan-chat.tsx
rm apps/web/src/lib/hooks/use-weekly-plan-chat.ts
```

**Step 3: Remove the `weekly-chat` action from `/api/ai/plan/route.ts`** (lines 86-95). The new dispatcher (`goal-session`) covers it.

**Step 4: Typecheck.**

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(chat): remove deprecated weekly-plan-chat slide-out + hook + action"
```

---

### Task 1.9: Phase 1 e2e verification

**Step 1: Start dev server, log in, complete one full goal-creation flow.**

Verify:
- Goal-creation chat works as before
- After confirm, the goal's session row in DB has `goal_id` set (check via Supabase dashboard or `select * from chat_sessions where goal_id = '<new id>'`)

**Step 2: Click "Plan this week" on the goal page.**

Verify:
- Routes to `/goals/<id>/plan-week`
- Prior conversation (the goal-creation chat) is visible above
- Type a message, the model responds with full context (it should reference the goal/phase by name)
- "Drafting your plan…" card appears when `create_weekly_plan` streams
- Confirm writes the weekly plan + daily tasks
- Returns to the goal page after confirm

**Step 3: Commit any small fixes found, then push Phase 1.**

```bash
git push origin HEAD:main
```

---

# Phase 2: Coach folds into the same session + send-item-to-bot

**Outcome:** The right-side "AI Coach" panel on the goal detail page reads from and writes to the same goal session as Phase 1's goal-creation + weekly-planning. Server-side tools (web_search, web_fetch, code_execution) are exposed only when intent is `coach`. A new "send to bot" affordance on todo and schedule items pre-fills a coach turn into the same session.

**Scope of Phase 2:** ~6 tasks, ~3-4 hours.

---

### Task 2.1: Extend the dispatcher with `coach` intent

**Files:**
- Modify: `apps/web/src/app/api/ai/plan/route.ts`

**Step 1: Add a third branch in the `goal-session` dispatcher** for `intent === "coach"`:

```ts
if (intent === "coach") {
  if (!context?.coach) {
    return NextResponse.json(
      { error: "coach intent requires context.coach" },
      { status: 400 }
    );
  }
  // Reuse the existing streamGoalDetailChat which knows about server tools.
  const readableStream = streamGoalDetailChat(
    messages,
    context.coach,
    (inputTokens, outputTokens) => {
      logUsage(user.id, "goal-session-coach", "claude-opus-4-7", inputTokens, outputTokens).catch(() => {});
    }
  );
  return new Response(readableStream, { headers: SSE_HEADERS });
}
```

Update the `body` type:

```ts
const { messages, intent, context } = body as {
  messages: Anthropic.MessageParam[];
  intent: "goal-creation" | "weekly-planning" | "coach";
  context?: {
    weekly?: WeeklyPlanChatContext;
    coach?: GoalDetailChatContext;
  };
};
```

**Step 2: The model in `streamGoalDetailChat` is currently sonnet-4-6 — verify and switch to opus-4-7 for consistency.**

In `apps/web/src/lib/ai/goal-detail-chat.ts`, find the `client.messages.stream({...})` call and change `model: MODELS.sonnet` to `model: MODELS.opus` (per "quality > speed" preference established for plan flows).

**Step 3: Typecheck + commit**

```bash
git add apps/web/src/app/api/ai/plan/route.ts apps/web/src/lib/ai/goal-detail-chat.ts
git commit -m "feat(api): add coach intent to goal-session dispatcher"
```

---

### Task 2.2: Extend `useGoalSession` with coach intent + server-tool delta types

**Files:**
- Modify: `apps/web/src/lib/hooks/use-goal-session.ts`

**Why:** The coach response stream uses additional Anthropic event types (`server_tool_use`, `web_search_tool_result`, `code_execution_tool_result`, `pause_turn`) that the existing reader loop doesn't recognize. We extend the reader to surface these as tool activity badges and to handle the agentic `pause_turn` continuation.

**Step 1: Extend the SSE event handler**

In the existing event-type switch (around `if (event.type === "content_block_start")` etc.), add:

```ts
if (event.type === "content_block_start") {
  const block = event.content_block;
  if (block?.type === "server_tool_use") {
    // web_search / web_fetch / code_execution — no input JSON deltas
    // for these (Anthropic returns the result block directly), just
    // surface as activity.
    const label = SERVER_TOOL_LABELS[block.name] || `Running ${block.name}`;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              toolActivity: [
                ...(m.toolActivity || []),
                { type: block.name, label },
              ],
            }
          : m
      )
    );
  }
  // ... existing tool_use handling
}
```

Add a constant near `TOOL_LABELS`:

```ts
const SERVER_TOOL_LABELS: Record<string, string> = {
  web_search: "Searching the web",
  web_fetch: "Fetching a page",
  code_execution: "Running code",
};
```

**Step 2: Handle `pause_turn` agentic continuation**

The existing `streamGoalDetailChat` server function already loops on `pause_turn`. The client just needs to keep reading the SSE stream — no client-side change beyond accepting the additional event types as no-ops if not handled.

Verify by reading `streamGoalDetailChat` source — confirm it emits the continuation chunks on the same SSE stream.

**Step 3: Pass coach context from the hook**

```ts
export interface UseGoalSessionOptions {
  ...
  coachContext?: GoalDetailChatContext;
}
```

In the API call body, when `intent === "coach"`:

```ts
context: {
  ...(intent === "weekly-planning" && options?.weeklyContext ? { weekly: options.weeklyContext } : {}),
  ...(intent === "coach" && options?.coachContext ? { coach: options.coachContext } : {}),
},
```

**Step 4: Typecheck + commit**

```bash
git add apps/web/src/lib/hooks/use-goal-session.ts
git commit -m "feat(chat): useGoalSession supports coach intent + server-tool badges"
```

---

### Task 2.3: Refactor `GoalChatPanel` (right-side coach) to use `useGoalSession`

**Files:**
- Modify: `apps/web/src/components/goals/goal-chat-panel.tsx`

**Why:** Today this panel uses its own `useGoalDetailChat` hook with its own session lifecycle. We swap to `useGoalSession` so coach turns append to the goal's main session.

**Step 1: Read the current `goal-chat-panel.tsx`** to inventory:
- Where it loads/creates a session
- What state it manages
- How it wires `onSendMessage` etc.

**Step 2: At mount, server-resolve the session**

The panel currently lazily fetches its session. After Phase 2, it should call `getOrCreateGoalSession(goalId)` server-side — but this panel is a client component. Pass the resolved sessionId in via props from the goal page (which is a server component).

In `apps/web/src/app/(app)/goals/[id]/page.tsx`, near where `GoalChatPanel` is mounted (line 561), add a server-side session lookup at the top of the page component:

```ts
const goalSession = await getOrCreateGoalSession(id);
const loadedGoalSession = await loadDraftSession(goalSession.id);
const goalSessionRebuilt = loadedGoalSession ? rebuildDraftHistory(loadedGoalSession.messages) : null;
```

Pass to `GoalChatPanel`:

```tsx
<GoalChatPanel
  goalId={id}
  sessionId={goalSession.id}
  initialDraft={goalSessionRebuilt ? { sessionId: goalSession.id, rebuilt: goalSessionRebuilt } : null}
  goalContext={{...existing...}}
  ...
/>
```

**Step 3: Inside `GoalChatPanel`, replace `useGoalDetailChat` with `useGoalSession`**

```tsx
const session = useGoalSession({
  initialDraft: props.initialDraft,
  intent: "coach",
  coachContext: props.goalContext,
});
```

Replace all references to the old hook's return shape.

**Step 4: Typecheck + commit**

```bash
git add apps/web/src/components/goals/goal-chat-panel.tsx apps/web/src/app/\(app\)/goals/\[id\]/page.tsx
git commit -m "feat(chat): coach panel writes to the unified goal session"
```

---

### Task 2.4: Delete `useGoalDetailChat` hook (now unused)

**Files:**
- Delete: `apps/web/src/lib/hooks/use-goal-detail-chat.ts` (or wherever it lives)
- Modify: `apps/web/src/app/api/ai/plan/route.ts` — drop the standalone `goal-detail-chat` action

**Step 1: Verify no other importers**

```bash
grep -rn "useGoalDetailChat\|goal-detail-chat" apps/web/src --include="*.tsx" --include="*.ts"
```

Server-side `streamGoalDetailChat` from `lib/ai/goal-detail-chat.ts` STAYS — it's called by Task 2.1's coach branch. Delete only the client hook + standalone API action.

**Step 2: Remove the `goal-detail-chat` action** from `/api/ai/plan/route.ts` (lines 95-105).

**Step 3: Typecheck + commit**

```bash
git add -A
git commit -m "chore(chat): remove standalone goal-detail-chat hook + action"
```

---

### Task 2.5: "Send to bot" entry from todo and schedule items

**Files:**
- Modify: components rendering todo / schedule items (find via `grep -rn "todo.*onClick\|task.*onClick" apps/web/src/components/goals`)
- Modify: `apps/web/src/app/(app)/goals/[id]/page.tsx` — orchestrates opening the panel with a pre-filled message

**Why:** User's request: "将这些 Schedule item、To-do item 发给机器人时（即使是从页面右侧滑出来），也应该还是同一个对话 Session"

**Step 1: Find existing affordance**

There's already a `pendingAITask` state in `page.tsx:580`. Trace where it's set — that's the existing "send to bot" trigger.

**Step 2: Convert pendingAITask into a session message**

Currently `pendingAITask` is passed as a `taskContext` prop and probably renders inside the panel. Change behavior: when set, the panel should:
1. Pre-fill the input box with `"About task: <title>. <description>"`
2. Or auto-send as a user message immediately

Recommend pre-fill (lets user edit before sending).

In `GoalChatPanel`, add a `useEffect` watching `taskContext`:

```ts
useEffect(() => {
  if (props.taskContext) {
    setInputDraft(`About task: ${props.taskContext.title}. ${props.taskContext.description}`);
    inputRef.current?.focus();
  }
}, [props.taskContext]);
```

**Step 3: Verify the existing send-to-bot UI elsewhere in the codebase still works**

Search: `grep -rn "setPendingAITask\|onSendToAI" apps/web/src`

Make sure each callsite still navigates to or opens the panel with the right context.

**Step 4: Typecheck + smoke test + commit**

```bash
git add -A
git commit -m "feat(goals): send-to-bot pre-fills coach input within unified session"
```

---

### Task 2.6: Phase 2 e2e verification

**Steps:**
1. On a goal page, open the AI Coach panel. Verify the prior conversation (goal-creation + weekly-planning) is visible above the input.
2. Ask coach a question that needs web search ("what time is sunset in Tokyo today?"). Verify "Searching the web" badge appears.
3. From a todo item, click the "send to bot" affordance. Verify the panel opens with the pre-filled message and that it appends to the same session.
4. Check Supabase: there should still be ONE chat_sessions row per goal, with messages from all three flows.

Push:

```bash
git push origin HEAD:main
```

---

# Phase 3: Context summarization (only)

**Outcome:** Goals with >50 chat turns get a compact summary placeholder injected as the first message sent to the model, replacing all but the most recent 30 turns. Old messages remain in the DB and visible in the UI; only the API request is trimmed.

**Scope of Phase 3:** ~4 tasks, ~2-3 hours.

---

### Task 3.1: Add `getMessageSummary` helper

**Files:**
- Create: `apps/web/src/lib/ai/summarize-session.ts`

**Step 1: Implement**

```ts
import { getAnthropicClient, MODELS } from "./client";
import type Anthropic from "@anthropic-ai/sdk";

const SUMMARIZE_PROMPT = `Summarize the following conversation between a user and an AI goal coach into a single concise paragraph. Capture: (1) the user's goal and any decisions about phases or weekly plans they made, (2) constraints or preferences they mentioned (schedule, energy, blockers), (3) any unresolved questions. Keep it under 250 words. Output the summary text only — no preamble.`;

export async function summarizeMessages(
  messages: Anthropic.MessageParam[]
): Promise<string> {
  const client = getAnthropicClient();
  const result = await client.messages.create({
    model: MODELS.sonnet, // summarization is a low-stakes, cost-sensitive task
    max_tokens: 800,
    system: SUMMARIZE_PROMPT,
    messages: [
      {
        role: "user",
        content: `Conversation transcript:\n\n${messages
          .map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
          .join("\n\n")}`,
      },
    ],
  });
  const block = result.content[0];
  return block.type === "text" ? block.text : "";
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/ai/summarize-session.ts
git commit -m "feat(chat): add summarizeMessages helper"
```

---

### Task 3.2: Persist summary on the session row

**Files:**
- Modify: `apps/web/src/lib/db/actions.ts` — add helper `setSessionSummary(sessionId, summary, throughMessageIndex)`

**Step 1: Add to actions.ts**

```ts
export async function setSessionSummary(
  sessionId: string,
  summary: string,
  throughMessageIndex: number
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("chat_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  const merged = {
    ...((existing?.metadata as ChatSession["metadata"]) || {}),
    summary,
    summarizedThrough: throughMessageIndex,
    summarizedAt: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("chat_sessions")
    .update({ metadata: merged })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (error) throw error;
}
```

Extend the `ChatSession.metadata` type accordingly.

**Step 2: Commit**

```bash
git add apps/web/src/lib/db/actions.ts apps/web/src/lib/types/database.ts
git commit -m "feat(chat): persist session summary metadata"
```

---

### Task 3.3: Trigger summarization on long sessions

**Files:**
- Modify: `apps/web/src/app/api/ai/plan/route.ts` — before the dispatcher, if message count > 50 and not already summarized through the latest threshold, summarize the older portion

**Step 1: Add pre-dispatch logic to the `goal-session` action**

```ts
if (action === "goal-session") {
  let { messages } = body as { messages: Anthropic.MessageParam[]; ... };
  const { sessionId } = body as { sessionId?: string };

  if (sessionId && messages.length > 50) {
    const session = await loadDraftSession(sessionId);
    const existingSummary = session?.session.metadata?.summary as string | undefined;
    const summarizedThrough = (session?.session.metadata?.summarizedThrough as number) ?? 0;

    // Re-summarize if 30+ new turns have accumulated since last summary.
    if (messages.length - summarizedThrough > 30) {
      const olderPortion = messages.slice(0, messages.length - 30);
      const newSummary = await summarizeMessages(olderPortion);
      await setSessionSummary(sessionId, newSummary, olderPortion.length);
      messages = [
        {
          role: "user",
          content: `Earlier conversation summary:\n\n${newSummary}`,
        },
        ...messages.slice(olderPortion.length),
      ];
    } else if (existingSummary) {
      // Apply existing summary
      messages = [
        {
          role: "user",
          content: `Earlier conversation summary:\n\n${existingSummary}`,
        },
        ...messages.slice(summarizedThrough),
      ];
    }
  }

  // ... rest of dispatcher (Task 1.3 + 2.1)
}
```

**Step 2: UI marker (optional polish)** — when the client sees session.metadata.summary, render an "Older messages summarized" banner above the message list. Skip if time-pressed.

**Step 3: Commit**

```bash
git add apps/web/src/app/api/ai/plan/route.ts
git commit -m "feat(chat): summarize older turns on long sessions"
```

---

### Task 3.4: Phase 3 verification

**Step 1: Manual test**

Pick a goal with a long conversation (or fabricate one by inserting 60 messages via SQL). Trigger a coach turn. Verify:
- The first request takes longer (summarization is happening)
- Subsequent requests are fast (summary cached in metadata)
- The model still responds with full context awareness

**Step 2: Push**

```bash
git push origin HEAD:main
```

---

## Deferred / Won't-do

- **Inline tool output rendering** — user explicitly chose overlay (current). Defer indefinitely.
- **Summary regeneration on edit** — if a user edits an old message, the summary may become stale. Acceptable for v1; revisit if it causes confusion.
- **Cross-goal session dashboard** — out of scope; user's mental model is per-goal.

---

## Ship Checklist

After all phases:
- [ ] All TypeScript clean (`npx tsc --noEmit` from `apps/web/`)
- [ ] One `chat_sessions` row per goal in DB after creating + weekly-planning + coach round trip
- [ ] No new `__weekly-draft__` rows created since deploy
- [ ] Drafting card visible during BOTH goal-creation `create_goal_plan` AND weekly-planning `create_weekly_plan`
- [ ] AI Coach correctly references prior goal-creation chat in its responses
- [ ] Send-to-bot pre-fills coach input within the same session

---

## Key References

- Hook to be unified: `apps/web/src/lib/hooks/use-goal-chat.ts` (Phase 1.4)
- Hook to be deleted: `apps/web/src/lib/hooks/use-weekly-plan-chat.ts` (Phase 1.8)
- Slide-out to be deleted: `apps/web/src/components/goals/weekly-plan-chat.tsx` (Phase 1.8)
- Coach panel to be refactored: `apps/web/src/components/goals/goal-chat-panel.tsx` (Phase 2.3)
- Backend dispatcher: `apps/web/src/app/api/ai/plan/route.ts` (Phase 1.3 + 2.1 + 3.3)
- Session helpers: `apps/web/src/lib/db/actions.ts:794-960` (Phase 1.1, 1.2, 1.7, 3.2)
- Existing schema: `supabase/migrations/005_agent_chat_sessions.sql` + `021_chat_sessions_metadata.sql` (no migration needed)
