# YoBoss — Project Conventions for Claude

## Workflow

- **NEVER `git push` without explicit user instruction.** Commit locally, list test points for the user, wait for them to verify on their dev server, only then push when told.
- Local testing may bypass user signup/login auth — assume the user is OK with skipping auth gates when verifying UI changes locally.
- Run typecheck and production build from `apps/web/` (not project root):
  - `cd apps/web && npx tsc --noEmit`
  - `cd apps/web && npx next build`

## Dev auth bypass

For browser-based automation (preview tools, headless QA), enable the
auto-login route in `apps/web/.env.local` ONLY:

```
DEV_AUTH_BYPASS=1
DEV_AUTH_BYPASS_EMAIL=<existing supabase auth user email>
DEV_AUTH_BYPASS_PASSWORD=<that user's password>
```

When all three are set AND `NODE_ENV !== "production"`, the middleware
redirects unauthenticated requests through
[apps/web/src/app/api/dev/auto-login/route.ts](apps/web/src/app/api/dev/auto-login/route.ts),
which calls `signInWithPassword` to mint a real Supabase session for that
test user, then redirects to the original path.

**Never set these env vars on Vercel / production.** The route itself
short-circuits to 404 when `NODE_ENV === "production"` regardless, but
the policy is "don't even configure them there" so there's no chance of
accidental exposure.

## Database migrations

`supabase/migrations/*.sql` are applied automatically on every Vercel deploy by
[apps/web/scripts/apply-migrations.mjs](apps/web/scripts/apply-migrations.mjs),
wired into `vercel-build`. Tracking is in `public._migrations`; each file runs
at most once, stops on first failure. Adding a new migration: drop the file in
`supabase/migrations/`, commit, push — next deploy picks it up.

Local/one-off: `DATABASE_URL=... npm run db:migrate`. First-time setup on a
pre-existing DB: `npm run db:baseline` marks every current file as applied
without running it, so only future files execute.

Vercel env: set `DATABASE_URL` on Production to the Session-pooler URI from
Supabase → Database → Connection string (remember to URL-encode `@` etc. in
the password).
