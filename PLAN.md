# GoalWeek v2 — Implementation Plan

Consolidated from: Design Doc v2, Eng Review (19 decisions), Design Review (12 decisions).
Date: 2026-04-03. Branch: main.

## What We're Building

An AI goal coaching web app that plans, coaches, AND executes tasks. Users describe a goal, the AI decomposes it into phases/weekly plans/daily tasks, coaches them daily, and can execute certain tasks (create flashcards, research, generate files) via OpenClaw.

## Two-Phase Build

### Phase 1: Web App (Coaching Loop + UI)
Ship a working coaching app. Users can create goals, get AI plans, check off tasks, get daily coaching.

### Phase 2: OpenClaw Execution Layer
Add "Let AI do this" — the AI creates deliverables (flashcards, research reports, images) for executable tasks.

---

## Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js (App Router), Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes (AI streaming) + Server Actions (DB) |
| Database | Supabase (Postgres + Auth + Storage + Realtime) |
| AI Models | Opus (goal decomposition + task classification), Sonnet (weekly plans, reviews, coaching) |
| Email | Resend (weekly summaries + notification fallback) |
| Push | Web Push (VAPID) + email fallback for iOS |
| Execution | OpenClaw server on VPS (Phase 2) |
| Deploy | Vercel (web app) + VPS Docker Compose (Phase 2) |
| Language | English only (i18n deferred) |

## Repo Structure (Monorepo)

```
goalweek/
├── apps/
│   ├── web/              # Next.js app → Vercel
│   │   ├── app/          # App Router pages
│   │   ├── lib/
│   │   │   ├── ai/       # One module per AI interaction
│   │   │   │   ├── client.ts       # Shared Anthropic client
│   │   │   │   ├── decompose.ts    # Goal → phases (Opus)
│   │   │   │   ├── weekly-plan.ts  # Phase → weekly tasks + classification (Sonnet)
│   │   │   │   ├── coach.ts        # Daily coaching message (Sonnet)
│   │   │   │   └── review.ts       # Weekly review (Sonnet)
│   │   │   ├── db/       # Supabase client, types, helpers
│   │   │   └── types/    # Auto-generated from Supabase + app types
│   │   └── components/   # UI components
│   └── bridge/           # Execution Bridge → VPS Docker (Phase 2)
│       ├── server.ts     # Express HTTP server
│       ├── openclaw.ts   # WebSocket to OpenClaw
│       ├── hmac.ts       # Request validation
│       └── storage.ts    # Upload to Supabase Storage
├── packages/
│   └── shared/           # Types, HMAC utils, constants
├── docker-compose.yml    # VPS: bridge + openclaw (Phase 2)
├── DESIGN.md             # Design tokens
├── TODOS.md              # Deferred work
└── PLAN.md               # This file
```

## Pages & Navigation

**Layout:** Sidebar navigation (collapsed 56px by default, expand on hover to 240px).

**AI Chat Panel:** Omnipresent slide-out panel from the right (320px on desktop, full-screen overlay on mobile). Triggered by FAB button (bottom-right) or Cmd+K. Goal creation happens HERE, not on a dedicated page.

```
┌─────────┬──────────────────────────────┬──────────────┐
│ SIDEBAR │       MAIN CONTENT           │  CHAT PANEL  │
│ (56px)  │                              │  (320px,     │
│         │                              │   slide-out) │
│ Logo    │                              │              │
│ ─────── │                              │  Triggered   │
│ Today   │                              │  by FAB or   │
│ Goals   │                              │  Cmd+K       │
│ Progress│                              │              │
│ ─────── │                              │              │
│ Settings│                              │              │
│         │             ┌──────┐         │              │
│         │             │ FAB  │         │              │
│         │             │  💬  │         │              │
│         │             └──────┘         │              │
└─────────┴──────────────────────────────┴──────────────┘
```

