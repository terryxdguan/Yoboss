# Editable Roadmap Milestones — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each step is a self-contained action.

**Goal:** Convert phase milestones on `/goals/[id]` from a read-only outline to inline edit / delete / add / reorder, persisted via existing `phase_tasks` table.

**Architecture:** Three new server actions in `apps/web/src/lib/db/actions.ts` (create/update/delete), one rewritten UI component (`PhaseMilestoneList` at the bottom of `apps/web/src/app/(app)/goals/[id]/page.tsx`), four new optimistic handlers in the same page. No schema changes, no new dependencies.

**Tech Stack:** Next.js App Router, Supabase JS client (RLS-enforced), existing `EditableText` component, `lucide-react` icons.

**Verification model:** This codebase has no automated test runner (no vitest/jest/playwright in `apps/web/package.json`). Each task ends with `npx tsc --noEmit` from `apps/web/`. Final task is a manual browser smoke test via the dev server.

**Spec reference:** [docs/plans/2026-04-26-editable-roadmap-milestones-design.md](2026-04-26-editable-roadmap-milestones-design.md)

---

## Task 1: Add server actions for create / update / delete phase task

**Files:**
- Modify: `apps/web/src/lib/db/actions.ts` — append three exports immediately after `getPhaseTasksByGoalId` (currently ends around line 234, just before the `// Weekly Plans` section header)

- [ ] **Step 1.1: Add the three actions**

Open `apps/web/src/lib/db/actions.ts`. Find the existing `getPhaseTasksByGoalId` function (around line 215). Immediately after its closing `}` and before the `// ============================================================\n// Weekly Plans` header, insert:

```ts
// Append a new milestone to the end of a phase's milestone list. sort_order
// is computed as max(existing) + 1, or 0 if the phase is empty. Returns the
// full inserted row so the caller can append to local state with the real id.
export async function createPhaseTask(
  phaseId: string,
  title: string,
): Promise<import("@/lib/types/database").PhaseTask> {
  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("phase_tasks")
    .select("sort_order")
    .eq("phase_id", phaseId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("phase_tasks")
    .insert({ phase_id: phaseId, title, sort_order: nextSortOrder })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as import("@/lib/types/database").PhaseTask;
}

// Patch a milestone's title and/or sort_order. Other columns
// (priority, completed) are intentionally not exposed — the goal-detail UI
// doesn't surface them and we don't want callers to accidentally mutate them.
export async function updatePhaseTask(
  taskId: string,
  patch: { title?: string; sort_order?: number },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("phase_tasks")
    .update(patch)
    .eq("id", taskId);
  if (error) throw error;
}

export async function deletePhaseTask(taskId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("phase_tasks")
    .delete()
    .eq("id", taskId);
  if (error) throw error;
}
```

- [ ] **Step 1.2: Verify typecheck passes**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean exit (no new errors). Pre-existing errors elsewhere in the repo, if any, are unrelated — only fail if the diagnostics reference `actions.ts` or your new symbols.

---

## Task 2: Rewrite `PhaseMilestoneList` to be editable

**Files:**
- Modify: `apps/web/src/app/(app)/goals/[id]/page.tsx` — `function PhaseMilestoneList(...)` near the bottom of the file (currently around line 655)

This task only changes the component definition. Wiring (callsite + handlers in the parent page) is Task 3. After this task, the file will not typecheck — that's expected and resolved by Task 3.

- [ ] **Step 2.1: Replace the entire `PhaseMilestoneList` function**

Find the current definition (it begins with the comment `// Read-only outline of the phase's milestones …`). Replace from that comment block through the closing `}` of the function with:

