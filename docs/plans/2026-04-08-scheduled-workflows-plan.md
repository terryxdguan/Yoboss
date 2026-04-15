# Scheduled Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to schedule workflows to run automatically on a daily or weekly basis, with in-app notifications for completed runs.

**Architecture:** Vercel Cron (every minute) triggers a scheduler API route that queries due workflows and executes them server-side via a new `/api/workflows/execute` route. Results are stored as normal `workflow_run` records. Users configure schedules from workflow cards and receive notifications via an in-app bell icon.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + RLS), Anthropic Claude API, Vercel Cron, cron-parser (npm package for next-run computation)

---

### Task 1: Database Migration — Schedule Fields + Notifications Table

**Files:**
- Create: `supabase/migrations/011_scheduled_workflows.sql`

**Step 1: Write the migration**

```sql
-- Add schedule fields to workflows
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_cron text,
  ADD COLUMN IF NOT EXISTS schedule_timezone text,
  ADD COLUMN IF NOT EXISTS schedule_next_run_at timestamptz;

-- Add timezone to user profiles (create table if not exists)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.user_profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  metadata jsonb DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, read) WHERE read = false;

-- Add triggered_by to workflow_runs to distinguish manual vs scheduled
ALTER TABLE public.workflow_runs
  ADD COLUMN IF NOT EXISTS triggered_by text NOT NULL DEFAULT 'manual';
```

**Step 2: Run the migration**

Run: `supabase db query --linked < supabase/migrations/011_scheduled_workflows.sql`
Expected: SQL executes without errors.

**Step 3: Commit**

```bash
git add supabase/migrations/011_scheduled_workflows.sql
git commit -m "feat: add schedule fields, notifications table, user_profiles table"
```

---

### Task 2: TypeScript Types Update

**Files:**
- Modify: `apps/web/src/lib/types/workflow.ts`
- Create: `apps/web/src/lib/types/notification.ts`

**Step 1: Update Workflow type**

In `apps/web/src/lib/types/workflow.ts`, add schedule fields to the `Workflow` interface:

```typescript
export interface Workflow {
  // ... existing fields (id through updated_at) ...
  schedule_enabled: boolean;
  schedule_cron: string | null;
  schedule_timezone: string | null;
  schedule_next_run_at: string | null;
}
```

Also update `WorkflowRun` to include `triggered_by`:

```typescript
export interface WorkflowRun {
  // ... existing fields ...
  triggered_by: "manual" | "scheduled";
}
```

**Step 2: Create Notification type**

Create `apps/web/src/lib/types/notification.ts`:

```typescript
export interface Notification {
  id: string;
  user_id: string;
  type: "scheduled_run_complete" | "scheduled_run_failed";
  title: string;
  metadata: {
    workflowId: string;
    runId: string;
    status: string;
  };
  read: boolean;
  created_at: string;
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/types/workflow.ts apps/web/src/lib/types/notification.ts
git commit -m "feat: add schedule fields to Workflow type, create Notification type"
```

---

### Task 3: DB Actions — Schedule + Notifications

**Files:**
- Modify: `apps/web/src/lib/db/actions.ts`

**Step 1: Update `updateWorkflow` to accept schedule fields**

In `apps/web/src/lib/db/actions.ts`, update the `updateWorkflow` function's patch type to include:

```typescript
export async function updateWorkflow(
  id: string,
  patch: Partial<Pick<Workflow,
    "name" | "description" | "steps" | "status" | "last_run_at" | "last_run_status" | "is_template"
    | "schedule_enabled" | "schedule_cron" | "schedule_timezone" | "schedule_next_run_at"
  >>
): Promise<void> {
  // ... existing implementation unchanged ...
}
```

**Step 2: Add notification DB functions**

Append to `apps/web/src/lib/db/actions.ts`:

```typescript
// --- Notifications ---

export async function getUnreadNotifications(): Promise<Notification[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("read", false);
  if (error) throw error;
}
```

**Step 3: Add user profile DB functions**

```typescript
// --- User Profile ---

export async function getUserTimezone(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "UTC";
  const { data } = await supabase
    .from("user_profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  return data?.timezone || "UTC";
}

export async function upsertUserTimezone(timezone: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ id: user.id, timezone, updated_at: new Date().toISOString() });
  if (error) throw error;
}
```

