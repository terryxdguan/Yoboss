# Dashboard Onboarding + Split Add Buttons — Design

**Date:** 2026-04-23
**Author:** brainstormed with user, written by Claude

## Problem

The Dashboard is a "content aggregator" surface — it looks great for users who already have Goals, To-Dos, and Workflows, but for new users it's empty and confusing. The three "favorites" sections (Important Goals / Favorite Workflows / Favorite Members) have a `+` button that opens a picker modal listing existing items the user can select. For a first-time user with zero goals, that picker shows "No active goals found" — a dead end. The user has no signal for "what should I do next."

## Goals

1. **Guide new users to create their first Goal → Weekly Schedule → To-Do**, using the Dashboard as the directive surface (no separate onboarding wizard route).
2. **Fix the "Add" button ambiguity** so users can both *create* brand-new content and *add existing* content to favorites as two distinct, clearly labeled actions.

## Non-goals

- Per-user onboarding flags / database columns. The guidance is computed from live content state each render.
- Hiring-workflow onboarding. Employees are out of the onboarding arc — a new user has 4 default employees hired automatically, which is enough context.
- Product tour / tooltips overlay. Out of scope for this iteration.

## Design decisions (all user-confirmed)

1. **Trigger is permanent**, based on live content state. Not gated on a "first login" flag; empty state = show guidance, whether new user or old user who cleared everything.
2. **Three-stage progressive onboarding** via a single hero banner at the top of the Dashboard:
   - **Stage 1** — `goals.length === 0` → "Create your first goal"
   - **Stage 2** — `goals.length ≥ 1 && weeklyPlans.length === 0` → "Plan your first week"
   - **Stage 3** — `goals.length ≥ 1 && weeklyPlans.length ≥ 1 && todos.length === 0` → "Create your first to-do"
   - **Done** — all three have content → banner not rendered
3. **Stats cards always visible**, regardless of onboarding stage. Default state already shows non-zero values for Workflows (3 default templates) and Employees (4 default hired), so the cards don't feel empty.
4. **Each favorites section header shows two pill buttons** instead of a single `+`:
   - `+ Create new` (primary, filled blue) — direct route to creation flow
   - `+ Add existing` (secondary, outlined) — opens the current picker modal
   - **Members exception:** `+ Hire new` instead of `+ Create new` — semantically you hire employees from the market, you don't create them. Matches the user-as-boss framing.
5. **Empty-section center CTA collapses to a single prominent "Create new"** (or "Hire new" for Members). When the section is fully empty, "Add existing" is pointless — so the center CTA is the one natural "start here" action. Header buttons stay as the split pair.
6. **Picker-with-nothing fallback** — if a user does open an "Add existing" picker when there's literally nothing to pick, the picker shows an inline "Or create a new one" link routing to the creation flow, so they're never stranded.

## Onboarding state machine

```
compute_stage(dashboard_data):
  if goals == 0:        return "stage1"
  if weekly_plans == 0: return "stage2"
  if todos == 0:        return "stage3"
  return "done"
```

### Banner copy and CTAs per stage

| Stage | Title | Subtitle | CTA label | CTA target |
|-------|-------|----------|-----------|------------|
| 1 | Welcome to YoBoss | Let's set up your first goal — describe what you want to achieve and your team takes it from there. | Create your first goal | `/goals/create` |
| 2 | One goal set. Let's plan this week. | Turn your goal into a concrete weekly schedule your team can execute alongside you. | Plan your first week | *smart: 1 goal → `/goals/{id}/plan-week` ; 2+ goals → `/goals` list page* |
| 3 | Your week is planned. | Keep momentum with a quick to-do for today — the little things that fall outside weekly plans. | Create your first to-do | opens existing Add To-Do modal in place on Dashboard |
| Done | (banner not rendered) | | | |

### Stage 2 "smart" CTA logic

Stage 2 fires when user has 1+ goals but 0 weekly plans. Usually this is "just created my first goal, haven't planned yet" → latest goal's plan-week. But a user could have 5 goals all unplanned, in which case we shouldn't guess.

```ts
if (goals.length === 1) goto `/goals/${goals[0].id}/plan-week`
else                    goto `/goals`
```

## Visual layout

```
┌──────────────────────────────────────────────────────┐
│  Dashboard                                           │
│  Overview of today's progress, tasks, and team       │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │ 🎯 Stage N title                                │  │ ← Welcome Banner
│  │ Subtitle sentence                     [CTA]    │  │   (only Stage 1/2/3)
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  [Goals 0]  [To-Dos 0]  [Workflows 3]  [Employees 4] │ ← Stats (always)
│                                                      │
│  To-Do List section (…)                              │
│  Important Goals section (…)                         │
│  Favorite Workflows section (…)                      │
│  Favorite Members section (…)                        │
└──────────────────────────────────────────────────────┘
```