```tsx
// Editable per-phase milestones. The Flag-icon outline doubles as the
// canonical sub-phase markers AND as user-editable refinement: hover any
// row to reveal ↑/↓/✕; double-click the title to rename via EditableText;
// the bottom "+ Add milestone" button toggles into an inline input row.
function PhaseMilestoneList({
  milestones,
  onUpdate,
  onDelete,
  onMove,
  onAdd,
}: {
  milestones: import("@/lib/types/database").PhaseTask[];
  onUpdate: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onAdd: (title: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus the input every time we flip into "adding" mode.
  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commitAdd = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onAdd(trimmed);
      setDraft("");
      // Stay in adding mode after a successful Enter so the user can
      // chain-add several milestones in a row.
    }
  };

  const cancelAdd = () => {
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
        Milestones ({milestones.length})
      </p>

      {milestones.length > 0 && (
        <div className="space-y-1">
          {milestones.map((m, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === milestones.length - 1;
            return (
              <div
                key={m.id}
                className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[#F8F5EF]"
              >
                <Flag className="mt-1 h-4 w-4 shrink-0 text-[#7FAEE6]" />
                <div className="min-w-0 flex-1">
                  <EditableText
                    value={m.title}
                    onSave={(next) => onUpdate(m.id, next)}
                    placeholder="Milestone title"
                    className="text-sm text-[#2B2B2B]"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onMove(m.id, "up")}
                    disabled={isFirst}
                    title="Move up"
                    className="rounded p-1 text-[#9B948B] hover:bg-[#E7DED2] hover:text-[#2B2B2B] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#9B948B]"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(m.id, "down")}
                    disabled={isLast}
                    title="Move down"
                    className="rounded p-1 text-[#9B948B] hover:bg-[#E7DED2] hover:text-[#2B2B2B] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#9B948B]"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(m.id)}
                    title="Delete"
                    className="rounded p-1 text-[#9B948B] hover:bg-[#E7DED2] hover:text-[#D5847A]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">
          <Flag className="mt-1 h-4 w-4 shrink-0 text-[#7FAEE6]" />
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitAdd();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelAdd();
              }
            }}
            onBlur={() => {
              if (draft.trim()) {
                commitAdd();
              }
              // Always collapse on blur. The input has already lost focus,
              // so leaving it open would feel orphaned.
              setAdding(false);
              setDraft("");
            }}
            placeholder="New milestone…"
            className="min-w-0 flex-1 rounded-md border border-[#7FAEE6] bg-[#FFFDF9] px-2 py-1 text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/30"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#9B948B] hover:bg-[#F8F5EF] hover:text-[#2B2B2B]"
        >
          <Plus className="h-4 w-4" />
          Add milestone
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2.2: Add the new icon imports**

In the existing `import { … } from "lucide-react"` block at the top of the file (around line 5–17, currently importing `ArrowLeft, CheckCircle2, Circle, Clock, Sparkles, Calendar, RefreshCw, MessageSquare, Paperclip, FileText, Flag`), add `ChevronUp, ChevronDown, X, Plus` to the same import list.

- [ ] **Step 2.3: Skip typecheck this task**

The component now references `EditableText`, `useState`, `useEffect`, `useRef` (the first three are already imported in this file; `useRef` is also already imported via the top-of-file `import { useEffect, useState, useCallback, useRef, useLayoutEffect } from "react";`). However the `<PhaseMilestoneList>` callsite still passes only `milestones={...}` from Task 0's old signature — typecheck will fail on the callsite mismatch. This is expected and gets resolved in Task 3.

---

## Task 3: Wire up parent page handlers + callsite

**Files:**
- Modify: `apps/web/src/app/(app)/goals/[id]/page.tsx` — handlers section (~line 146–150) and `<PhaseMilestoneList>` callsite (~line 474)

- [ ] **Step 3.1: Update the actions import**

Find the existing `import { updateGoal, updatePhase, getPhaseTasksByGoalId } from "@/lib/db/actions";` line (around line 20–24). Replace with:

```ts
import {
  updateGoal,
  updatePhase,
  getPhaseTasksByGoalId,
  createPhaseTask,
  updatePhaseTask,
  deletePhaseTask,
} from "@/lib/db/actions";
```

- [ ] **Step 3.2: Replace the old read-only comment with four handlers**

Find this block (around line 146–149):

```ts
  // Milestones are read-only on the UI — no add/toggle/delete handlers.
  // The AI generates them at goal creation; they exist purely as a
  // bird's-eye outline of the phase. Day-to-day check-offs happen in
  // the Weekly Schedule.
