# YoBoss — Project Conventions for Claude

## Workflow

- **NEVER `git push` without explicit user instruction.** Commit locally, list test points for the user, wait for them to verify on their dev server, only then push when told.
- Local testing may bypass user signup/login auth — assume the user is OK with skipping auth gates when verifying UI changes locally.
- Run typecheck and production build from `apps/web/` (not project root):
  - `cd apps/web && npx tsc --noEmit`
  - `cd apps/web && npx next build`
