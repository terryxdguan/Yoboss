# Daily Email Digest — Design Spec

**Date:** 2026-04-27
**Status:** Approved, in implementation

## Goal

Send each YoBoss user a daily email at **6 AM in their local timezone** that:

1. Lists today's to-do items first
2. Lists yesterday's completed items below
3. Has every link (logo, items, button, footer) point to `${APP_URL}/dashboard`
4. Visually matches the main site brand

## Decisions (from brainstorm)

| # | Decision |
|---|----------|
| 1 | **Per-user local 6 AM** via hourly cron + per-user timezone check |
| 2 | "Today's items" = `daily_tasks` (today's day_of_week) **+** `todos` (deadline today) — same as the dashboard "Today" section |
| 3 | **Default ON**, with a Settings toggle and a one-click HMAC-signed unsubscribe link in every email |
| 4 | If a user has 0 today-items **and** 0 yesterday-completed → **skip the send** (no empty emails) |

## Architecture

```
Vercel Cron (UTC, every hour) ─► /api/cron/daily-email
   │ Bearer CRON_SECRET
   │
   ├─ SELECT users WHERE daily_email_enabled = true
   ├─ For each user:
   │     - localHour = hour of `now` in user.timezone
   │     - if localHour !== 6 → skip
   │     - localToday = date of `now` in user.timezone
   │     - if last_daily_email_sent_on === localToday → skip (idempotency)
   │     - data = buildDailyDigestData(userId, user.timezone)
   │     - if data.todayItems == 0 && data.yesterdayCompleted == 0 → skip
   │     - html = renderDailyDigest({ user, data, unsubUrl, dashboardUrl })
   │     - resend.emails.send({ from, to, subject, html, headers: { List-Unsubscribe… } })
   │     - UPDATE users SET last_daily_email_sent_on = localToday WHERE id = …
   └─ return { processed, sent, skipped, errors }
```

Idempotency: hourly cron + `last_daily_email_sent_on` ensures a user can never receive two emails on the same local date even if the cron retries.

## Database Migration

`supabase/migrations/023_daily_email.sql`

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_daily_email_sent_on date;

CREATE INDEX IF NOT EXISTS idx_users_daily_email_enabled
  ON public.users(daily_email_enabled) WHERE daily_email_enabled = true;
```

Tracking via `_migrations` table is automatic (see `apply-migrations.mjs`).

## Files

```
apps/web/
├── vercel.json                                       (NEW — cron config)
├── src/
│   ├── app/api/
│   │   ├── cron/daily-email/route.ts                 (NEW)
│   │   ├── email/unsubscribe/route.ts                (NEW — public, HMAC verified)
│   │   ├── settings/email-prefs/route.ts             (NEW)
│   │   └── dev/preview-daily-email/route.ts          (NEW — dev-only)
│   ├── app/(app)/settings/page.tsx                   (MODIFIED — add toggle)
│   ├── lib/email/
│   │   ├── client.ts                                 (NEW — Resend singleton)
│   │   ├── daily-digest.ts                           (NEW — orchestrate one user's send)
│   │   ├── digest-data.ts                            (NEW — buildDailyDigestData)
│   │   ├── render-daily-digest.ts                    (NEW — pure HTML template)
│   │   └── unsubscribe-token.ts                      (NEW — HMAC sign/verify)
│   └── middleware.ts                                 (MODIFIED — allow /api/email/unsubscribe public)
└── .env.local.example                                (MODIFIED — add EMAIL_FROM, EMAIL_UNSUB_SECRET)
```

## Module specs

### `lib/email/digest-data.ts`

```ts
export type DigestItem = {
  title: string;
  sourceLabel: string;             // "Personal", "Work", or goal title
  timeSlot: "morning" | "afternoon" | "evening";
};

export type DigestData = {
  todayItems: DigestItem[];        // ordered by timeSlot then title
  yesterdayCompleted: DigestItem[];
};

export async function buildDailyDigestData(
  supabase: SupabaseClient,         // admin client (cron context)
  userId: string,
  timezone: string,
): Promise<DigestData>;
```

Internals:
- Compute `todayLocal` and `yesterdayLocal` (YYYY-MM-DD) from `new Date()` in `timezone` via `Intl.DateTimeFormat`.
- Compute `todayDow` (0-6, Sun=0) in `timezone`.
- Today items =
  - `daily_tasks` joined to `weekly_plans` (latest plan per active goal), filtered by `day_of_week = todayDow`, with `completed = false`
  - `todos` where `deadline` startsWith `todayLocal` and `completed = false`
- Yesterday completed =
  - `daily_tasks` where `completed_at` is on `yesterdayLocal` (in `timezone`)
  - `todos` where `completed_at` is on `yesterdayLocal` (in `timezone`)

### `lib/email/render-daily-digest.ts`

Pure function `renderDailyDigest({ user, data, dashboardUrl, unsubUrl }) → { html, text, subject }`.

- HTML uses table layout + inline styles (Gmail/Outlook safe).
- Brand tokens (matching `globals.css`):
  - bg `#F6F3EE` / card `#FFFDF9` / fg `#2B2B2B` / muted `#6F6A64`
  - primary `#7FAEE6` / sage check `#8DCB96` / border `#DDD3C7`
- Layout (top to bottom):
  1. Header: "YoBoss" wordmark linking to `dashboardUrl`, greeting `Good morning, {name or "there"}`.
  2. **Today** — `🌞 Today (N items)`, items grouped by timeSlot, each `○ {title}` + small grey `· {sourceLabel}`. Whole card linked to `dashboardUrl`.
  3. **Yesterday** — `✓ Yesterday's wins (N)`, items as `✓ {title} · {sourceLabel}` in muted color. **Section omitted entirely if 0 completed.**
  4. CTA button "Open YoBoss" → `dashboardUrl`.
  5. Footer: small text "Manage email preferences" (→ `${APP_URL}/settings`) and "Unsubscribe" (→ `unsubUrl`).
- Subject: `Today on YoBoss · {N} item{s}` (or `Yesterday's wins on YoBoss` if today is empty but yesterday is not — but per decision 4 we never send when both are empty).
- Plain-text fallback: simple bullet list.

### `lib/email/unsubscribe-token.ts`

```ts
export function signUnsubscribeToken(userId: string): string;
export function verifyUnsubscribeToken(userId: string, token: string): boolean;
```

`HMAC-SHA256(userId, EMAIL_UNSUB_SECRET)` → first 32 chars hex. Constant-time compare.

### `lib/email/daily-digest.ts`

```ts
export async function sendDailyDigestForUser(
  supabase: SupabaseClient,
  user: { id: string; email: string; timezone: string; display_name: string | null },
  now: Date,
): Promise<"sent" | "skipped:not-6am" | "skipped:already-sent" | "skipped:empty" | "error">;
```

Owns the per-user logic block from the architecture flow. Returns a tag the cron handler aggregates.

### `app/api/cron/daily-email/route.ts`

- `GET` only, Bearer `CRON_SECRET`, `maxDuration = 300`.
- Selects users in batches of 500 (paginated). For each, calls `sendDailyDigestForUser`. Aggregates counts.
- Errors per user are caught and logged but do not abort the batch.
- Returns `{ processed, sent, skipped: {...counts}, errors: [...] }`.

### `app/api/email/unsubscribe/route.ts`

- `GET ?u={userId}&t={token}` — public.
- Verifies token, sets `daily_email_enabled = false` for that user, returns a small HTML page styled like the email confirming unsubscribe with a button "Re-enable in settings" → `${APP_URL}/settings`.
- Also accepts `POST` with the same params for the `List-Unsubscribe-Post` one-click flow → returns 200 plain text "ok".

### `app/api/settings/email-prefs/route.ts`

- `POST { dailyEmailEnabled: boolean }` — auth required (Supabase session).
- Updates the current user's `daily_email_enabled`.

### `app/(app)/settings/page.tsx`

- Convert to a server-fetched + client-toggle pattern (server fetches the user row, client component renders the switch). Replace the empty placeholder with a section "Email notifications" containing:
  - Toggle: "Daily summary email" with subtext "Sent at 6 AM in your local timezone."

## Operational

### Env vars

Add to `apps/web/.env.local.example`:

```
# Daily email digest
EMAIL_FROM="YoBoss <hello@yourdomain.com>"
EMAIL_UNSUB_SECRET=<random-32-char-string>
```

`RESEND_API_KEY` and `CRON_SECRET` already exist.

User must:
1. Verify a sender domain in Resend.
2. Set `EMAIL_FROM`, `EMAIL_UNSUB_SECRET`, `RESEND_API_KEY`, `CRON_SECRET` on Vercel Production.
3. Confirm `NEXT_PUBLIC_APP_URL` is the production domain on Vercel.

### vercel.json

```json
{
  "crons": [
    { "path": "/api/cron/daily-email", "schedule": "0 * * * *" }
  ]
}
```

(Existing `/api/cron/run-scheduled` continues running on whatever cadence it's currently configured for — we don't change it.)

### Middleware

Add `request.nextUrl.pathname.startsWith("/api/email/")` to the public-route list so unsubscribe links work without a session.

## Testing

1. **Unit-ish** (manual via dev preview):
   `GET /api/dev/preview-daily-email?to=<your-email>` (only when `NODE_ENV !== "production"`) — fetches the current user's data and sends a real email through Resend. Verify rendering across Gmail web/iOS Mail.
2. **Cron path**:
   `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-email` — should report `processed/sent/skipped` counts. With a test user whose `timezone` is set so that the current UTC hour is 6 AM there, the user should receive the email.
3. **Unsubscribe**:
   Click the link → user row flips to `daily_email_enabled = false`. Re-run cron → user is skipped.
4. **Idempotency**: re-run cron at the same hour → `skipped:already-sent` for users already mailed today.
5. **Production verification**:
   After deploy, use Vercel dashboard "Run Cron" button. Inspect logs.

## Out of scope (intentional)

- No HTML email design framework (`react-email`, `mjml`) — single template, plain string is fine.
- No per-user time customization (always 6 AM local).
- No weekly digest, no missed-yesterday digest.
- No email opens / click tracking beyond what Resend provides by default.