```

Replace it with:

```ts
  const handleUpdateMilestone = async (taskId: string, title: string) => {
    // Reject empty titles — keeps DB free of blank rows. EditableText already
    // no-ops on unchanged values, so this only fires when the user truly
    // saved an empty string.
    if (!title.trim()) return;
    setPhaseTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title } : t)),
    );
    try {
      await updatePhaseTask(taskId, { title });
    } catch (err) {
      console.error("Failed to update milestone:", err);
    }
  };

  const handleDeleteMilestone = async (taskId: string) => {
    setPhaseTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await deletePhaseTask(taskId);
    } catch (err) {
      console.error("Failed to delete milestone:", err);
    }
  };

  const handleMoveMilestone = async (
    taskId: string,
    direction: "up" | "down",
  ) => {
    // Find the row and its neighbor within the same phase, ordered by
    // sort_order. Bail if there's no neighbor (first row + up, last + down).
    const target = phaseTasks.find((t) => t.id === taskId);
    if (!target) return;
    const siblings = phaseTasks
      .filter((t) => t.phase_id === target.phase_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((t) => t.id === taskId);
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= siblings.length) return;
    const neighbor = siblings[neighborIdx];

    const targetSort = target.sort_order;
    const neighborSort = neighbor.sort_order;

    setPhaseTasks((prev) =>
      prev.map((t) => {
        if (t.id === target.id) return { ...t, sort_order: neighborSort };
        if (t.id === neighbor.id) return { ...t, sort_order: targetSort };
        return t;
      }),
    );

    try {
      await Promise.all([
        updatePhaseTask(target.id, { sort_order: neighborSort }),
        updatePhaseTask(neighbor.id, { sort_order: targetSort }),
      ]);
    } catch (err) {
      console.error("Failed to reorder milestones:", err);
    }
  };

  const handleAddMilestone = async (phaseId: string, title: string) => {
    try {
      const created = await createPhaseTask(phaseId, title);
      setPhaseTasks((prev) => [...prev, created]);
    } catch (err) {
      console.error("Failed to create milestone:", err);
    }
  };
```

- [ ] **Step 3.3: Replace the `<PhaseMilestoneList>` callsite**

Find the existing JSX (around line 474–479):

```tsx
                <PhaseMilestoneList
                  milestones={phaseTasks
                    .filter((t) => t.phase_id === selectedPhase.id)
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((t) => t.title)}
                />
```

Replace with:

```tsx
                <PhaseMilestoneList
                  milestones={phaseTasks
                    .filter((t) => t.phase_id === selectedPhase.id)
                    .sort((a, b) => a.sort_order - b.sort_order)}
                  onUpdate={handleUpdateMilestone}
                  onDelete={handleDeleteMilestone}
                  onMove={handleMoveMilestone}
                  onAdd={(title) => handleAddMilestone(selectedPhase.id, title)}
                />
