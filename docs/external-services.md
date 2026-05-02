# External Services

Inventory of every third-party platform YoBoss depends on at runtime or
deploy time, what we use it for, and the configuration each one needs.
Keep this in sync when adding/removing dependencies — when something
breaks, this is the first doc to read.

> Dashboard URLs assume the account owner is logged in. New
> contributors need to be invited to each platform separately.

---

## 1. Vercel — Hosting + edge + cron

| Field | Value |
|---|---|
| Dashboard | https://vercel.com/ |
| Project | `yoboss` (apex domain `yoboss.ai`) |
| SDK / files | `@vercel/analytics`, [`vercel.json`](../apps/web/vercel.json) |

### What we depend on it for

- Hosts the Next.js app — every `/`, `/api/*`, server action runs as a
  Vercel serverless or edge function.
- Owns the apex domain `yoboss.ai` (DNS + TLS managed by Vercel).
- Static asset CDN (~100 PoPs globally, including Brazil).
- Scheduled jobs via `vercel.json > crons`.
- Privacy-friendly traffic analytics (`@vercel/analytics/next`).
- Build pipeline — every push to `main` triggers `vercel-build`, which
  applies pending Supabase migrations before `next build`.

### Functions we built on top

- **Cron jobs** ([apps/web/vercel.json](../apps/web/vercel.json)):
  - `/api/cron/daily-email` — hourly fan-out for daily digest emails.
  - `/api/cron/run-scheduled` — every 5 min, executes due Workflow runs.
- **Migration runner** in `vercel-build` — see
  [apps/web/scripts/apply-migrations.mjs](../apps/web/scripts/apply-migrations.mjs).
- **Geo audience analytics** via Vercel Analytics (used to inform region
  decisions; see `docs/external-services.md` notes on multi-region).

### Required configuration

**Environment variables** (Production + Preview):
- All env vars listed in [.env.local.example](../apps/web/.env.local.example).
- `NEXT_PUBLIC_APP_URL=https://yoboss.ai` — used by `metadataBase`,
  Stripe `success_url`, email links.
- `CRON_SECRET` — signs Vercel cron requests so unauthenticated callers
  can't trigger jobs externally.
- `DATABASE_URL` — Supabase Session-pooler URI, used by the migration
  runner during `vercel-build`.
