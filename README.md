# YoBoss

AI goal coaching web app. Describe a goal, get a phased roadmap, a weekly
plan, and a small team of digital "employees" that plan and ship work
alongside you.

Live: [yoboss.ai](https://yoboss.ai)

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui |
| Backend | Next.js Route Handlers + Server Actions |
| Database / Auth | Supabase (Postgres, Auth, Storage) |
| AI | Anthropic Claude (Opus / Sonnet) via `@anthropic-ai/sdk` |
| Payments | Stripe (subscriptions + credit packs) |
| Email | Resend (transactional + weekly digests) |
| Push | Web Push (VAPID) with email fallback |
| Rate limiting | Upstash Redis |
| Observability | Sentry |
| i18n | next-intl (en, es, fr, pt) |
| Hosting | Vercel |

## Repo layout

```
.
├── apps/
│   └── web/                 # Next.js app — the only app today
│       ├── src/app/         # App Router (route groups: (app), (marketing), api/)
│       ├── src/components/  # UI components
│       ├── src/lib/         # ai/, db/, stripe/, types/, utils/
│       ├── messages/        # next-intl locale files (en, es, fr, pt)
│       └── scripts/         # apply-migrations.mjs
├── supabase/
│   └── migrations/          # numbered SQL — applied in order on every deploy
├── package.json             # npm workspaces root
└── ...
```

The repo is a npm workspaces monorepo. `packages/` is reserved for future
shared code; today everything ships from `apps/web`.

## Local development

Prereqs: Node 20+, npm, a Supabase project, an Anthropic API key.

```bash
git clone https://github.com/terryxdguan/goalweek.git
cd goalweek
npm install
cp apps/web/.env.local.example apps/web/.env.local
# fill in the keys — see "Environment" below
cd apps/web
npm run dev
```

Open http://localhost:3000.

### Environment

`apps/web/.env.local` (see `.env.local.example` for the canonical list):

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Stripe (live or test)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_BASIC=
STRIPE_PRICE_PRO=
STRIPE_PRICE_CREDITS_SMALL=
STRIPE_PRICE_CREDITS_MEDIUM=
STRIPE_PRICE_CREDITS_LARGE=

# Resend
RESEND_API_KEY=
EMAIL_FROM="YoBoss <hello@yourdomain.com>"
EMAIL_UNSUB_SECRET=

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Dev-only auto-login

For browser automation / headless QA, three env vars enable a one-route
auto-login flow:

```
DEV_AUTH_BYPASS=1
DEV_AUTH_BYPASS_EMAIL=<existing supabase auth user email>
DEV_AUTH_BYPASS_PASSWORD=<that user's password>
```

When all three are set **and** `NODE_ENV !== "production"`, middleware
redirects unauthenticated requests through `/api/dev/auto-login`, which
calls `signInWithPassword` to mint a real Supabase session, then bounces
to the original path. The route itself 404s in production regardless of
env. **Never set these on Vercel.**

## Database migrations

Migrations live in `supabase/migrations/*.sql`. They run in lexical order
and each file applies at most once. Tracking is in `public._migrations`.

| Command | When |
|---|---|
| `npm run db:migrate` (from `apps/web/`) | Apply pending migrations against `DATABASE_URL` |
| `npm run db:baseline` | First-time on a pre-existing DB — marks every current file as applied without running it |

On Vercel the migrate runs automatically as part of `vercel-build` before
`next build`. Adding a new migration: drop the `.sql` file in
`supabase/migrations/`, commit, push — the next deploy picks it up.

Set `DATABASE_URL` on Vercel Production to the Session-pooler URI from
Supabase → Database → Connection string (URL-encode special characters
in the password).

## Build / typecheck

Run from `apps/web/`, not the repo root:

```bash
cd apps/web
npx tsc --noEmit       # typecheck
npx next build         # production build
```

## Deploying

Vercel watches `main`. Each deploy runs `npm run vercel-build`, which
applies pending migrations and then builds. The Stripe webhook endpoint
is `https://<your-domain>/api/webhooks/stripe` — register it in Stripe
Dashboard → Developers → Webhooks (separately for test and live mode)
and copy each signing secret into `STRIPE_WEBHOOK_SECRET` for the
matching environment.

## License

Source-available; no public license granted yet. Contact the repo owner
before reuse.