```

- [ ] **Step 3.4: Verify typecheck passes**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean exit. If errors reference `page.tsx`, `PhaseMilestoneList`, `phaseTasks`, or any of the new handlers/imports, fix them before proceeding.

---

## Task 4: Manual browser smoke test

No code changes — this task is a structured walkthrough using the dev server.

- [ ] **Step 4.1: Start the dev server (if not already running)**

Use the `preview_start` tool from `Claude_Preview` MCP, pointing at `cd apps/web && npm run dev` on port 3000. Per CLAUDE.md, local testing may bypass auth gates if needed — sign in to a test account that already has a goal with phases.

- [ ] **Step 4.2: Navigate to a goal detail page**

`preview_eval` → `window.location.href = "http://localhost:3000/goals/<some-existing-goal-id>"` — pick any goal with at least 2 phases, ideally one phase already has 2+ milestones. Use `preview_snapshot` to confirm the Roadmap section is visible.

- [ ] **Step 4.3: Verify each interaction**

Walk through each in turn, taking a `preview_snapshot` after each to confirm:

1. **Hover a milestone row** → ↑ / ↓ / ✕ buttons appear on the right.
2. **Double-click a milestone title** → input appears, type new text, press Enter → row updates with new title.
3. **Click ✕ on a milestone** → row disappears immediately. Refresh the page (`preview_eval` → `window.location.reload()`) → confirm the deletion stuck.
4. **Click ↑ on a non-first milestone** → row swaps with the one above. Refresh → confirm new order persisted.
5. **Click ↓ on a non-last milestone** → row swaps with the one below. Refresh → confirm.
6. **Confirm ↑ on first row, ↓ on last row** → buttons render but appear faded; clicking does nothing visible.
7. **Click "+ Add milestone"** → button morphs into input. Type "Test milestone" + Enter → new row appears at the bottom; input remains open with empty text.
8. **Add a second milestone** the same way.
9. **Press Esc on the input** → input collapses back to the button.
10. **Click "+ Add milestone"** again, leave input empty, click outside → input collapses without creating a row.
11. **Refresh the page** → confirm the two added milestones persisted in correct order.
12. **Pick a phase that has zero milestones** (or delete all in one phase) → confirm only the "+ Add milestone" button shows, no "No milestones outlined" message.

- [ ] **Step 4.4: Check console for errors**

`preview_console_logs` — look for any red errors. Acceptable: pre-existing warnings unrelated to milestones. Not acceptable: any `Failed to (update|delete|create|reorder) milestone:` lines or React error boundaries.

---

## Task 5: Commit

- [ ] **Step 5.1: Stage and commit only the milestone-related files**

The repo has other unrelated modified files (per `git status` at plan-write time). Stage only what this feature touched:

```bash
git add apps/web/src/lib/db/actions.ts \
        apps/web/src/app/\(app\)/goals/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(roadmap): editable phase milestones (add/edit/delete/reorder)

Milestones on the goal detail page are now inline-editable: double-click to
rename, hover for ↑/↓/✕, "+ Add milestone" inline input at the bottom.
Reuses existing phase_tasks table; no schema changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.2: Confirm clean state for milestone files**

Run: `git status apps/web/src/lib/db/actions.ts apps/web/src/app/\(app\)/goals/\[id\]/page.tsx`
Expected: nothing staged or modified for these two paths. (Other unrelated modifications stay untouched per CLAUDE.md no-auto-push policy.)

- [ ] **Step 5.3: Do NOT push**

Per project CLAUDE.md: "NEVER `git push` without explicit user instruction." Stop here. Hand the test points back to the user for verification on their dev server.

---

## Self-review

Before handing off:

**Spec coverage check:**
- Edit ✓ (Step 2.1 wraps title in EditableText; Step 3.2 `handleUpdateMilestone` persists)
- Delete ✓ (Step 2.1 ✕ button + Step 3.2 `handleDeleteMilestone`)
- Add ✓ (Step 2.1 inline input + Step 3.2 `handleAddMilestone`)
- Reorder via ↑/↓ ✓ (Step 2.1 buttons + Step 3.2 `handleMoveMilestone` with neighbor swap)
- First-row ↑ / last-row ↓ disabled ✓ (Step 2.1 `disabled` + opacity styling)
- No delete confirmation ✓ (Step 2.1 onClick fires `onDelete` directly)
- Empty state shows only "+ Add" button ✓ (Step 2.1 — the `milestones.length > 0 &&` guard skips the list, and the add affordance always renders)
- Empty title rejected on edit ✓ (Step 3.2 `if (!title.trim()) return;`)
- Empty add silently discarded ✓ (Step 2.1 `commitAdd` early-returns on empty)
- No schema changes ✓
- No new dependencies ✓
- `RoadmapPreview` untouched ✓
