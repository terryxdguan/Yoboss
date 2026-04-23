# Dashboard Onboarding + Split Add Buttons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a multi-stage welcome banner that guides empty/partial-Dashboard users through Goal → Weekly Plan → To-Do creation, and split each favorites-section "+" button into two distinct actions ("Create new" + "Add existing", with "Hire new" for Members).

**Architecture:** All onboarding state is derived live from the existing dashboard read (no schema changes). A new `WelcomeBanner` client component reads stage + counts from props and renders a hero banner above the Stats cards (or returns null when "Done"). Each favorites section's header becomes two pill buttons; the empty-state center CTA collapses to a single prominent "Create new". Picker modals get an inline "Or create a new one" fallback for the rare case a user opens an empty picker.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind, lucide-react. Pure client-side state for picker fallback; server-computed stage in `getDashboardData` extension.

**Reference design doc:** `docs/plans/2026-04-23-dashboard-onboarding-design.md`

---

### Task 1: Extend `getDashboardData` with onboarding state

**Files:**
- Modify: `apps/web/src/lib/db/actions.ts:1468-1670` (the `getDashboardData` function and its return type)

**Why:** The Dashboard server page needs to know which onboarding stage to render. The function already pulls `goals`, `plans` (weekly_plans), and `todos` — we just need to add a derived `onboarding` field to its return.

**Step 1: Read the current function** at `apps/web/src/lib/db/actions.ts:1468` to confirm the return shape and `goals` / `plans` / `todos` variables already exist.

**Step 2: Add onboarding stage type + extend return shape**

Inside the same file, add this type near the top of the dashboard section (or just before `getDashboardData`):

```ts
export type DashboardOnboardingStage =
  | "stage1"   // 0 goals
  | "stage2"   // 1+ goals, 0 weekly plans
  | "stage3"   // 1+ goals, 1+ weekly plans, 0 todos
  | "done";    // all three present

export interface DashboardOnboarding {
  stage: DashboardOnboardingStage;
  /** Used by Stage 2's smart CTA — null if 0 or 2+ goals (the smart-route
   *  logic falls back to /goals list in those cases). When exactly 1 goal,
   *  this is its id so the banner can route directly to /goals/{id}/plan-week. */
  singleGoalId: string | null;
  /** Goal count for Stage 2 routing decision (1 → plan-week direct, 2+ → /goals list). */
  goalCount: number;
}
```

Extend the return type signature at line 1468:

```ts
export async function getDashboardData(): Promise<{
  stats: DashboardStats;
  todayItems: DashboardTodayItem[];
  highPriorityItems: DashboardTodayItem[];
  workflows: WorkflowSummary[];
  goalsWithPhases: GoalWithPhases[];
  onboarding: DashboardOnboarding;   // NEW
}> {
```

**Step 3: Compute the stage**

Inside the function, AFTER the existing `goals` / `plans` / `todos` variables are populated (around line 1545 after the `// --- Stats ---` block), and BEFORE the `return { stats, ... }` at the end, add:

```ts
// --- Onboarding stage ---
//
// Drives the WelcomeBanner. Pure derivation from the same data we
// already loaded — no extra round-trips. Stage progression assumes the
// user follows the natural Goal → Weekly Plan → To-Do path.
const goalCount = goals.length;
const weeklyPlanCount = plans.length;
const todoCount = todos.length;

let stage: DashboardOnboardingStage;
if (goalCount === 0) stage = "stage1";
else if (weeklyPlanCount === 0) stage = "stage2";
else if (todoCount === 0) stage = "stage3";
else stage = "done";

const onboarding: DashboardOnboarding = {
  stage,
  goalCount,
  singleGoalId: goalCount === 1 ? goals[0].id : null,
};
```

**Step 4: Include `onboarding` in the return object**

In the existing `return { stats, todayItems, highPriorityItems, workflows, goalsWithPhases }` near end of function, add `onboarding`:

```ts
return { stats, todayItems, highPriorityItems, workflows, goalsWithPhases, onboarding };
```

**Step 5: Also extend the unauthenticated empty-return**

The function returns an early empty payload at lines 1478-1487 when no user. Add the onboarding field there too:

```ts
return {
  stats: { ...as before... },
  todayItems: [],
  highPriorityItems: [],
  workflows: [],
  goalsWithPhases: [],
  onboarding: { stage: "stage1", goalCount: 0, singleGoalId: null },
};
```

**Step 6: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

