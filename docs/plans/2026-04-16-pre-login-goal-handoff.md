# Pre-Login Goal Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve the goal text a visitor types on the landing page across sign-in / sign-up, then pre-fill it into the GoalInput on `/goals/create` so one more Enter press drops them into goal creation chat.

**Architecture:** `landing-page.tsx` already writes `sessionStorage.pendingGoal` on submit. Add the read side: auth success → redirect to `/goals/create` when `pendingGoal` exists (instead of `/dashboard`); the create page reads + clears the key on mount and seeds `goalText`. Uses `sessionStorage` to avoid URL-leaking the goal text and to keep the diff minimal.

**Tech Stack:** Next.js 16 App Router, React client components, Supabase auth client, `window.sessionStorage`.

**Design doc:** `docs/plans/2026-04-16-pre-login-goal-handoff-design.md`

**Scope exclusions:**
- Email-confirmation-link signup (the email link opens a new tab; `sessionStorage` is per-tab so `pendingGoal` is lost). Affected user lands on `/dashboard`, same as today.
- Auto-submitting the pre-filled goal (user explicitly wants to see it and press Enter themselves).

---

### Task 1: Pre-fill `/goals/create` from `sessionStorage.pendingGoal`

**Files:**
- Modify: `apps/web/src/app/(app)/goals/create/page.tsx`

**Step 1: Add a mount effect that consumes the pending goal**

At the top of the `CreateGoalPage` component body, right after the existing `useState` declarations (after line 24, the `draftListRefresh` state), add:

```ts
// One-shot handoff from the marketing landing page: if the visitor
// typed a goal before signing in, sessionStorage.pendingGoal holds it.
// Read + clear it on first render so the input below renders
// pre-filled. Wrapped in try/catch because sessionStorage throws on
// some incognito / privacy configurations.
useEffect(() => {
  try {
    const pending = window.sessionStorage.getItem("pendingGoal");
    if (pending) {
      setGoalText(pending);
      window.sessionStorage.removeItem("pendingGoal");
    }
  } catch {
    // Storage unavailable — nothing to do, user starts with an empty input.
  }
}, []);
```

Also update the imports at the top of the file — add `useEffect` to the existing React import:

Before:
```ts
import { useState } from "react";
```

After:
```ts
import { useState, useEffect } from "react";
```

**Step 2: Typecheck**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: clean.

**Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/goals/create/page.tsx
git commit -m "feat(goals): pre-fill create page input from sessionStorage.pendingGoal"
```

---

### Task 2: Redirect post-auth to `/goals/create` when a pending goal exists

**Files:**
- Modify: `apps/web/src/components/landing/auth-modal.tsx`

**Context:** There are three redirect sites in the current file:
1. Line 68 — Google OAuth `redirectTo` includes `?next=/dashboard`.
2. Line 96 — Email signup `emailRedirectTo` includes `?next=/dashboard`. Users click this from an email in a possibly-new tab, so `sessionStorage.pendingGoal` is not reliably available. Leave this as-is.
3. Line 128 — Email/password login does `window.location.href = "/dashboard"`.

We branch 1 and 3 based on `sessionStorage.pendingGoal`. Both happen in the same tab so the storage is guaranteed available.

**Step 1: Add a helper to pick the post-auth destination**

Near the top of `AuthModal` component body (right after the `useEffect` at line 42-46), add:

```ts
// Read-only probe — the /goals/create page is responsible for clearing
// the key after it consumes it. We just need to know "was a goal typed
// before login?" to pick the right redirect destination.
const postAuthDestination = (): string => {
  try {
    return window.sessionStorage.getItem("pendingGoal")
      ? "/goals/create"
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
};
```

**Step 2: Update Google OAuth redirect**

Current (line 67-69):
```ts
options: {
  redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
},
```

Replace with:
```ts
options: {
  redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(postAuthDestination())}`,
},
```

**Step 3: Update email/password login redirect**

Current (line 128):
```ts
window.location.href = "/dashboard";
```

Replace with:
```ts
window.location.href = postAuthDestination();
```

**Step 4: Leave signup email redirect alone**

Line 96's `emailRedirectTo` stays at `?next=/dashboard` — see Scope Exclusions in the design doc. Do NOT change it.

**Step 5: Typecheck**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: clean.

**Step 6: Commit**

```bash
git add apps/web/src/components/landing/auth-modal.tsx
git commit -m "feat(auth): route to /goals/create after login when pendingGoal is set"
```

---

### Task 3: Manual end-to-end verification

No automated tests — this is a client-side flow verification.

**Step 1: Start dev server (if not already running)**

```bash
npm run dev
```

(Dev server is likely already on localhost:3000 per earlier commits in this session.)

**Step 2: Scenario A — Email/password login with pending goal**

1. Open `/` in an incognito window
2. Type "lose 30 lbs in 6 months" in the landing input, press Enter (or click submit)
3. Auth modal opens. Switch to "Log in" if needed; enter an existing test account
4. Expect: after successful login, URL becomes `/goals/create` with the input pre-filled with "lose 30 lbs in 6 months"
5. Expect: `sessionStorage.pendingGoal` is gone (check in DevTools Application tab)
6. Press Enter → goal creation chat starts

**Step 3: Scenario B — Google OAuth with pending goal**

1. Fresh incognito window, open `/`
2. Type a goal, submit
3. Click "Continue with Google", complete the OAuth flow
4. Expect: after the `/auth/callback` round-trip, you land on `/goals/create` with input pre-filled

**Step 4: Scenario C — Login without pending goal (regression)**

1. Open `/` in incognito (don't type anything)
2. Click Login directly
3. Sign in
4. Expect: land on `/dashboard` (original behavior preserved)

**Step 5: Scenario D — Storage unavailable (defensive)**

1. Open DevTools, throw an error from `window.sessionStorage.getItem` via a console override
2. Navigate around — expect no uncaught exceptions from either the landing page or `/goals/create`

**Step 6: If any scenario fails**

Use @superpowers:systematic-debugging. Return to the failing task. Do NOT patch forward.

**Step 7: Commit the verification note**

```bash
git commit --allow-empty -m "test(auth): verified pre-login goal handoff scenarios A-D"
```

---

## Risk Notes

- **Multiple tabs, racing sign-ins**: If the user opens two tabs, types a different goal in each, and signs in on one — the other tab's `sessionStorage.pendingGoal` is untouched (it's per-tab). Each tab consumes its own value. No cross-tab interference. ✓
- **User cancels auth modal**: `pendingGoal` stays in `sessionStorage` until the tab closes. If they re-open the modal and sign in later, they still get pre-fill. ✓
- **User already logged in when they visit `/`**: Landing's `handleSubmitGoal` still writes `pendingGoal` and opens the modal (it doesn't early-return on `loggedIn`). That's the existing behavior — not in scope for this change, but the writer + reader contract still works correctly if the flow ever changes.
- **Stale pending goal on future visits**: `sessionStorage` clears on tab close. If the user abandons without signing in and comes back in a new tab later, they start fresh. ✓

## Done Criteria

1. TypeScript clean (`npx tsc -p apps/web/tsconfig.json --noEmit`).
2. Three commits: one for the create-page pre-fill, one for the auth-modal redirect, one empty verification marker.
3. Scenarios A, B, C pass manually. D is a defensive smoke — pass = no uncaught error.
