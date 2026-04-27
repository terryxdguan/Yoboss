# Editable Roadmap Milestones — Design

**Date**: 2026-04-26
**Status**: Approved, ready for implementation plan
**Owner**: @xudongguan

## Problem

On the goal detail page (`/goals/[id]`), the Roadmap section shows each phase's milestones as a read-only outline (Flag icon + title). Once the AI generates them at goal creation time, the user cannot edit, delete, or add milestones — only re-generate the entire plan via the wizard.

Users want to refine the AI-generated outline themselves: rename a milestone, drop one that doesn't apply, add a missing one, or reorder. Today the only escape hatch is destroying the plan and starting over.

## Constraints & context

- **Persistence layer is already in place**. `phase_tasks` (legacy table name; semantic is "milestone") has `id`, `phase_id`, `title`, `sort_order`, RLS policy `"Users can CRUD own phase tasks"` covering all of CRUD via the `goals → phases → phase_tasks` ownership join. No schema or RLS changes needed.
- **No unique constraint on `(phase_id, sort_order)`** — only an index. Reorder via swapping two `sort_order` values is safe.
- **Existing inline-edit pattern**: `EditableText` component (double-click → input → Enter saves / Esc cancels) is already used for goal title, phase title, phase description. Match that pattern for milestone titles instead of inventing a new affordance.
- **Existing handler style**: `handleSavePhaseField` and `handleSaveGoalField` do optimistic local state update first, then persist; on error just `console.error` and let next page load re-sync. New handlers will follow the same style.
- **The current `PhaseMilestoneList` comment says "all action lives in the Weekly Schedule"**. That guidance is now outdated and will be removed.
- **`RoadmapPreview` (the pre-confirmation modal) is out of scope.** This design is about the live goal detail page; the preview stays as-is.

## High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│ apps/web/src/app/(app)/goals/[id]/page.tsx                  │
│                                                             │
│   phaseTasks state (PhaseTask[])                            │
│   ↓                                                         │
│   handleUpdate / handleDelete / handleMove / handleAdd      │
│   (optimistic local update → server action)                 │
│   ↓                                                         │
│   <PhaseMilestoneList milestones onUpdate onDelete          │
│                       onMove onAdd>                         │
│     - existing rows: EditableText title + ↑/↓/✕ on hover    │
│     - bottom: "+ Add milestone" → inline input row          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ apps/web/src/lib/db/actions.ts (server actions)             │
│                                                             │
│   createPhaseTask(phaseId, title) → PhaseTask               │
│   updatePhaseTask(taskId, { title?, sort_order? })          │
│   deletePhaseTask(taskId)                                   │
└──────────────────────────────┬──────────────────────────────┘
                               │  (RLS-enforced supabase client)
                               ▼
                        public.phase_tasks
```

## Server actions

In `apps/web/src/lib/db/actions.ts`, immediately after the existing `getPhaseTasksByGoalId`:

### `createPhaseTask(phaseId: string, title: string): Promise<PhaseTask>`

1. `SELECT max(sort_order) FROM phase_tasks WHERE phase_id = $1`. Use `?? -1` so the first row in an empty phase becomes `sort_order = 0`.
2. `INSERT … RETURNING *`. Returned row goes back to the caller so the client can append to local state with the real `id`.

Race window between SELECT and INSERT is acceptable — single-user, low-frequency UI action.

### `updatePhaseTask(taskId: string, patch: { title?: string; sort_order?: number }): Promise<void>`

Generic patch. `title` covers inline edit; `sort_order` covers ↑/↓ reorder. Other columns (`priority`, `completed`, `completed_at`) are not exposed in this UI and not allowed in `patch`.

### `deletePhaseTask(taskId: string): Promise<void>`

Plain `DELETE … WHERE id = $1`. RLS enforces ownership.

### Reorder strategy

No dedicated `swap` function. The UI sends two parallel `updatePhaseTask` calls (target row gets neighbor's old `sort_order`, neighbor gets target's old `sort_order`). The lack of a unique constraint on `(phase_id, sort_order)` means a transient duplicate during the swap is fine.

## UI: `PhaseMilestoneList` rewrite

Same file (`page.tsx`, bottom of the file). Signature changes from:

```tsx
function PhaseMilestoneList({ milestones }: { milestones: string[] })
```

to:

```tsx
function PhaseMilestoneList({
  milestones,           // PhaseTask[], pre-sorted by sort_order
  onUpdate,             // (id, title) => void
  onDelete,             // (id) => void
  onMove,               // (id, "up" | "down") => void
  onAdd,                // (title) => void
}: ...)
```

### Per-row layout

```
[Flag]  [EditableText title]                      [↑] [↓] [✕]
                                                  └ visible on row hover ┘
```

- Title uses the existing `EditableText` (double-click to edit).
- ↑ disabled on first row, ↓ disabled on last row — `opacity-30 cursor-not-allowed pointer-events-none` (don't hide; preserve layout stability).
- ✕ deletes immediately, no confirmation. Matches the rest of the app: `updateGoal`, `updatePhase`, etc. are also fire-and-forget.
- Action buttons appear via `group-hover:opacity-100` on the row's `group` wrapper.

### Add affordance

- Default state: a button at the bottom of the list, `+ Add milestone`, muted color.
- Click: button replaced by an inline row visually matching existing milestones (Flag icon + input).
- Enter (non-empty) or blur (non-empty): commit via `onAdd(trimmed)`, clear input, **keep input open** on Enter so adding 5 milestones in a row is one click + 5 Enters; blur naturally collapses (next interaction outside the row).
- Esc, or blur with empty input: discard, collapse back to button form.

### Empty state

When the phase has zero milestones, do not render the existing "No milestones outlined for this phase." card. Just show the `+ Add milestone` button — the button itself is the empty-state CTA.

## Page handlers

In `app/(app)/goals/[id]/page.tsx`, replace the comment block "Milestones are read-only on the UI…" with four handlers, all matching the existing optimistic-then-persist style:

```ts
handleUpdateMilestone(taskId, title)
  // Reject empty title silently (no DB write, keep old value).
  if (!title.trim()) return;
  // Optimistic local replace, then updatePhaseTask({ title }).

handleDeleteMilestone(taskId)
  // Optimistic local filter, then deletePhaseTask.

handleMoveMilestone(taskId, "up" | "down")
  // Look up the row and its neighbor in the phase, in current sort order.
  // No-op if first+up or last+down (button is disabled too).
  // Swap sort_order in local state, fire two updatePhaseTask in parallel.

handleAddMilestone(phaseId, title)
  // No optimistic placeholder. Await createPhaseTask, then append the
  // returned row to local state. Single round-trip is fast enough that
  // a temp-id placeholder isn't worth the rollback / id-collision logic.
```

All four log on error (`console.error`) and otherwise let next page load re-sync — same as the rest of the page.

The `<PhaseMilestoneList>` callsite at ~line 474 passes the pre-sorted `PhaseTask[]` and all four handlers (the `onAdd` closure captures `selectedPhase.id`).

## Out of scope

- Drag-and-drop reorder (rejected in favor of ↑/↓ buttons; no new dependency).
- Reorder rebalancing (no global re-numbering — swap-based reorder is sufficient).
- Editing other `phase_tasks` columns (`priority`, `completed`).
- Changes to `RoadmapPreview` (the AI confirmation modal).
- Schema or RLS changes.
- Multi-select / bulk operations.
- Undo for delete.