**Step 7: Commit**

```bash
git add apps/web/src/lib/db/actions.ts
git commit -m "feat(dashboard): derive onboarding stage from existing data"
```

---

### Task 2: Create `WelcomeBanner` component

**Files:**
- Create: `apps/web/src/components/dashboard/welcome-banner.tsx`

**Why:** A self-contained client component that reads the onboarding object + a callback for opening the Add-To-Do modal, and renders the right banner per stage. Returns `null` when stage is "done" so the parent layout isn't padded with empty space.

**Step 1: Create the file**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import type { DashboardOnboarding } from "@/lib/db/actions";

interface WelcomeBannerProps {
  onboarding: DashboardOnboarding;
  /** Stage 3's CTA opens the existing Add To-Do modal in place. The
   *  parent (DashboardTodayItems) owns that modal state and exposes
   *  this opener via context. Banner just calls it. */
  onOpenAddTodo: () => void;
}

interface StageContent {
  title: string;
  subtitle: string;
  ctaLabel: string;
  onClick: () => void;
}

export function WelcomeBanner({ onboarding, onOpenAddTodo }: WelcomeBannerProps) {
  const router = useRouter();

  if (onboarding.stage === "done") return null;

  const content: StageContent = (() => {
    switch (onboarding.stage) {
      case "stage1":
        return {
          title: "Welcome to YoBoss",
          subtitle:
            "Let's set up your first goal — describe what you want to achieve and your team takes it from there.",
          ctaLabel: "Create your first goal",
          onClick: () => router.push("/goals/create"),
        };
      case "stage2":
        return {
          title: "One goal set. Let's plan this week.",
          subtitle:
            "Turn your goal into a concrete weekly schedule your team can execute alongside you.",
          ctaLabel: "Plan your first week",
          onClick: () => {
            // Smart route: 1 goal → that goal's plan-week directly;
            // 2+ goals → /goals list so user picks which one to plan.
            if (onboarding.singleGoalId) {
              router.push(`/goals/${onboarding.singleGoalId}/plan-week`);
            } else {
              router.push("/goals");
            }
          },
        };
      case "stage3":
        return {
          title: "Your week is planned.",
          subtitle:
            "Keep momentum with a quick to-do for today — the little things that fall outside weekly plans.",
          ctaLabel: "Create your first to-do",
          onClick: onOpenAddTodo,
        };
    }
  })();

  return (
    <div className="rounded-2xl bg-[#EAF3FD] border border-[#7FAEE6]/30 px-6 py-5 flex items-center gap-6 shadow-[0_4px_16px_rgba(127,174,230,0.10)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7FAEE6]/15 shrink-0">
        <Sparkles className="h-5 w-5 text-[#7FAEE6]" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold text-[#2B2B2B]">{content.title}</h3>
        <p className="text-sm text-[#6F6A64] mt-0.5">{content.subtitle}</p>
      </div>
      <button
        onClick={content.onClick}
        className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(127,174,230,0.35)]"
      >
        {content.ctaLabel}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
```

**Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard/welcome-banner.tsx
git commit -m "feat(dashboard): add WelcomeBanner component for onboarding stages"
```

---

### Task 3: Wire WelcomeBanner into the Dashboard + Add-To-Do context

**Files:**
- Modify: `apps/web/src/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/src/components/dashboard/dashboard-shell.tsx` (add a second context for the Add-To-Do opener)
- Modify: `apps/web/src/components/dashboard/today-items.tsx` (publish its `setShowAdd` via the new context)

**Why:** Stage 3's CTA needs to open the Add To-Do modal that already lives in `today-items.tsx`. We expose the modal's open handler via React context (mirrors the existing `DashboardChatContext` pattern in dashboard-shell.tsx) and wire the banner to consume it.

**Step 1: Add a new context to `dashboard-shell.tsx`**

In `apps/web/src/components/dashboard/dashboard-shell.tsx`, near the bottom where `DashboardChatContext` is exported (around line 76), add a parallel context:

```ts
// Open the Add To-Do modal hosted in DashboardTodayItems. Publisher is
// today-items.tsx; consumers are e.g. WelcomeBanner's Stage 3 CTA.
export const DashboardAddTodoContext = createContext<(() => void) | null>(null);

export function useDashboardAddTodo() {
  return useContext(DashboardAddTodoContext);
}
```

Then inside the `DashboardShell` component's return JSX, wrap the children in BOTH providers (nest the new one inside the existing one):

```tsx
<DashboardChatContext.Provider value={setChatItem}>
  <DashboardAddTodoContext.Provider value={addTodoOpener}>
    {children}
  </DashboardAddTodoContext.Provider>
</DashboardChatContext.Provider>
```

You also need state to hold the opener. At the top of `DashboardShell`:

```tsx
const [addTodoOpener, setAddTodoOpener] = useState<(() => void) | null>(null);
```

And expose a registration helper via a third tiny context — actually simpler: pass `setAddTodoOpener` itself via a registration context.

To keep this clean, add ONE more context — the "register an opener" channel:

```ts
export const DashboardAddTodoRegisterContext = createContext<
  ((opener: () => void) => void) | null
>(null);

export function useRegisterAddTodoOpener() {
  return useContext(DashboardAddTodoRegisterContext);
}
```

And nest its provider at the same level:

```tsx
<DashboardAddTodoRegisterContext.Provider value={setAddTodoOpener}>
  <DashboardAddTodoContext.Provider value={addTodoOpener}>
    {children}
  </DashboardAddTodoContext.Provider>
</DashboardAddTodoRegisterContext.Provider>
```

**Step 2: Have `today-items.tsx` register its opener**

In `apps/web/src/components/dashboard/today-items.tsx`, find the existing `const [showAdd, setShowAdd] = useState(false)` line (around line 38). After it, register the opener with the parent shell:

```tsx
const registerAddTodoOpener = useRegisterAddTodoOpener();
useEffect(() => {
  if (!registerAddTodoOpener) return;
  registerAddTodoOpener(() => () => setShowAdd(true));
  return () => registerAddTodoOpener(() => () => {});
}, [registerAddTodoOpener]);
```

The double-arrow `() => () => setShowAdd(true)` is intentional — `setAddTodoOpener` is a React `setState` and treats a function arg as a state-updater. We pass a function that *returns* the actual opener so it gets stored as the state value, not invoked.

Add the import at the top:

```tsx
import { useDashboardChat, useRegisterAddTodoOpener } from "@/components/dashboard/dashboard-shell";
```

(Replace the existing `useDashboardChat` import line.)

**Step 3: Render the banner in `dashboard/page.tsx`**

In `apps/web/src/app/(app)/dashboard/page.tsx`:

Add the import at the top:

```tsx
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
```

Then wrap `WelcomeBanner` inside a small wrapper because the page is a server component and `WelcomeBanner` needs the context. Since the banner is itself a client component, importing it directly works — but it needs `onOpenAddTodo` from context, which is a client thing. Solution: a thin client wrapper.

Create: `apps/web/src/components/dashboard/welcome-banner-host.tsx`

```tsx
"use client";

import { WelcomeBanner } from "./welcome-banner";
import { useDashboardAddTodo } from "./dashboard-shell";
import type { DashboardOnboarding } from "@/lib/db/actions";

interface WelcomeBannerHostProps {
  onboarding: DashboardOnboarding;
}

export function WelcomeBannerHost({ onboarding }: WelcomeBannerHostProps) {
  const openAddTodo = useDashboardAddTodo();
  return (
    <WelcomeBanner
      onboarding={onboarding}
      onOpenAddTodo={openAddTodo ?? (() => {})}
    />
  );
}
```

In `dashboard/page.tsx`, swap the import to `WelcomeBannerHost` and add it BETWEEN the title block and `<DashboardStats>`:

```tsx
import { WelcomeBannerHost } from "@/components/dashboard/welcome-banner-host";

// ... inside JSX:
<div className="space-y-8">
  <div className="flex items-baseline gap-3">
    <h1 className="...">Dashboard</h1>
    <p className="...">Overview of today&apos;s progress, tasks, and team activity</p>
  </div>

  <WelcomeBannerHost onboarding={data.onboarding} />   {/* NEW */}

  <DashboardStats stats={data.stats} workflows={allWorkflows} />
  ...
</div>
```

**Step 4: Typecheck + smoke test**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean. Then start the dev server (`npm run dev`) and load the dashboard at `/dashboard` while logged in. Expected:
- If your account has 0 goals: Stage 1 banner appears with "Create your first goal" button
- After creating a goal: refresh dashboard → Stage 2 banner appears
- And so on

(If you can't easily produce these states, just visually confirm the Stage 1 banner renders against an empty account.)

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/welcome-banner-host.tsx apps/web/src/components/dashboard/dashboard-shell.tsx apps/web/src/components/dashboard/today-items.tsx apps/web/src/app/\(app\)/dashboard/page.tsx
git commit -m "feat(dashboard): render onboarding banner with Add-To-Do callback"
```

---

### Task 4: Split `DashboardImportantGoals` header into Create new + Add existing

**Files:**
- Modify: `apps/web/src/components/dashboard/important-goals.tsx`

**Why:** Replace the single `+` header button with two pill buttons. Update the empty-state center CTA to be a single prominent "Create new goal" only.

**Step 1: Read the current file** to confirm structure (header, empty state, picker invocation).

**Step 2: Add `useRouter` import + replace header + button area**

At the top of the file, ensure these imports:

```tsx
import { useRouter } from "next/navigation";
import { Plus, Flag } from "lucide-react";
```

Inside the component, near the existing state hooks, add:

```tsx
const router = useRouter();
```

(Note: `router` is already declared at line 29 in the existing file — confirm it's there. If not, add it.)

Find the existing header `+` button (lines ~56-61):

```tsx
<button
  onClick={() => setShowPicker(true)}
  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
>
  <Plus className="h-4 w-4" />
</button>
```

Replace with two pill buttons:

```tsx
<div className="flex items-center gap-2">
  <button
    onClick={() => router.push("/goals/create")}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#7FAEE6] text-white text-xs font-semibold hover:bg-[#6A9DDA] active:scale-95 transition-all shadow-[0_2px_8px_rgba(127,174,230,0.25)]"
  >
    <Plus className="h-3.5 w-3.5" />
    Create new
  </button>
  <button
    onClick={() => setShowPicker(true)}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFFDF9] text-[#7FAEE6] border border-[#7FAEE6]/40 text-xs font-semibold hover:bg-[#EAF3FD] active:scale-95 transition-all"
  >
    <Plus className="h-3.5 w-3.5" />
    Add existing
  </button>
</div>
```

**Step 3: Update the empty-state center CTA**

Find the existing empty-state block (lines ~67-79). The current center button looks like:

```tsx
<button
  onClick={() => setShowPicker(true)}
  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-[#7FAEE6] bg-[#EAF3FD] hover:bg-[#7FAEE6]/20 transition-colors"
>
  <Plus className="h-3.5 w-3.5" />
  Add Goal
</button>
```

Replace with a more prominent Create-new-only CTA:

```tsx
<button
  onClick={() => router.push("/goals/create")}
  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(127,174,230,0.35)]"
>
  <Plus className="h-4 w-4" />
  Create new goal
</button>
```

**Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/important-goals.tsx
git commit -m "feat(dashboard): split Important Goals add into Create new + Add existing"
```

---

### Task 5: Apply the same split to `DashboardFavoriteWorkflows`

**Files:**
- Modify: `apps/web/src/components/dashboard/favorite-workflows.tsx`

**Step 1: Read the current file** to find the header `+` button and empty-state CTA. Pattern matches important-goals.tsx.

**Step 2: Apply the same two-pill-button header pattern** (same Tailwind classes), with:
- `Create new` → `router.push("/workflows/edit/new")`
- `Add existing` → opens the existing `WorkflowPickerModal` (via the existing `setShowPicker(true)` or equivalent state handle)

**Step 3: Apply the same empty-state CTA pattern**:
- Single prominent center button labeled `Create new workflow` → `router.push("/workflows/edit/new")`

(If `useRouter` / `router` isn't already in the file, import + declare it.)

**Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/favorite-workflows.tsx
git commit -m "feat(dashboard): split Favorite Workflows add into Create new + Add existing"
```

---

### Task 6: Apply the split to `DashboardFavoriteMembers` (Hire new variant)

**Files:**
- Modify: `apps/web/src/components/dashboard/favorite-members.tsx`

**Step 1: Read the current file** to find the header `+` button and empty-state CTA.

**Step 2: Apply the two-pill-button header pattern**, but with Members-specific labels:
- Primary button: `Hire new` (NOT "Create new") → `router.push("/team/market")`
- Secondary button: `Add existing` → opens the existing `MemberPickerModal`

```tsx
<div className="flex items-center gap-2">
  <button
    onClick={() => router.push("/team/market")}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#7FAEE6] text-white text-xs font-semibold hover:bg-[#6A9DDA] active:scale-95 transition-all shadow-[0_2px_8px_rgba(127,174,230,0.25)]"
  >
    <Plus className="h-3.5 w-3.5" />
    Hire new
  </button>
  <button
    onClick={() => setShowPicker(true)}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFFDF9] text-[#7FAEE6] border border-[#7FAEE6]/40 text-xs font-semibold hover:bg-[#EAF3FD] active:scale-95 transition-all"
  >
    <Plus className="h-3.5 w-3.5" />
    Add existing
  </button>
</div>
```

**Step 3: Empty-state center CTA**:

```tsx
<button
  onClick={() => router.push("/team/market")}
  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] active:scale-[0.98] transition-all shadow-[0_4px_16px_rgba(127,174,230,0.35)]"
>
  <Plus className="h-4 w-4" />
  Hire your first employee
</button>
```

**Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/favorite-members.tsx
git commit -m "feat(dashboard): split Favorite Members add into Hire new + Add existing"
```

---

### Task 7: Add inline "Or create a new one" fallback to all three picker modals

**Files:**
- Modify: `apps/web/src/components/dashboard/goal-picker-modal.tsx`
- Modify: `apps/web/src/components/dashboard/workflow-picker-modal.tsx`
- Modify: `apps/web/src/components/dashboard/member-picker-modal.tsx`

**Why:** A user might still click "Add existing" when no items exist (e.g., a returning user who just deleted everything). Instead of a dead-end "No active goals found" message, give them an inline create link.

**Step 1: GoalPickerModal** — find the empty-list branch (around line 59-61):

```tsx
{filtered.length === 0 ? (
  <p className="text-sm text-[#9B948B] text-center py-8">No active goals found</p>
) : (
```

Replace with:

```tsx
{filtered.length === 0 ? (
  <div className="py-10 flex flex-col items-center gap-3">
    <p className="text-sm text-[#9B948B]">No goals yet — create one?</p>
    <button
      onClick={() => {
        onClose();
        router.push("/goals/create");
      }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA] transition-colors"
    >
      <Plus className="h-4 w-4" />
      Create a new goal
    </button>
  </div>
) : (
```

Add the imports at top of the file:

```tsx
import { useRouter } from "next/navigation";
import { X, Search, Check, Plus } from "lucide-react";
```

And inside the component:

```tsx
const router = useRouter();
```

**Step 2: WorkflowPickerModal** — same pattern, but the create route is `/workflows/edit/new` and the label is "Create a new workflow".

**Step 3: MemberPickerModal** — same pattern, but the action is `router.push("/team/market")` and the label is "Hire your first employee".

**Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: clean.

**Step 5: Commit**

```bash
git add apps/web/src/components/dashboard/goal-picker-modal.tsx apps/web/src/components/dashboard/workflow-picker-modal.tsx apps/web/src/components/dashboard/member-picker-modal.tsx
git commit -m "feat(dashboard): picker modals show Create-new fallback when empty"
```

---

### Task 8: Verification + push

**Step 1: Final typecheck + production build**

```bash
cd apps/web && npx tsc --noEmit
npx next build
```

Both must complete cleanly.

**Step 2: Smoke test in dev**

Start dev server (`cd apps/web && npm run dev`). Manually verify:

1. **Stage 1 banner** — log into a fresh account (or temporarily delete your goals via DB/UI). Dashboard at `/dashboard` shows the welcome banner with "Create your first goal" button. Stats cards still appear.
2. **Section header buttons** — each of Important Goals / Favorite Workflows / Favorite Members shows two pill buttons in the header. Clicking "Create new" routes to the create page; clicking "Add existing" opens the picker.
3. **Empty section center CTA** — when a section is empty, the center CTA is a prominent primary button labeled "Create new …" (or "Hire your first employee").
4. **Picker fallback** — open Important Goals "Add existing" with no goals; verify the "No goals yet — create one?" inline CTA appears.
5. **Stage progression** (if reachable) — create a goal → next refresh shows Stage 2 banner. Plan a week → Stage 3 banner. Create a todo → banner disappears.

**Step 3: Push**

```bash
git push origin HEAD:main
```

Vercel auto-deploys from main; verify the deploy lands clean.

---

## Out of scope / deferred

Per the design doc:
- No telemetry on stage transitions (revisit when there's traffic to measure).
- No "dismiss" affordance on the banner (following the CTA progresses the stage; users can't get stuck).
- No tier-aware default-content variation in stage logic (banner condition stays Goals/WeeklyPlans/ToDos regardless of plan).