| Route | Purpose | Primary Content |
|-------|---------|-----------------|
| `/` | Landing page | Minimal: headline + CTA + sign up/sign in |
| `/today` | Daily view (most visited) | 1st: Coaching message card. 2nd: Task list (Morning/Afternoon/Evening groups). 3rd: Streak counter. |
| `/goals` | Goal list | Goal cards (title, active phase, progress). "Create goal" opens chat panel. |
| `/goals/:id` | Goal detail | Phase timeline + current week's tasks + upcoming phases |
| `/progress` | Streak + progress | Streak heatmap + weekly completion chart + phase progress per goal |
| `/files/:id` | AI deliverable (Phase 2) | File preview/download + task context |
| `/admin` | Founder analytics | Key metrics: users, WAU, retention, task completion (SQL queries in Supabase Studio until dashboard is built) |

**First-time user flow:** Sign up → land on `/today` → chat panel auto-opens with welcome message → user describes goal → AI clarifies + decomposes → confirmation card → user confirms → `/today` populates with first week's tasks.

## Data Model (7 tables)

```sql
-- Phase 1 tables

CREATE TABLE users (
  id uuid PRIMARY KEY,  -- from Supabase Auth
  email text NOT NULL,
  display_name text,
  locale text DEFAULT 'en',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'active',  -- active|completed|archived
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES goals(id) NOT NULL,
  user_id uuid NOT NULL,  -- DENORMALIZED for fast RLS
  title text NOT NULL,
  description text,
  sort_order int NOT NULL,
  status text DEFAULT 'upcoming',  -- upcoming|active|completed
  estimated_weeks int,
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE weekly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid REFERENCES phases(id) NOT NULL,
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  ai_summary text,
  review_summary text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id uuid REFERENCES weekly_plans(id) NOT NULL,
  user_id uuid NOT NULL,  -- DENORMALIZED for fast RLS
  day_of_week int NOT NULL,  -- 0-6, Mon-Sun
  title text NOT NULL,
  description text,
  time_estimate_minutes int,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  sort_order int NOT NULL,
  execution_type text DEFAULT 'user_action',  -- user_action|ai_executable|ai_assisted (classified from day 1, UI ignores until Phase 2)
  execution_status text,      -- null until Phase 2: pending|running|completed|failed
  execution_result_url text   -- null until Phase 2: Supabase Storage URL
);

CREATE TABLE coaching_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  goal_id uuid REFERENCES goals(id) NOT NULL,
  role text DEFAULT 'coach',
  content text NOT NULL,
  trigger text NOT NULL,  -- daily_open|week_start|week_end|task_complete|manual
  tokens_used int,
  created_at timestamptz DEFAULT now()
);

-- Phase 2 addition
CREATE TABLE execution_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES daily_tasks(id) NOT NULL,
  user_id uuid NOT NULL,
  openclaw_request_id text,
  skill_used text,
  input_prompt text,
  output_files jsonb,  -- [{filename, url, mimeType, size}]
  tokens_used int,
  status text DEFAULT 'queued',  -- queued|running|completed|failed
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Indexes
CREATE INDEX idx_goals_user_id ON goals(user_id);
CREATE INDEX idx_phases_goal_id ON phases(goal_id);
CREATE INDEX idx_phases_user_id ON phases(user_id);
CREATE INDEX idx_weekly_plans_phase_id ON weekly_plans(phase_id);
CREATE INDEX idx_weekly_plans_user_id ON weekly_plans(user_id);
CREATE INDEX idx_weekly_plans_week_start ON weekly_plans(user_id, week_start);
CREATE INDEX idx_daily_tasks_weekly_plan_id ON daily_tasks(weekly_plan_id);
CREATE INDEX idx_daily_tasks_user_id ON daily_tasks(user_id);
CREATE INDEX idx_coaching_messages_user_goal ON coaching_messages(user_id, goal_id);
-- Phase 2
CREATE INDEX idx_execution_jobs_task_id ON execution_jobs(task_id);
CREATE INDEX idx_execution_jobs_user_id ON execution_jobs(user_id);
CREATE INDEX idx_execution_jobs_status ON execution_jobs(user_id, status);

-- RLS: every table uses WHERE user_id = auth.uid() (simple equality, no JOINs)
```

## AI Architecture

