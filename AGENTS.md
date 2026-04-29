# YoBoss — Project Conventions for Codex

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

## Design system

Use these tokens for any new page or component. CSS variables that follow
this palette already live in
[apps/web/src/app/globals.css](apps/web/src/app/globals.css) (`--primary`,
`--accent-blue`, `--accent-soft`, `--ring`). Prefer the variables when
possible; otherwise use the hex values directly.

### Colors

| Role                          | Hex / value                                   | Notes                                           |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------- |
| **Primary blue**              | `#007AFF`                                     | Primary button fill, secondary border, accents. |
| Primary blue (hover)          | `#0066D6`                                     | Hover state for primary buttons.                |
| Primary blue (soft tint)      | `#E6F2FF`                                     | Light fill behind primary text/icons.           |
| Primary blue (disabled)       | `#007AFF` at opacity `0.3` (or `bg-[#007AFF]/30`) | Disabled primary buttons.                   |
| **Toggle — selected**         | `#69B2FF`                                     | e.g., the active half of a Pending/Done pill.   |
| **Toggle — unselected**       | `#F5F5F5`                                     | Inactive half background.                       |
| Toggle — selected text        | `#FFFFFF`                                     |                                                 |
| Toggle — unselected text      | `rgba(0,0,0,0.6)`                             |                                                 |
| **Status — Paused**           | text `#FE4435`, bg `#FE4435` at `0.12`        | Use for archived/paused goals.                  |
| **Status — Done**             | text `#08A200`, bg `#08A200` at `0.12`        | Use for completed goals.                        |
| **Status — In Progress**      | text `#E09226`, bg `#E09226` at `0.12`        | Use for active goals.                           |
| **Body text (primary)**       | `rgba(0,0,0,0.6)` (`text-[#000000]/60`)       | Default body text on cream background.          |
| Body text (emphasized)        | `rgba(0,0,0,0.85)` (`text-[#000000]/85`)      | Underlined links, dropdown items, etc.          |

12% bg alpha = `1F` in hex — e.g., `#FE44351F`. In Tailwind: `bg-[#FE4435]/[0.12]`
or inline `style={{ backgroundColor: '#FE44351F' }}`.

### Buttons

- **Primary (filled):** `bg-[#007AFF] text-white rounded-full font-semibold`,
  hover `bg-[#0066D6]`, drop shadow `shadow-[0_2px_8px_rgba(0,122,255,0.25)]`.
  Use sparingly — usually one per section. Add a leading `+` icon for
  create/add actions ("+ Add", "+ Create New", "+ Hire New").
- **Primary (disabled):** same shape, `bg-[#007AFF]/30 text-white/70 cursor-not-allowed`,
  no shadow.
- **Secondary / "View All" (outlined):** `bg-white text-[#007AFF] border border-[#007AFF] rounded-full`.
  Sits next to a primary button as an alternate action.
- **Text button:** plain blue text, no background — `text-[#007AFF] hover:text-[#0066D6]
  font-medium`. Optional leading icon (e.g., `RefreshCw` for "Regenerate",
  "▶" for "Start"). Use for inline secondary actions.
- **Underlined link:** dark text + underline — `text-[#000000]/85 font-semibold
  underline underline-offset-4`. Active state flips to `text-[#007AFF]`.

### Toggles

A two-segment pill where the selected half is filled `#69B2FF`/white-text
and the unselected half is `#F5F5F5`/`text-[#000000]/60`. Both halves share
the same outer rounded-full container.

### Status badges

Small rounded-full pill, `text-xs font-medium px-2.5 py-1`, background at 12%
of the status color and foreground at 100%. Use the helper
`getGoalStatusBadge` in [apps/web/src/app/(app)/goals/[id]/page.tsx](apps/web/src/app/(app)/goals/[id]/page.tsx)
for the canonical mapping (`active → In Progress`, `completed → Done`,
`archived → Paused`).