**Step 4: Add the `Notification` import**

At the top of `actions.ts`, import the Notification type.

**Step 5: Commit**

```bash
git add apps/web/src/lib/db/actions.ts
git commit -m "feat: add schedule, notification, and user profile DB actions"
```

---

### Task 4: Install cron-parser + Schedule Utility

**Files:**
- Create: `apps/web/src/lib/utils/schedule.ts`

**Step 1: Install cron-parser**

Run: `cd apps/web && npm install cron-parser`

**Step 2: Create schedule utility**

Create `apps/web/src/lib/utils/schedule.ts`:

```typescript
import cronParser from "cron-parser";

/**
 * Compute the next run time for a cron expression in a given timezone.
 * Returns a UTC ISO string.
 */
export function getNextRunAt(cronExpression: string, timezone: string): string {
  const interval = cronParser.parseExpression(cronExpression, {
    currentDate: new Date(),
    tz: timezone,
  });
  return interval.next().toISOString();
}

/**
 * Build a cron expression from UI selections.
 * frequency: "daily" | "weekly"
 * hour: 0-23, minute: 0-59
 * days: array of 0-6 (0=Sunday) — only used for weekly
 */
export function buildCronExpression(
  frequency: "daily" | "weekly",
  hour: number,
  minute: number,
  days?: number[]
): string {
  if (frequency === "daily") {
    return `${minute} ${hour} * * *`;
  }
  // weekly: days is required
  const dayStr = (days || []).sort().join(",");
  return `${minute} ${hour} * * ${dayStr}`;
}

/**
 * Format a cron expression as a human-readable label.
 * e.g. "Daily at 08:00" or "Mon, Wed, Fri at 09:00"
 */
export function formatScheduleLabel(cronExpression: string): string {
  const parts = cronExpression.split(" ");
  if (parts.length !== 5) return cronExpression;
  const [minute, hour, , , dayOfWeek] = parts;
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

  if (dayOfWeek === "*") {
    return `Daily at ${time}`;
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = dayOfWeek
    .split(",")
    .map((d) => dayNames[parseInt(d)] || d)
    .join(", ");
  return `${days} at ${time}`;
}
```

**Step 3: Commit**

```bash
git add apps/web/src/lib/utils/schedule.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add cron-parser and schedule utility functions"
```

---

### Task 5: Server-Side Workflow Execution API

**Files:**
- Create: `apps/web/src/app/api/workflows/execute/route.ts`

**Step 1: Create the server-side execution route**

This route runs a full workflow without a browser. It reads the SSE stream from agent-chat internally.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getAnthropicClient, MODELS } from "@/lib/ai/client";
import { readFile } from "fs/promises";
import { join } from "path";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type Anthropic from "@anthropic-ai/sdk";
import type { WorkflowStepResult, GeneratedFile } from "@/lib/types/workflow";

const SERVER_TOOLS: Anthropic.Messages.ToolUnion[] = [
  { type: "web_search_20260209" as const, name: "web_search" as const },
  { type: "web_fetch_20260209" as const, name: "web_fetch" as const },
  { type: "code_execution_20260120" as const, name: "code_execution" as const },
];

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];

async function loadPromptFile(promptFile: string): Promise<string> {
  const filePath = join(process.cwd(), "src", "lib", "ai", "agent-prompts", promptFile);
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "You are a helpful AI assistant.";
  }
}