| Interaction | Model | Route | Streaming? |
|-------------|-------|-------|-----------|
| Goal decomposition | Opus | `/api/ai/plan` | Yes |
| Task classification | Opus | Part of weekly plan gen | No (tool use) |
| Weekly plan generation | Sonnet | `/api/ai/plan` | Yes |
| Daily coaching | Sonnet | `/api/ai/coach` | Yes |
| Weekly review | Sonnet | `/api/ai/plan` | Yes |

- **API Route Handlers** for all AI calls (streaming via ReadableStream)
- **Server Actions** for all DB mutations (create goal, toggle task, etc.)
- **Structured JSON** via Anthropic tool use for decomposition + classification (no max_tokens cap)
- **Separate API keys** for Vercel (coaching) vs VPS (execution) to isolate rate limits

### Coaching message: on-demand with caching
When user opens the app, check if a coaching message exists for today. If not, generate one (Sonnet, streamed). Cache in coaching_messages table. No cron needed.

### Weekly plan: on-demand with caching
When user opens `/goals/:id` or `/today` and no plan exists for the current week, auto-generate (Sonnet, streamed). Only pays for users who actually return.

### Phase transitions
Manual with AI nudge. User clicks "Complete phase" button. AI suggests transition during weekly review when metrics indicate readiness.

### Chat state
Client-side (React state) during the conversation. Persist final exchange to coaching_messages after goal is confirmed. No chat_sessions table needed.

## Auth

Supabase Auth: email/password + Google OAuth. Session tokens via Supabase client SDK (httpOnly cookies). Use `getClaims()` on server (never trust `getSession()`). RLS on all tables via `auth.uid() = user_id`.

## Push Notifications + Email

- **Web Push:** Service worker in `/public`, VAPID keys. Morning nudge (8 AM local), evening check-in (8 PM local). Browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Email fallback:** For iOS users or users who decline push. Same schedule via Resend.
- **Weekly email:** Vercel Cron Job (runs daily, checks if Sunday) + Resend `scheduledAt` for precise local-time delivery. No pg_cron.
- **CAN-SPAM:** Unsubscribe link in every email.

## Streaks + Confetti

- Streak counter: timezone-aware, UTC dates. Increments when at least one task completed in a day. Breaks only when ALL daily tasks are missed.
- Confetti: `canvas-confetti` library. 1-second burst when all daily tasks are completed. Fires once per day.

## Phase 2: OpenClaw Execution

### Architecture

```
Browser → Vercel /api/ai/execute (HTTP POST, returns job_id immediately)
              ↓
         VPS: Execution Bridge (Express)
              ↓ (WebSocket)
         VPS: OpenClaw Gateway (executes task)
              ↓
         Bridge uploads result to Supabase Storage
         Bridge writes execution_jobs record
              ↓
         Browser: Supabase Realtime subscription → file appears on task card
```

### Auth: Vercel → VPS
HMAC-signed payloads: `user_id + timestamp + HMAC(secret, payload)`. Bridge rejects timestamps >60s old. No nonce (sufficient for MVP).

### Execution UX
Progress card with status updates via Supabase Realtime: "Researching..." → "Generating content..." → "Uploading..." → file appears with download icon.

### Rate limiting
10 executions per user per day. Enforced in `/api/ai/execute`.

### Safety
- 10-minute timeout on Bridge. If OpenClaw doesn't respond, write `status=failed`.
- Max 50MB per execution file. Temp file cleanup after upload.
- Auto-retry: 2x with 30s backoff. After that, manual retry only.

### VPS failure
Graceful degradation: "Execution service is temporarily unavailable. Your coaching and tasks work normally." Coaching loop unaffected.

### MVP Skills
- Web search (Gemini API)
- Markdown/text file creation (native)
- Image generation (Gemini)

### Task classification
AI classifies each task during weekly plan generation:
- **USER_ACTION** — only user can do (practice speaking, attend meeting)
- **AI_EXECUTABLE** — AI produces a deliverable (create materials, research)
- **AI_ASSISTED** — AI helps but user finishes (draft email for review)

`execution_type` column exists from Phase 1 (classified in prompt). Phase 1 UI ignores it. Phase 2 UI shows "Let AI do this" button on AI_EXECUTABLE tasks.

## Design Direction