Banner visual treatment:
- Background: `#EAF3FD` (brand soft-blue tint)
- Border: 1px `#7FAEE6` at 30% opacity, rounded-2xl
- ~100-120px min-height; left-aligned title+subtitle, right-aligned primary CTA button
- Done state: the entire `<WelcomeBanner>` component returns `null`; no empty div / no margin leak

## Section header pattern (Important Goals / Favorite Workflows / Favorite Members)

Current:
```
[Title + subtitle]                                          [+]
```

New:
```
[Title + subtitle]                     [+ Create new] [+ Add existing]
```

Members variant:
```
[Title + subtitle]                     [+ Hire new] [+ Add existing]
```

Button styles:
- `Create new` / `Hire new`: filled `bg-[#7FAEE6] text-white` pill, `px-3 py-1.5 text-xs font-semibold`
- `Add existing`: outlined `bg-[#FFFDF9] text-[#7FAEE6] border border-[#7FAEE6]/40` pill, same size
- Both include a `Plus` icon from lucide-react

CTA routing:
| Section | Create new → | Add existing → |
|---------|--------------|----------------|
| Important Goals | `/goals/create` | existing `GoalPickerModal` |
| Favorite Workflows | workflow-new route (existing) | existing `WorkflowPickerModal` |
| Favorite Members | `/team/market` (the Hire Employees page) | existing `MemberPickerModal` |

## Section empty-state pattern

When the items list for a favorites section is empty, the card center currently renders:
```
  [illustration]
  [empty-state text]
  [ + Add Goal ]   ← current single button
```

New pattern — the center button is **only the creation action**, made slightly more prominent (larger, still primary filled):
```
  [illustration]
  [empty-state text]
  [ + Create new goal ]   ← larger/primary; only one button here
```

For Members: `[ + Hire your first employee ]`.

The split header buttons are still visible at the top of the card, so "Add existing" is reachable — just not duplicated in the empty-state body.

## Picker fallback when nothing exists

If "Add existing" is clicked and the picker has zero matching items (legitimate empty state for new users), the picker modal shows:

```
   ┌──────────────────────────────────────────┐
   │ Select Important Goals              [×]  │
   │ ─────────────────                        │
   │  No goals yet — create one?              │
   │                                          │
   │       [+ Create a new goal]              │
   └──────────────────────────────────────────┘
```

Single inline CTA routing to the creation page. This replaces the current "No active goals found" dead-end text.

## Implementation surface

| File | Change |
|------|--------|
| `apps/web/src/app/(app)/dashboard/page.tsx` | Server-compute `onboardingStage` from dashboard data, pass to new component |
| `apps/web/src/lib/db/actions.ts` | Extend `getDashboardData` return shape: include a `weeklyPlansCount` field so stage logic is self-contained (pure read, no new table access) |
| `apps/web/src/components/dashboard/welcome-banner.tsx` (**new**) | Receives stage + goals list + onClickAddTodo callback; renders banner or null |
| `apps/web/src/components/dashboard/dashboard-shell.tsx` | Expose an "open Add To-Do modal" handler via context so banner can trigger it for Stage 3 |
| `apps/web/src/components/dashboard/important-goals.tsx` | Header → two pill buttons; empty-state center → single prominent `+ Create new goal` (routes to `/goals/create`) |
| `apps/web/src/components/dashboard/favorite-workflows.tsx` | Same pattern; routes to workflows-new |
| `apps/web/src/components/dashboard/favorite-members.tsx` | Same pattern with Hire new/Add existing labels; routes to `/team/market` |
| `apps/web/src/components/dashboard/goal-picker-modal.tsx` | Add inline "Or create a new one" link when the filtered list is empty |
| `apps/web/src/components/dashboard/workflow-picker-modal.tsx` | Same inline fallback |
| `apps/web/src/components/dashboard/member-picker-modal.tsx` | Same inline fallback (links to `/team/market`) |

No SQL migration required. All dashboard state is already derivable from the existing `goals`, `weekly_plans`, `todos` tables.

## Testing / verification

No automated tests in this codebase; verification is:
1. `npx tsc --noEmit` clean
2. `next build` clean
3. Manual smoke: a freshly-signed-up account (no goals/todos/weekly plans) lands on Dashboard and sees Stage 1 banner with `Create your first goal` button
4. Manual smoke: create a goal → banner shifts to Stage 2; plan a week → Stage 3; create a todo → banner disappears
5. Manual smoke: click each section's `+ Create new` and `+ Add existing` buttons separately; verify they route correctly
6. Manual smoke: with 0 goals, open Important Goals' "Add existing" picker and confirm the "Or create a new one" inline fallback appears

## Out of scope / deferred

- Analytics/telemetry on which stage users get stuck at (future iteration once there's enough traffic to measure)
- Dismissable banners (users can't "close" the guidance — but they also can't get stuck, because following the CTA progresses them to the next stage or resolves all three)
- Default Workflow / Employee content counts changing with plan tier (not expected to change; if it does, banner logic stays the same because we only gate on Goals/WeeklyPlans/ToDos)