- **Never** set `DEV_AUTH_BYPASS*` here (the route 404s in production
  regardless, but policy is don't even configure them).

**Dashboard setup**:
- Domain `yoboss.ai` added under Settings → Domains.
- Cron jobs auto-registered from `vercel.json` on deploy.
- Stripe webhook secret rotated whenever the Stripe webhook endpoint URL
  changes (see Stripe section).

---

## 2. Supabase — Postgres + Auth

| Field | Value |
|---|---|
| Dashboard | https://supabase.com/dashboard |
| Project ref | `nykgbgddhmyksmotdsaq` (production) |
| Project URL | `https://nykgbgddhmyksmotdsaq.supabase.co` |
| SDK | `@supabase/supabase-js`, `@supabase/ssr` |

### What we depend on it for

- **Postgres database** — all app data: goals, weekly plans, daily
  tasks, chat sessions/messages, AI usage, user quotas, Stripe state,
  feedback, user memory.
- **Auth** — email/password + Google OAuth. Sessions managed via
  Supabase Auth cookies.
- **Row-Level Security** — enforced on all user-scoped tables.
- (NOT used today: Supabase Storage, Realtime, Edge Functions.)

### Functions we built on top

- ~30 SQL migrations in [supabase/migrations/](../supabase/migrations/),
  applied via [apply-migrations.mjs](../apps/web/scripts/apply-migrations.mjs)
  on every deploy. Tracking table: `public._migrations`.
- Google sign-in flow ([auth-modal.tsx:106](../apps/web/src/components/landing/auth-modal.tsx#L106)).
- Email sign-up + confirmation (uses Supabase's default SMTP unless
  Custom SMTP is later configured to route through Resend).
- Server actions in [apps/web/src/lib/db/actions.ts](../apps/web/src/lib/db/actions.ts)
  reading/writing via the standard Supabase client.

### Required configuration

**Environment variables**:
- `NEXT_PUBLIC_SUPABASE_URL` — REST endpoint.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public key, browser-side queries.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS, used by
  webhooks and admin actions.
- `DATABASE_URL` — Postgres connection string (Session-pooler URI from
  Settings → Database). URL-encode `@` etc. in the password.

**Dashboard setup**:
- Authentication → Providers → Google enabled with OAuth credentials
  (see Google section).
- Authentication → URL Configuration → Site URL = `https://yoboss.ai`,
  redirect URLs include `/auth/callback`.
- **Custom SMTP configured** (Authentication → Emails → SMTP Settings)
  routing all auth emails through Resend. Sender =
  `noreply@mail.yoboss.ai`. Reasons:
  - Default Supabase SMTP is rate-limited (~30 emails/hour on Pro tier)
    — would break a launch surge.
  - Auth emails now appear in Resend Logs alongside transactional
    sends, single-pane observability.
  - Sender domain matches the rest of the brand instead of
    `noreply@mail.app.supabase.io`.
- Email templates (Authentication → Email Templates) for Confirm
  signup / Magic Link / Reset Password use the YoBoss-branded HTML
  shipped with this repo's design tokens.

---

## 3. Anthropic — Claude API (primary AI)

| Field | Value |
|---|---|
| Dashboard | https://console.anthropic.com/ |
| API base | `https://api.anthropic.com/v1/` |
| SDK | `@anthropic-ai/sdk` |

### What we depend on it for

The model that powers literally every AI feature — goal decomposition,
weekly plan generation, agent chat, summarization, daily coaching,
research, file generation. Models in use (see
[apps/web/src/lib/ai/client.ts](../apps/web/src/lib/ai/client.ts)):

- **Claude Opus 4.7** — heavyweight tasks (goal decomposition, complex
  agent tool use).
- **Claude Sonnet 4.6** — bulk of chat / weekly planning / coaching.
- **Server tools** enabled: `web_search`, `web_fetch`, `code_execution`
  (fork-runs Python in Anthropic's sandbox so agents can produce
  downloadable files).

### Functions we built on top

- Streaming agent chat — see [api/ai/agent-chat/route.ts](../apps/web/src/app/api/ai/agent-chat/route.ts)
  with prompt-caching + memory + active-goal context.
- Goal/plan generation — [api/ai/plan/route.ts](../apps/web/src/app/api/ai/plan/route.ts).
- Workflow execution — `agent-run-step` chained turns.
- File generation via `code_execution` tool — output written to
  `$OUTPUT_DIR`, surfaced as Deliverables.
- Per-user per-route rate limiting + monthly allowance + credits in
  [apps/web/src/lib/ai/rate-limit.ts](../apps/web/src/lib/ai/rate-limit.ts).

### Required configuration

**Environment variables**:
- `ANTHROPIC_API_KEY` — single key used everywhere. Server-side only.

**Dashboard setup**:
- Workspace → API Keys → create one for production.
- Optional: monthly spend cap on the workspace as a hard backstop.
- Billing autotop-up if you can't tolerate hitting the monthly cap.

---

## 4. OpenAI — Image generation (DALL-E)

| Field | Value |
|---|---|
| Dashboard | https://platform.openai.com/ |
| API base | `https://api.openai.com/v1/` |
| Used by | [apps/web/src/lib/ai/custom-tools.ts](../apps/web/src/lib/ai/custom-tools.ts) (`generate_image` tool only) |

### What we depend on it for

- Image generation as a custom tool exposed to Claude agents
  (`/v1/images/generations`). Anthropic doesn't ship native image
  generation, so we wrap OpenAI's endpoint as one of the agent tools.

### Functions we built on top

- `generate_image` Anthropic-style tool definition. When Claude decides
  to generate an image, our handler calls OpenAI and returns the image
  URL/data back to the model.

### Required configuration

**Environment variables**:
- `OPENAI_API_KEY` — server-side only. Optional — if missing, the tool
  returns an error message and the agent moves on.

---

## 5. Stripe — Subscriptions + credit packs

| Field | Value |
|---|---|
| Dashboard | https://dashboard.stripe.com/ |
| SDK | `stripe` (Node), no client-side `@stripe/stripe-js` today |

### What we depend on it for

- Subscription billing (Basic $9.99/mo, Pro $19.99/mo).
- One-time credit-pack purchases ($5 small, $20 medium, $50 large).
- Customer portal for self-serve plan changes / cancellation.
- Webhook events that drive `user_quotas` state changes.

### Functions we built on top

- Tier config + price-id mapping:
  [apps/web/src/lib/stripe/config.ts](../apps/web/src/lib/stripe/config.ts).
- Checkout session creation:
  [apps/web/src/app/api/billing/checkout/route.ts](../apps/web/src/app/api/billing/checkout/route.ts).
  Passes `kind=subscription|credits` through `success_url` so the
  account page can verify before showing the success banner.
- Customer portal redirect:
  [apps/web/src/app/api/billing/portal/route.ts](../apps/web/src/app/api/billing/portal/route.ts).
- Webhook handler:
  [apps/web/src/app/api/webhooks/stripe/route.ts](../apps/web/src/app/api/webhooks/stripe/route.ts).
  Reacts to `customer.subscription.created/updated/deleted`,
  `checkout.session.completed` (for credit packs), and
  `invoice.payment_succeeded` (resets monthly allowance counter).

### Required configuration

**Environment variables**:
- `STRIPE_SECRET_KEY` (live) — server-side.
- `STRIPE_WEBHOOK_SECRET` (live) — must match the live-mode webhook
  endpoint signing secret.
- Five Stripe price IDs:
  `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PRO`,
  `STRIPE_PRICE_CREDITS_SMALL`, `STRIPE_PRICE_CREDITS_MEDIUM`,
  `STRIPE_PRICE_CREDITS_LARGE`.

**Dashboard setup**:
- Products: 2 subscriptions + 3 one-time credit packs created.
- Customer Portal configured (Settings → Billing → Customer portal).
- ⚠️ **Webhook endpoint MUST be the production domain
  `https://yoboss.ai/api/webhooks/stripe`** — never a Vercel
  preview URL like `yoboss-xxx.vercel.app`. When the apex domain is
  changed, this URL is the most-likely thing to forget. Real symptom
  if wrong: user pays, sees "Payment successful" banner on /account,
  but `tier` stays `free` forever (webhook never fires).
- Webhook subscribed to: `customer.subscription.created/updated/deleted`,
  `checkout.session.completed`, `invoice.payment_succeeded`.
- **Both test and live mode** have separate webhook endpoints + signing
  secrets — pick the right one per environment.

---

## 6. Resend — Email (outbound + inbound)

| Field | Value |
|---|---|
| Dashboard | https://resend.com/emails |
| SDK | `resend` |
| Sending domain | `mail.yoboss.ai` (subdomain — see "Why subdomain" below) |
| Receiving domain | `mail.yoboss.ai` |
| SMTP relay | Used as Supabase Auth's Custom SMTP (auth emails go through here too) |

### What we depend on it for

**Outbound (sending)**:
- Daily digest emails.
- Weekly summary emails.
- Feedback notifications (when a user submits feedback in-app).
- Unsubscribe confirmations.

**Inbound (receiving)**:
- `contact@mail.yoboss.ai` — collects user emails sent from the footer
  Contact link.
- Replies and other inbound messages routed to `mail.yoboss.ai` show up
  under Resend → Emails → Receiving.

### Functions we built on top

- [apps/web/src/lib/email/daily-digest.ts](../apps/web/src/lib/email/daily-digest.ts) —
  composes + sends the daily digest.
- [apps/web/src/app/api/email/unsubscribe/route.ts](../apps/web/src/app/api/email/unsubscribe/route.ts) —
  HMAC-token-protected unsubscribe link landing page.
- Contact link in landing-page footer points at `mailto:contact@mail.yoboss.ai`.
- Acts as Supabase's Custom SMTP relay (see Supabase section). When a
  user signs up / requests a magic link / resets password, that email
  also flows through Resend.

### Why subdomain (`mail.yoboss.ai`) instead of apex (`yoboss.ai`)

We send and receive on `mail.yoboss.ai`, **not** the apex `yoboss.ai`.
Reasons:

- **Reputation isolation** — if transactional email gets flagged, only
  the subdomain takes the hit; main `yoboss.ai` reputation stays clean.
- **Apex MX conflicts** — apex MX records can interfere with
  Vercel-hosted apex's other DNS responsibilities. Subdomain dodges it.
- **Industry pattern** — Notion uses `email.notion.so`, Airbnb uses
  `m.airbnb.com`, Stripe uses `e.stripe.com`. Users don't notice; ops
  is cleaner.
- **Lesson learned**: Supabase SMTP first failed with
  `550 The yoboss.ai domain is not verified` because the sender was
  set to `noreply@yoboss.ai` — apex was never added to Resend, only
  the subdomain. **Always send from `noreply@mail.yoboss.ai` or
  another verified subdomain mailbox**, never the apex.

### Required configuration

**Environment variables**:
- `RESEND_API_KEY` — server-side.
- `EMAIL_FROM` — display name + sending address. Must be on a verified
  Resend domain.
- `EMAIL_UNSUB_SECRET` — HMAC secret for signed unsubscribe links.
  Random ≥32 chars.
- `FEEDBACK_NOTIFY_EMAIL` (optional) — where in-app feedback gets
  forwarded.

**Dashboard setup**:
- `mail.yoboss.ai` verified for **both sending and receiving** in
  Resend → Domains. DKIM + SPF (outbound) and MX (inbound) all green.
- Receiving on `mail.yoboss.ai` enabled (MX records pointing at
  Resend).
- SMTP credentials (host `smtp.resend.com`, port `465`, user `resend`,
  password = Resend API key) plugged into Supabase → Authentication →
  Emails → SMTP Settings.

---

## 7. Sentry — Error monitoring

| Field | Value |
|---|---|
| Dashboard | https://sentry.io/ |
| SDK | `@sentry/nextjs` |
| Config files | [instrumentation.ts](../apps/web/src/instrumentation.ts), [instrumentation-client.ts](../apps/web/src/instrumentation-client.ts), [sentry.server.config.ts](../apps/web/src/sentry.server.config.ts), [sentry.edge.config.ts](../apps/web/src/sentry.edge.config.ts) |

### What we depend on it for

- Catches unhandled exceptions in browser + server + edge runtimes.
- Source-mapped stack traces for production builds.
- Optional: performance traces, replay (configurable in instrumentation
  files).

### Functions we built on top

- Auto-init via Next.js instrumentation hooks — no per-route code
  needed.
- `app/global-error.tsx` reports global React errors.

### Required configuration

**Environment variables**:
- `NEXT_PUBLIC_SENTRY_DSN` — public DSN, browser-readable.
- `SENTRY_DSN` — server-side DSN (often the same value).
- `SENTRY_AUTH_TOKEN` (build-time) — for source-map upload during
  Vercel build (set as a Vercel env var, NOT committed).

**Dashboard setup**:
- Project type: Next.js.
- Source map upload integration linked to the GitHub repo.
- (Optional) Alert rules — e.g. "more than 10 errors/min from
  /api/webhooks/stripe" pages someone.

---

## 8. Upstash Redis — Per-user rate limiting

| Field | Value |
|---|---|
| Dashboard | https://console.upstash.com/ |
| SDK | `@upstash/ratelimit`, `@upstash/redis` |
| Used by | [apps/web/src/lib/ai/rate-limit.ts](../apps/web/src/lib/ai/rate-limit.ts) |

### What we depend on it for

- Sliding-window rate limiting per `user_id:route` key, in front of
  every AI route. Without this, a single client can blast Anthropic
  faster than the monthly allowance check can debit.

### Functions we built on top

- `withRateLimit(userId, route)` enforces a per-route per-minute cap
  before the request reaches Anthropic. Limits live in `ROUTE_LIMITS`
  map (e.g. agent-chat 15/min, workflow-execute 5/min).
- Falls back to "no per-minute limit" silently if env vars are missing —
  monthly allowance still enforced.

### Required configuration

**Environment variables**:
- `UPSTASH_REDIS_REST_URL` — REST API URL (NOT the `redis://` protocol
  URL).
- `UPSTASH_REDIS_REST_TOKEN` — REST API token.

**Dashboard setup**:
- Database type: Regional (cheaper than Global; Global is overkill).
- Region close to Vercel (us-east-1 if Vercel is iad1).
- Free tier (10K req/day) is enough for current scale.

---

## 9. Google Cloud — OAuth provider (via Supabase)

| Field | Value |
|---|---|
| Dashboard | https://console.cloud.google.com/ |
| Used by | Supabase Auth → Google sign-in |

### What we depend on it for

- "Sign in with Google" button on the auth modal — the only OAuth
  provider configured today.

### Functions we built on top

- Supabase Auth handles the OAuth dance; the app just calls
  `supabase.auth.signInWithOAuth({ provider: "google" })`.

### Required configuration

**Dashboard setup**:
- Google Cloud Console project (any name).
- APIs & Services → Credentials → OAuth 2.0 Client ID:
  - Authorized JavaScript origins: `https://yoboss.ai`.
  - Authorized redirect URIs: the Supabase project's
    `https://nykgbgddhmyksmotdsaq.supabase.co/auth/v1/callback`.
- Copy Client ID + Client Secret into Supabase Auth → Providers → Google.

### Why no `GOOGLE_CLIENT_SECRET` env var?

This is the **intended pattern**, not an oversight. With Supabase as
the auth gateway, the OAuth token exchange happens entirely between
Supabase's servers and Google — the Next.js app never sees the secret
and never needs it:

```
Browser → Supabase Auth → Google → Supabase Auth → Browser → Next.js
                  ↑          ↑
              this hop uses client_secret (server-to-server)
              and never leaves Supabase's backend
```

The app code is just one line:

```ts
supabase.auth.signInWithOAuth({ provider: "google" });
```

If you're used to NextAuth.js / rolling your own OAuth, you'd put the
secret in env vars. Here it lives in Supabase Auth → Providers →
Google config and never leaves Supabase's backend. Don't try to
"add" `GOOGLE_CLIENT_SECRET` to env — it would do nothing.

---

## 10. Google Fonts — Inter typeface

| Field | Value |
|---|---|
| URL | https://fonts.google.com/specimen/Inter |
| Used by | [apps/web/src/app/layout.tsx](../apps/web/src/app/layout.tsx) |

### What we depend on it for

- The `Inter` font, loaded via `next/font/google`. Next.js fetches at
  build time and self-hosts the resulting WOFF2 from our domain — no
  runtime dependency on Google Fonts servers, no PII leaked to Google
  on page load.

No env vars or dashboard. Listed for completeness.

---

## Quick env-var checklist

When provisioning a new environment (Vercel Production, Preview, or a
fresh local checkout), set:

| Var | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `DATABASE_URL` | Supabase → Settings → Database (Session pooler) |
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys |
| `OPENAI_API_KEY` | OpenAI → API Keys (optional) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint signing secret |
| `STRIPE_PRICE_BASIC` / `_PRO` | Stripe → Products |
| `STRIPE_PRICE_CREDITS_SMALL` / `_MEDIUM` / `_LARGE` | Stripe → Products |
| `RESEND_API_KEY` | Resend → API Keys |
| `EMAIL_FROM` | Verified sending address (e.g. `YoBoss <hello@yoboss.ai>`) |
| `EMAIL_UNSUB_SECRET` | Random ≥32 chars |
| `FEEDBACK_NOTIFY_EMAIL` | Whatever inbox you check (optional) |
| `ADMIN_EMAILS` | Comma-separated list of admin user emails |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Sentry → Settings → Client Keys |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Upstash → Database → REST API |
| `CRON_SECRET` | Random; set the same value on Vercel cron headers |
| `NEXT_PUBLIC_APP_URL` | `https://yoboss.ai` (Production), `http://localhost:3000` (local) |

---

## Service-failure runbook

| If this is down… | Symptom | Mitigation |
|---|---|---|
| Vercel | Whole site 500 | Check Vercel status; nothing app-side fixes it |
| Supabase | All API routes 500 | Status page; if extended, communicate via X / banner |
| Anthropic | AI features fail | Surface a "AI temporarily unavailable" message; non-AI features still work |
| OpenAI | `generate_image` agent tool fails | Tool returns error, agent continues without image |
| Stripe | Checkout fails | New subscriptions can't be made; existing subs unaffected |
| Resend | Outbound emails queued | Daily digest delayed but no user impact; inbound emails bounce |
| Sentry | No error reports | Doesn't affect users; just lose observability briefly |
| Upstash | Rate limiter errors → 500 | **Known issue**: should be made fail-open; tracked as backlog item |
| Google OAuth | Sign-in with Google fails | Email/password sign-in still works |