See `DESIGN.md` for tokens. Key decisions:

- **Desktop-primary**, responsive down to mobile
- **Notion-like minimal**: clean, premium, warm cream palette
- **Omnipresent AI chat panel** (slide-out 320px, not a /chat page)
- **Sidebar collapsed by default** (56px icons, expand on hover)
- **Task grouping:** Morning / Afternoon / Evening
- **No AI slop:** no purple gradients, no 3-column grids, no icons in colored circles, no emoji as design, 6px border-radius everywhere
- **Mobile:** sidebar → hamburger menu, chat panel → full-screen overlay, bottom nav bar

## Interaction States

Every feature has defined loading/empty/error/success states:

- **Loading:** skeleton cards (tasks, coaching), typing indicator (chat), button spinners (auth)
- **Empty:** warm message + primary action. "/today" empty → chat panel auto-opens. "/goals" empty → FAB pulses.
- **Error:** specific messages, retry buttons. AI down → fallback to cached data. VPS down → coaching still works.
- **Success:** smooth animations. Task check-off is optimistic (immediate, sync in background). Confetti on all-daily-done.

## Success Criteria

- **Week 2:** 5+ users completing daily tasks
- **Week 4:** 3+ users still active. 10+ AI-executed tasks. Users re-use deliverables.
- **Week 6:** One user offers to pay
- **Week 8:** 20+ WAU. Execution used by >50% of active users.
- **Minimum viable signal:** 5 WAU by week 8 with >50% using execution.

## Cost Model

~$0.95/user/month (coaching $0.28 + execution $0.54 + misc $0.13). VPS $20-40/mo fixed. At $15/mo subscription: ~94% gross margin.

## What to Port from MyAIOffice

- Goal decomposition prompts from `apps/server/src/services/goal-service.ts`
- Goal-clarifier flow from `apps/server/src/ai/prompt-builder.ts`
- OpenClaw gateway (deploy as Docker container, unchanged)

## Build Sequence

### Phase 1 (target: 1 week with CC)

1. **Scaffold:** Next.js app, Supabase project, Tailwind + shadcn/ui, repo structure
2. **Auth:** Supabase Auth (email + Google OAuth), middleware, RLS policies
3. **DB:** All 6 Phase 1 tables + indexes + RLS
4. **Core AI:** decompose.ts (Opus), weekly-plan.ts (Sonnet), coach.ts (Sonnet), review.ts (Sonnet)
5. **Pages:** `/today`, `/goals`, `/goals/:id`, `/progress`, `/` (landing)
6. **Chat panel:** Omnipresent slide-out, conversational goal creation, Cmd+K
7. **Push + Email:** Service worker, VAPID, Resend, Vercel Cron
8. **Streaks:** Counter + confetti
9. **Tests:** Vitest (unit) + Playwright (E2E), balanced pyramid (~25 unit, ~10 integration, ~5 E2E)
10. **Deploy:** Vercel

### Phase 2 (target: 1 week with CC, after Phase 1 ships)
Okay, let's start to write our code.
1. **OpenClaw VPS test** (CRITICAL: do before building Bridge)
2. **Bridge:** Express server, HMAC auth, WebSocket to OpenClaw, Supabase Storage upload
3. **DB migration:** execution_jobs table + execution columns on daily_tasks
4. **UI:** "Let AI do this" button, progress card, Supabase Realtime subscription
5. **Safety:** 10-min timeout, 50MB file limit, rate limiting (10/user/day)
6. **Deploy:** Docker Compose on VPS

### Parallelization

```
Lane A: Phase 1 Web App (apps/web/)           ← start immediately
Lane B: OpenClaw Deployment Test (Docker)      ← start in parallel with Lane A
Lane C: Phase 2 Bridge (apps/bridge/)          ← start when Phase 1 DB is deployed
```

## Pre-Build Checklist

Before writing code, check off:
- [ ] Supabase project created (free tier)
- [ ] Vercel project created
- [ ] Anthropic API key (for Vercel)
- [ ] Domain name chosen
- [ ] Resend account + API key
- [ ] VAPID keys generated (`npx web-push generate-vapid-keys`)
