# Scheduled Workflows Design

## Problem

Users want workflows to run automatically on a schedule (e.g., "collect AI news daily at 8:00 AM", "process emails every weekday at 9:00 AM"). Currently workflows can only be triggered manually.

## Decisions

- **Architecture**: Vercel Cron (1 job, every minute) + server-side execution API
- **Scheduling granularity**: Daily and Weekly (no raw cron input in UI)
- **Timezone**: Auto-detect from browser on first use, editable in Settings
- **Notifications**: In-app only (header bell icon, already exists as placeholder)
- **No separate table**: Schedule fields added directly to `workflows` table (1:1 relationship)

## Data Layer

### workflows table — new fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `schedule_enabled` | boolean | false | Whether scheduling is active |
| `schedule_cron` | text | null | Cron expression, e.g. `0 8 * * *` |
| `schedule_timezone` | text | null | IANA timezone, e.g. `Asia/Shanghai` |
| `schedule_next_run_at` | timestamptz | null | Next run time in UTC, used by cron query |

### user_profiles — new field

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `timezone` | text | 'UTC' | User's default timezone, auto-detected from browser |

### notifications table — new

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `type` | text | `scheduled_run_complete` or `scheduled_run_failed` |
| `title` | text | e.g. "AI News Collector completed" |
| `metadata` | jsonb | `{ workflowId, runId, status }` |
| `read` | boolean, default false | |
| `created_at` | timestamptz | |

### TypeScript type updates

```typescript
// workflow.ts — extend Workflow interface
export interface Workflow {
  // ... existing fields ...
  schedule_enabled: boolean;
  schedule_cron: string | null;
  schedule_timezone: string | null;
  schedule_next_run_at: string | null;
}

// new notification type
export interface Notification {
  id: string;
  user_id: string;
  type: "scheduled_run_complete" | "scheduled_run_failed";
  title: string;
  metadata: { workflowId: string; runId: string; status: string };
  read: boolean;
  created_at: string;
}
```

## Server-Side Execution Engine

### POST /api/workflows/execute

New API route that runs a full workflow server-side (no browser needed):

1. Read workflow + steps from DB
2. Create `workflow_run` record
3. For each step sequentially:
   - Call `/api/ai/agent-chat` internally (same Anthropic API, consume full SSE response server-side)
   - Pass previous step outputs to next step (same enrichment logic as client)
   - Update `step_results` in DB after each step
   - On failure: mark run as failed, stop
4. On success: mark run as success
5. Insert notification record
6. Return `{ runId, status }`

Input: `{ workflowId: string, userId: string, triggeredBy: "scheduled" | "manual" }`
Auth: Verified via `CRON_SECRET` header (for scheduled) or session (for manual).

## Cron Scheduler

### vercel.json

```json
{
  "crons": [{
    "path": "/api/cron/run-scheduled",
    "schedule": "* * * * *"
  }]
}
```

### GET /api/cron/run-scheduled

1. Verify `Authorization: Bearer ${CRON_SECRET}` header
2. Query: `SELECT * FROM workflows WHERE schedule_enabled = true AND schedule_next_run_at <= now()`
3. For each due workflow:
   - Call `POST /api/workflows/execute`
   - Compute next run time from cron expression + timezone
   - Update `schedule_next_run_at`
   - On failure: still update next_run_at (don't block future runs)
4. Return `{ triggered: N }`

### next_run_at computation

When user saves a schedule:
- UI generates cron expression from Daily/Weekly + time selection
- Server computes next matching time in user's timezone
- Converts to UTC and stores in `schedule_next_run_at`

After each run, same computation for the following occurrence.

## User Interface

### Schedule modal (from workflow card)

Triggered by clock icon button on workflow card. Fields:
- Toggle: enable/disable
- Frequency: Daily / Weekly radio
- Time: hour + minute picker
- Days of week (Weekly only): checkboxes Mon-Sun
- Timezone display: shows user's timezone from profile (link to Settings to change)
- Next run preview: computed and shown before saving

### Workflow card schedule indicator

When schedule is enabled, show a small label below workflow name:
`Daily at 08:00` or `Mon, Wed, Fri at 09:00`

### Header notification bell (existing placeholder)

- Query `notifications` table for current user, unread count
- Red dot badge when unread > 0
- Dropdown: list of recent notifications with title + timestamp
- Click notification: navigate to workflow's Run History
- Mark as read on click

### Settings page timezone (existing placeholder)

- Auto-detect on first visit: `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Save to `user_profiles.timezone`
- Dropdown to change manually

## What We're NOT Doing (YAGNI)

- No retry mechanism (failed = failed, user sees notification, can re-run manually)
- No concurrency control (phase 1 doesn't need it)
- No raw cron expression input (UI generates it from Daily/Weekly selection)
- No email/push notifications (in-app only)
- No task queue / fan-out (direct execution, scale later)