export async function POST(request: NextRequest) {
  // Auth: either CRON_SECRET for scheduled, or check for a valid header
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workflowId, userId, triggeredBy } = (await request.json()) as {
    workflowId: string;
    userId: string;
    triggeredBy: "scheduled" | "manual";
  };

  const supabase = createAdminClient();

  // Load workflow
  const { data: workflow, error: wfErr } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .single();
  if (wfErr || !workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const steps = workflow.steps as { id: string; agentId: string; prompt: string }[];
  const stepResults: WorkflowStepResult[] = steps.map((s) => ({
    stepId: s.id,
    status: "pending" as const,
  }));

  // Create workflow run
  const { data: run, error: runErr } = await supabase
    .from("workflow_runs")
    .insert({
      workflow_id: workflowId,
      user_id: userId,
      status: "running",
      current_step: 0,
      total_steps: steps.length,
      step_results: stepResults,
      triggered_by: triggeredBy,
    })
    .select()
    .single();
  if (runErr || !run) {
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }

  const runId = run.id;
  const previousOutputs: string[] = [];

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const agent = allAgents.find((a) => a.id === step.agentId);
      const promptFile = agent?.promptFile || "general_assistant.txt";
      const startTime = Date.now();

      // Update status to running
      stepResults[i].status = "running";
      await supabase
        .from("workflow_runs")
        .update({ current_step: i, step_results: stepResults })
        .eq("id", runId);

      // Build messages
      let enrichedPrompt = step.prompt;
      if (previousOutputs.length > 0) {
        enrichedPrompt += "\n\n--- PREVIOUS STEP OUTPUTS ---\n";
        previousOutputs.forEach((out, idx) => {
          enrichedPrompt += `\nStep ${idx + 1} output:\n${out}\n`;
        });
      }

      const basePrompt = await loadPromptFile(promptFile);
      const yobossPrefix = `IMPORTANT: Always address the user as "Hi Boss" at the start of each conversation. Be respectful and professional.\n\nFILE GENERATION: When generating ANY file using code execution, you MUST copy the output file to $OUTPUT_DIR. Example: cp /tmp/myfile.html $OUTPUT_DIR/myfile.html.\n\n`;
      const systemPrompt = yobossPrefix + basePrompt;

      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: enrichedPrompt },
      ];

      // Call Anthropic API directly (non-streaming, with continuations)
      const client = getAnthropicClient();
      let currentMessages = [...messages];
      let fullText = "";
      const files: GeneratedFile[] = [];
      let continuations = 0;

      while (continuations < 5) {
        const response = await client.messages.create({
          model: MODELS.sonnet,
          max_tokens: 16000,
          system: systemPrompt,
          tools: SERVER_TOOLS,
          messages: currentMessages,
        });

        // Extract text and files from response
        for (const block of response.content) {
          if (block.type === "text") {
            fullText += block.text;
          }
          // Check for server tool results with files
          if ("content" in block && Array.isArray((block as any).content)) {
            for (const item of (block as any).content) {
              if (item.file_id) {
                files.push({ fileId: item.file_id, filename: item.filename || "download" });
              }
            }
          }
        }

        if (response.stop_reason === "pause_turn") {
          currentMessages = [
            ...currentMessages,
            { role: "assistant" as const, content: response.content },
          ];
          continuations++;
          continue;
        }
        break;
      }

      const durationMs = Date.now() - startTime;
      stepResults[i] = {
        stepId: step.id,
        status: "success",
        output: fullText,
        durationMs,
        files: files.length > 0 ? files : undefined,
      };
      previousOutputs.push(fullText);

      // Save progress after each step
      await supabase
        .from("workflow_runs")
        .update({ step_results: stepResults })
        .eq("id", runId);
    }

    // All steps done — mark success
    await supabase
      .from("workflow_runs")
      .update({
        status: "success",
        step_results: stepResults,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    // Update workflow last_run
    await supabase
      .from("workflows")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
        status: "ready",
      })
      .eq("id", workflowId);

    // Create notification
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "scheduled_run_complete",
      title: `${workflow.name} completed`,
      metadata: { workflowId, runId, status: "success" },
    });

    return NextResponse.json({ runId, status: "success" });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    // Mark current step as failed
    const failedIdx = stepResults.findIndex((s) => s.status === "running");
    if (failedIdx >= 0) {
      stepResults[failedIdx] = {
        ...stepResults[failedIdx],
        status: "failed",
        error: errorMsg,
      };
    }

    await supabase
      .from("workflow_runs")
      .update({
        status: "failed",
        step_results: stepResults,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await supabase
      .from("workflows")
      .update({ last_run_status: "failed", status: "ready" })
      .eq("id", workflowId);

    // Create failure notification
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "scheduled_run_failed",
      title: `${workflow.name} failed`,
      metadata: { workflowId, runId, status: "failed" },
    });

    return NextResponse.json({ runId, status: "failed", error: errorMsg });
  }
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/api/workflows/execute/route.ts
git commit -m "feat: add server-side workflow execution API route"
```

---

### Task 6: Cron Scheduler Route

**Files:**
- Create: `apps/web/src/app/api/cron/run-scheduled/route.ts`
- Create: `vercel.json` (project root)

**Step 1: Create cron route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { getNextRunAt } from "@/lib/utils/schedule";

export const maxDuration = 300; // 5 min (Vercel Pro)

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Find due workflows
  const { data: dueWorkflows, error } = await supabase
    .from("workflows")
    .select("id, user_id, name, schedule_cron, schedule_timezone")
    .eq("schedule_enabled", true)
    .lte("schedule_next_run_at", now);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!dueWorkflows || dueWorkflows.length === 0) {
    return NextResponse.json({ triggered: 0 });
  }

  const results = [];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const wf of dueWorkflows) {
    try {
      // Trigger execution
      const res = await fetch(`${appUrl}/api/workflows/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({
          workflowId: wf.id,
          userId: wf.user_id,
          triggeredBy: "scheduled",
        }),
      });

      const result = await res.json();
      results.push({ workflowId: wf.id, status: result.status });
    } catch (err) {
      results.push({ workflowId: wf.id, status: "trigger_error" });
    }

    // Always update next_run_at (even on failure — don't block future runs)
    try {
      const nextRun = getNextRunAt(wf.schedule_cron, wf.schedule_timezone || "UTC");
      await supabase
        .from("workflows")
        .update({ schedule_next_run_at: nextRun })
        .eq("id", wf.id);
    } catch {
      // If cron parse fails, disable the schedule
      await supabase
        .from("workflows")
        .update({ schedule_enabled: false })
        .eq("id", wf.id);
    }
  }

  return NextResponse.json({ triggered: results.length, results });
}
```

**Step 2: Create vercel.json**

Create `vercel.json` at the project root `/Users/xudongguan/AICode/GoalWeek/vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/run-scheduled",
      "schedule": "* * * * *"
    }
  ]
}
```

**Step 3: Add CRON_SECRET to .env.local**

Add to `apps/web/.env.local`:
```
CRON_SECRET=your-random-secret-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Step 4: Commit**

