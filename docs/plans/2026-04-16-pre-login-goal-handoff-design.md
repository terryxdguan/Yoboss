# Pre-Login Goal Handoff: Design

**Status**: Approved, ready for implementation plan
**Scope**: Landing page goal input should survive login and land the user on `/goals/create` with the input pre-filled.

## Context

The marketing landing page (`/`) invites unauthenticated visitors to type their goal into a prominent input and hit Enter. Today:

1. `landing-page.tsx:22` already writes the text to `sessionStorage.setItem("pendingGoal", text)` and opens the auth modal.
2. After sign-in / sign-up, the auth modal redirects to `/dashboard`.
3. Nothing reads `pendingGoal` back — the user's original goal is silently dropped.

User complaint: the "describe your goal" moment is the single highest-intent action on the landing page. Losing it after login kills conversion.

## Decision

Post-login, if `sessionStorage.pendingGoal` is set, redirect to `/goals/create` (not `/dashboard`). The create page reads + clears the key on mount and pre-fills its `goalText` input state so the user sees their original text waiting for them. One more Enter press drops them into the goal-creation chat.

## Flow

```
Landing (unauth)
  ├─ User types goal
  ├─ Clicks submit
  ├─ sessionStorage.setItem("pendingGoal", text)       ← already exists
  └─ AuthModal opens

AuthModal (success)
  └─ if (sessionStorage.pendingGoal)
       → window.location.href = "/goals/create"
     else
       → window.location.href = "/dashboard"           ← existing behavior

/goals/create (mount)
  ├─ const pending = sessionStorage.getItem("pendingGoal")
  ├─ if (pending) { setGoalText(pending); sessionStorage.removeItem("pendingGoal") }
  ├─ Input renders pre-filled
  └─ User hits Enter → existing handleSubmitGoal → GoalChat
```

## Files Touched (3)

| File | Change |
|------|--------|
| `apps/web/src/components/landing/landing-page.tsx` | None — already writes `sessionStorage.pendingGoal` |
| `apps/web/src/components/landing/auth-modal.tsx` | After auth success, branch on `sessionStorage.pendingGoal`: redirect to `/goals/create` when set, `/dashboard` otherwise |
| `apps/web/src/app/(app)/goals/create/page.tsx` | Mount effect reads `pendingGoal`, seeds `goalText` state, clears the key |

## Edge Cases

- **Incognito / storage disabled**: `sessionStorage` throws or returns null. Wrap reads in try/catch → treat as "no pending goal" and follow the existing redirect path. The landing page already handles this defensively.
- **User abandons auth modal**: `pendingGoal` lives until the tab closes. That's fine — they can resume in the same tab; next fresh tab starts clean.
- **Email-link verification that opens a new tab**: `sessionStorage` is per-tab, so the new tab won't see `pendingGoal`. Accepted for MVP — this affects a minority of signups and the user lands on `/dashboard`, not an error.
- **Double-consumption**: We read + clear on first mount of `/goals/create`. If the user navigates back to landing and forward again, the key is already gone. No duplicate submissions.

## Explicitly Not Doing

- URL fallback (`/goals/create?goal=...`) for the email-confirmation case. Adds encoding/escaping complexity, leaks goal text into browser history, and the affected user base is small. Revisit if analytics show the drop-off.
- Auto-submitting the goal on pre-fill (skipping the Enter press). User explicitly asked for a pre-filled input, not auto-submit — matches the natural typing flow and lets the user edit before committing.
- Server-side persistence. No DB change, no anonymous tokens, no cleanup cron.

## Verification

1. **Happy path**: Open `/` in incognito → type "lose 30 lbs in 6 months" → submit → sign up → expect landing on `/goals/create` with input pre-filled with that text. Press Enter → GoalChat starts.
2. **Already logged in**: Open `/` → type a goal → submit. (Landing's existing behavior: if `loggedIn`, the submit button navigates directly. Not in scope for this change.)
3. **No pending goal**: Open `/` → click "Login" without typing → sign in → expect landing on `/dashboard` (existing behavior preserved).
4. **Storage cleared**: After pre-fill fires once, verify `sessionStorage.pendingGoal` is gone. Refresh `/goals/create` → input is empty.
