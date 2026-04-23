# YoBoss — Project Conventions for Claude

## Workflow

- **NEVER `git push` without explicit user instruction.** Commit locally, list test points for the user, wait for them to verify on their dev server, only then push when told.
- Local testing may bypass user signup/login auth — assume the user is OK with skipping auth gates when verifying UI changes locally.
- Run typecheck and production build from `apps/web/` (not project root):
  - `cd apps/web && npx tsc --noEmit`
  - `cd apps/web && npx next build`

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