```bash
git add apps/web/src/app/api/cron/run-scheduled/route.ts vercel.json
git commit -m "feat: add Vercel Cron scheduler route"
```

---

### Task 7: Schedule Configuration Modal

**Files:**
- Create: `apps/web/src/components/workflow/schedule-modal.tsx`

**Step 1: Create the schedule modal component**

A modal that lets users toggle scheduling on/off, pick Daily/Weekly, select time, and (for weekly) select days. Shows next run preview. Saves to DB.

Key props:
```typescript
interface ScheduleModalProps {
  workflow: Workflow;
  userTimezone: string;
  onClose: () => void;
  onSave: () => void; // callback to refresh parent
}
```

UI elements:
- Toggle switch for enable/disable
- Radio buttons: Daily / Weekly
- Time picker: hour (0-23) + minute (0/15/30/45)
- Day checkboxes (weekly only): Mon-Sun
- Timezone display (read-only, from user profile, "Change in Settings" link)
- Next run preview (computed client-side)
- Cancel / Save buttons

On save: call `updateWorkflow(id, { schedule_enabled, schedule_cron, schedule_timezone, schedule_next_run_at })`.

Use `buildCronExpression()` and `getNextRunAt()` from `@/lib/utils/schedule`.

**Step 2: Commit**

```bash
git add apps/web/src/components/workflow/schedule-modal.tsx
git commit -m "feat: add schedule configuration modal component"
```

---

### Task 8: Wire Schedule Button into Workflow Card + Page

**Files:**
- Modify: `apps/web/src/components/workflow/workflow-card.tsx`
- Modify: `apps/web/src/app/(app)/workflows/page.tsx`

**Step 1: Add schedule button to workflow card**

In `apps/web/src/components/workflow/workflow-card.tsx`:

1. Add `onSchedule?: () => void` to `WorkflowCardProps` (line 8-17)
2. Import `CalendarClock` from lucide-react
3. In the regular workflow buttons section (line 166-212), add a schedule button after the History button:

```tsx
{onSchedule && (
  <button
    onClick={onSchedule}
    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
  >
    <CalendarClock className="h-3 w-3" />
    Schedule
  </button>
)}
```

4. Add schedule indicator label below workflow name/description when `workflow.schedule_enabled` is true. Import `formatScheduleLabel` from `@/lib/utils/schedule`:

```tsx
{workflow.schedule_enabled && workflow.schedule_cron && (
  <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-medium text-[#7FAEE6]">
    <CalendarClock className="h-3 w-3" />
    {formatScheduleLabel(workflow.schedule_cron)}
  </div>
)}
```

**Step 2: Wire in workflows page**

In `apps/web/src/app/(app)/workflows/page.tsx`:

1. Add state: `const [scheduleWorkflow, setScheduleWorkflow] = useState<Workflow | null>(null);`
2. Add state for user timezone: fetch on mount from `getUserTimezone()`
3. Add `onSchedule={() => setScheduleWorkflow(wf)}` to each `<WorkflowCard>` for non-template cards
4. Render `<ScheduleModal>` when `scheduleWorkflow` is set
5. Auto-detect timezone on first mount: if no profile timezone, call `upsertUserTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)`

**Step 3: Commit**

```bash
git add apps/web/src/components/workflow/workflow-card.tsx apps/web/src/app/(app)/workflows/page.tsx
git commit -m "feat: add schedule button to workflow cards and wire modal"
```

---

### Task 9: Notification Bell — Header Integration

**Files:**
- Modify: `apps/web/src/components/layout/top-nav.tsx`

**Step 1: Make notification bell functional**

In `apps/web/src/components/layout/top-nav.tsx`:

1. Convert to a client component with state (it already has "use client" implied by parent)
2. Add state for notifications list, open/closed dropdown, unread count
3. Fetch `getUnreadNotifications()` on mount and on a 30-second polling interval
4. Replace the static Inbox button (line 33-36) with a functional dropdown:
   - Bell icon with dynamic red dot (only when unread > 0)
   - Dropdown panel showing list of notifications
   - Each notification: icon (checkmark or warning), title, relative time
   - Click notification → `markNotificationRead(id)` → navigate to `/workflows` (user can find in History)
   - "Mark all read" link at bottom
5. Replace the Settings button (line 39-41) with `<Link href="/settings">`

**Step 2: Commit**

```bash
git add apps/web/src/components/layout/top-nav.tsx
git commit -m "feat: add functional notification bell with dropdown to header"
```

---

### Task 10: Settings Page — Timezone

**Files:**
- Create: `apps/web/src/app/(app)/settings/page.tsx`

**Step 1: Create settings page**

Simple page with:
- "Settings" heading
- Timezone section: dropdown with common IANA timezone names (Asia/Shanghai, America/New_York, Europe/London, etc.)
- Current value loaded from `getUserTimezone()`
- On change: call `upsertUserTimezone(newTz)`
- Success toast/feedback

Also auto-detect on first mount: if profile has no timezone, set it from browser.

**Step 2: Commit**

```bash
git add apps/web/src/app/(app)/settings/page.tsx
git commit -m "feat: add settings page with timezone configuration"
```

---

### Task 11: End-to-End Test — Manual Verification

**Step 1: Test schedule configuration**

1. Open a workflow card
2. Click Schedule → set Daily 08:00 → Save
3. Verify in Supabase: `schedule_enabled=true`, `schedule_cron="0 8 * * *"`, `schedule_next_run_at` is set

**Step 2: Test server-side execution**

Run manually:
```bash
curl -X POST http://localhost:3000/api/workflows/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -d '{"workflowId": "...", "userId": "...", "triggeredBy": "scheduled"}'
```

Verify: workflow_run record created, step_results populated, notification created.

**Step 3: Test cron scheduler**

```bash
curl http://localhost:3000/api/cron/run-scheduled \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Verify: triggers due workflows, updates next_run_at.

**Step 4: Test notification bell**

1. Trigger a scheduled run
2. Refresh page → bell should show red dot
3. Click bell → see notification
4. Click notification → mark as read, dot disappears

**Step 5: Test settings page**

1. Navigate to /settings
2. Change timezone
3. Go to workflow schedule → verify timezone display updates

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: adjustments from e2e testing"
```
