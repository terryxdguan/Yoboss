# Landing Page & Onboarding Redesign — Design Spec

**Date:** 2026-05-09
**Status:** Approved (pending implementation plan)

## Goal

Replace the current home page hero (textarea + example chips + 6-card features section) with a calmer marketing layout: hero illustration, three large feature cards with their own illustrations, and a single centered "Get Started" button that opens a modal goal-picker.

The picker funnels every visitor into the AI roadmap-creation flow in fewer steps:

- **Old flow:** landing textarea → AuthModal → `/dashboard` → onboarding-dashboard pre-fills another textarea → user clicks "Create roadmap" → `/goals` → wizard auto-starts.
- **New flow:** landing → Get Started → picker (example chip _or_ Customize input) → AuthModal (only if logged-out) → `/goals` → wizard auto-starts. Dashboard onboarding is bypassed for visitors arriving through the picker.

## Non-goals

- No change to `GoalWizardPanel`, `/goals/[id]`, the wizard's auto-start logic, or anything downstream of `/goals?...&pendingGoal in cookie`.
- No change to `/dashboard`'s onboarding-dashboard for users arriving via other entry points (direct link, `Sign Up` nav button, dashboard "Create new goal" button). They keep the existing behavior.
- No copy changes to existing example goal text (`landing.examples.*`).
- No change to AuthModal email/password validation, Google OAuth, password strength meter, or the /auth/confirm + /auth/callback routes' core behavior. Only the post-auth destination becomes parameterizable.

---

## Component Inventory

| Component | Status | Notes |
|---|---|---|
| `apps/web/src/components/landing/landing-page.tsx` | Modified | Drop `<GoalInput>` and `<ExampleGoals>`, drop the 6-feature-cards section, add 3 large cards + Get Started button + picker state |
| `apps/web/src/components/landing/get-started-modal.tsx` | New | Two-view picker: example grid → Customize textarea. Calls back to parent with the chosen goal text |
| `apps/web/src/components/landing/landing-feature-card.tsx` | New | Single card primitive used by all 3 (title + body + slot for SVG illustration) |
| `apps/web/src/components/landing/illustrations/RoadmapIllustration.tsx` | New | Pure SVG/Tailwind: rising path with milestones + flag + "This week" mini-calendar with task chips |
| `apps/web/src/components/landing/illustrations/SpecialistsIllustration.tsx` | New | 6 role pills around a central "Your goal" node with dashed connectors |
| `apps/web/src/components/landing/illustrations/DeliverablesIllustration.tsx` | New | PDF/XLSX/DOC trio → arrow → terminal window with mock code + "Run & deliver" badge |
| `apps/web/src/components/landing/auth-modal.tsx` | Modified | Add optional `nextPath` prop; thread through OAuth `redirectTo`, signup `emailRedirectTo`, and password-login `window.location.href` |
| `apps/web/src/components/landing/goal-input.tsx` | Reused as-is in picker's Customize view | Already supports Tab autofill + Enter submit |
| `apps/web/src/components/landing/example-goals.tsx` | Unchanged | Still consumed by `onboarding-dashboard.tsx` indirectly via `EXAMPLES`/i18n keys |
| `apps/web/src/lib/pending-goal.ts` | Unchanged | Cookie + sessionStorage helpers continue carrying the goal across auth |
| `apps/web/src/app/(app)/dashboard/page.tsx` | Unchanged | |
| `apps/web/src/components/dashboard/onboarding-dashboard.tsx` | Unchanged | |
| `apps/web/src/app/(app)/goals/page.tsx` | Unchanged | Already auto-opens wizard from cookie |
| `apps/web/src/app/auth/callback/route.ts` | Unchanged | Already supports `?next=` |
| `apps/web/src/app/auth/confirm/page.tsx` | Unchanged | Already supports `next` param |
| `apps/web/messages/{en,es,fr,pt}.json` | Modified | Update feature1/2/3 copy, add `landing.picker.*` keys |

---

## Visual Layout (new landing main)

```
┌─ Nav ─────────────────────────────────────────────────────┐
│ YoBoss   Features  Pricing            Lang  Login Sign Up │
└───────────────────────────────────────────────────────────┘

         [hero illustration — existing /hero-illustration.png]
                       [Powered by Claude Opus 4.7]

       Describe your goal and your digital employees
                      plan & execute

  ┌────────────┐  ┌────────────┐  ┌────────────┐
  │ 🚩 title   │  │ 🗓 title   │  │ 📄 title   │
  │ body...    │  │ body...    │  │ body...    │
  │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │
  │ │ SVG #1 │ │  │ │ SVG #2 │ │  │ │ SVG #3 │ │
  │ └────────┘ │  │ └────────┘ │  │ └────────┘ │
  └────────────┘  └────────────┘  └────────────┘

                    [ Get Started ]   ← centered, blue

┌─ Footer ──────────────────────────────────────────────────┐
```

Tailwind shape: `grid grid-cols-1 md:grid-cols-3 gap-5 max-w-6xl mx-auto`. Each card `rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-6` with hover lift consistent with existing feature cards. Illustration sits in a `aspect-[4/3]` slot.

Get Started button: `bg-[#007AFF] text-white px-8 py-3 rounded-full font-semibold` matching the screenshot's pill shape.

---

## Get-Started Modal

### State machine

```
closed ──open()──▶ examples ──pickExample()──▶ submit
                       │
                       └──clickCustomize()──▶ customize ──submit()──▶ submit
                                                │
                                                └──back()──▶ examples
```

The picker's only exit is calling its `onSubmit(text)` prop. The picker itself is presentation-only — it does not touch `pendingGoal`, the router, or AuthModal. The parent (`LandingPage`) owns the post-submit flow:

```ts
// inside LandingPage
function handlePickerSubmit(text: string) {
  if (!text.trim()) return;
  setPendingGoal(text.trim());
  setPickerOpen(false);
  if (loggedIn) {
    router.push("/goals");
    return;
  }
  setAuthMode("signup");
  setAuthNextPath("/goals");
  setAuthOpen(true);
}
```

Inside the picker, `submit(text)` simply calls `props.onSubmit(text)` and lets the parent decide what happens next. This keeps the picker testable in isolation and avoids the picker importing router/auth concerns.

### Examples view (default)

- Title: `t("picker.title")` — "What's in your mind now?"
- 6-cell grid using `landing.examples.{lose|job|marathon|language|shop|trip}.title` plus their existing icons/colors. Same icon set as `example-goals.tsx`.
- Below the grid, single "Customize" button (full width, secondary style: `border border-[#DDD3C7] bg-transparent`).
- Top-right ✕ closes the modal.

Click on an example chip:
- Sets `selectedKey` only for visual feedback (border highlight + check) for ~120ms.
- Immediately calls `submit(t("examples.<key>.text"))`. There is no separate "Next" step — picking is committing.

### Customize view

- Title: `t("picker.customizeTitle")` — "Describe your goal — your digital employees plan & execute"
- "← Back" link (top-left, returns to examples view; preserves any text typed)
- Reuses the existing `<GoalInput>` component (animated gradient border, textarea, Tab autofill, submit chevron). `onSubmit` calls `submit(text)`.
- Top-right ✕ closes.

### Persistence

- Component-level state (no URL/route change). Closing the modal preserves the typed text inside the picker until the page is unmounted.
- No `pendingGoal` is set until the user actually submits — so closing the picker without picking does NOT trigger the dashboard auto-prefill on a later login.

### Accessibility

- Focus trap inside the modal while open.
- ESC closes.
- Click on the dim overlay closes.
- Examples are real `<button>` elements; Customize textarea autofocuses when its view appears.

---

## AuthModal: `nextPath` Prop

```ts
interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: "login" | "signup";
  onSignupConfirmationSent?: (email: string) => void;
  nextPath?: string;  // NEW — defaults to "/dashboard"
}
```

Implementation changes inside `auth-modal.tsx`:

```ts
const postAuthDestination = (): string => nextPath ?? "/dashboard";
```

The three places it's already used continue to call this helper — no other code change. Specifically:

- **Google OAuth:** `redirectTo: ${origin}/auth/callback?next=<encoded postAuthDestination>` — callback route already validates same-origin paths.
- **Email signup:** `emailRedirectTo: ${origin}<postAuthDestination>` — `/auth/confirm` page already extracts and follows it via `pickDestination(rawNext)`.
- **Email/password login:** `window.location.href = postAuthDestination()`.

LandingPage wires it via a separate `authNextPath` state that's set when the picker drives the auth open, and left undefined when nav's Login/Sign Up buttons trigger it:

```tsx
<AuthModal
  open={authOpen}
  initialMode={authMode}
  nextPath={authNextPath}
  onClose={() => setAuthOpen(false)}
  onSignupConfirmationSent={...}
/>
```

Nav handlers (`openAuth("login")` / `openAuth("signup")`) leave `authNextPath` as `undefined`, so AuthModal falls back to `/dashboard` and returning users keep their expected destination.

---

## Three Illustrations (pure SVG + Tailwind, no image assets)

Each lives as a small React component returning inline SVG/JSX. All reuse the palette already in `landing-page.tsx`: blue `#007AFF`, gold `#C9A968`, green `#7FB38A`/`#9CC4A4`, brown `#9B6B5C`, teal `#7FB3B3`, mauve `#B58FA0`, coral `#D5847A`, parchment `#F1ECE4`/`#FFFDF9`, line `#E7DED2`/`#DDD3C7`, ink `#2B2B2B`/`#6F6A64`/`#9B948B`.

### Roadmap illustration

- Top half (≈55%): inline `<svg viewBox="0 0 200 80">` with a dashed wavy path from bottom-left to top-right, three filled circles along it (blue, green, gold), a small flag icon at the right end (lucide `Flag`).
- Bottom half: rounded card showing a "This week" mini-table — 5 columns (Mon–Fri) with two stacked task chips per column (small rectangles, alternating green/gold/coral), labelled with greek-text bars.
- Reuses existing `<RotateCcw>` icon as a circular re-plan affordance in the corner of the card (purely decorative, low opacity).

### Specialists illustration

- Centered SVG circle layout. One central pill labeled "Your goal" with a generic user icon.
- 6 surrounding pills positioned at evenly-spaced angles, each with its own lucide icon + 1–2 word label:
  - General Assistant (Bot)
  - Content Writer (PenSquare)
  - Market Researcher (Search)
  - This week's plan (Calendar)
  - Shipped yesterday (CheckCircle2)
  - And more (Plus)
- Dashed lines connecting center to each pill, rendered behind via `<svg>` underlay (absolute positioned).

### Deliverables illustration

- Top row: three vertical document tiles labelled "Pitch Deck" (red), "Spreadsheet" (green), "Interview Script" (blue), each using a stylized doc icon (lucide `FileText` tinted) plus the relevant extension chip (PDF/XLSX/DOC) inside.
- Center: small downward arrow with sparkles on either side.
- Bottom: rounded dark terminal window (`bg-[#1E1E1E]` with macOS dot row) containing 3 lines of mock code (gradient gray/blue) and a green "Run & deliver" badge attached to its lower edge.

Each illustration is `<div className="aspect-[4/3] w-full">` so cards keep parity. Components are stateless and don't take props; can be swapped if the user wants to replace later.

---

## i18n Additions

`apps/web/messages/en.json` (and the 3 sister files):

Add under `landing`:
```json
"ctaGetStarted": "Get Started",
"picker": {
  "title": "What's in your mind now?",
  "customize": "Customize",
  "customizeTitle": "Describe your goal — your digital employees plan & execute",
  "back": "Back",
  "closeAria": "Close goal picker"
}
```

Replace existing `feature1Title/Body`, `feature2Title/Body`, `feature3Title/Body` with the new card copy:

| Key | New value |
|---|---|
| `feature1Title` | "Turn any ambition into a clear, adaptive plan" |
| `feature1Body` | "Get a roadmap and weekly plan with real tasks. We re-plan around life." |
| `feature2Title` | "A team of specialists that remembers your goals" |
| `feature2Body` | "Specialists work together in one space. No re-explaining, ever." |
| `feature3Title` | "Real Deliverables, not just chat" |
| `feature3Body` | "From decks to scripts to spreadsheets — we build it and deliver the file." |

Drop `feature4*`, `feature5*`, `feature6*`, `featuresTitle`, `featuresSubtitle` (no longer rendered). Keep them in JSON files for now to avoid breaking other locales mid-deploy — flag for cleanup as a follow-up.

`es.json`, `fr.json`, `pt.json` get the same keys with translated values. For initial implementation we copy the English values and the user can refine later (existing pattern in this repo).

---

## State Flow Walkthrough

### Path A — anonymous, picks example "Lose 30 lbs"

1. Visit `/`. `loggedIn=false` (Supabase getUser returns null).
2. Click `Get Started`. Picker opens, `pendingGoalForAuth=false`, AuthModal closed.
3. Click "Lose 30 lbs" chip. Picker calls `submit("How to lose 30 lbs (13.6 kg) in 6 months")`.
4. `setPendingGoal()` writes cookie + sessionStorage.
5. Picker closes, parent flips `pendingGoalForAuth=true` and opens AuthModal in `signup` mode.
6. User signs up via email → Supabase sends confirmation → on click → `/auth/confirm?token_hash=...&next=/goals` → verifyOtp → `window.location.replace("/goals")`.
7. `/goals` reads `pendingGoal`, opens `GoalWizardPanel` with `autoStart=true initialGoalText=...`. Wizard fires its first AI call.

### Path B — anonymous, Customize

1. Same up to picker.
2. Click "Customize" → view changes to GoalInput.
3. Type goal, press Enter or submit. Picker calls `submit(text)`.
4. Same as Path A from step 4.

### Path C — already logged in (returning user clicks Get Started)

1. Picker opens.
2. Pick or customize → `submit(text)` → `setPendingGoal()` → `router.push("/goals")`.
3. `/goals` reads cookie → wizard auto-starts. AuthModal never opens.

### Path D — anonymous, clicks nav "Sign Up" instead

1. AuthModal opens with `nextPath=undefined` (so `/dashboard`).
2. After signup → `/dashboard` → onboarding-dashboard (no `pendingGoal` set, so its textarea is empty). Existing flow preserved.

### Path E — Google OAuth from picker

1. Picker → submit() → AuthModal with `nextPath="/goals"`.
2. Click "Continue with Google" → `redirectTo=…/auth/callback?next=%2Fgoals`.
3. Callback exchanges code → `redirect(new URL("/goals", req.url))`.
4. `/goals` reads cookie → wizard.

---

## Edge Cases

- **User submits empty Customize text:** `submit()` early-returns; submit button stays disabled (consistent with existing `<GoalInput>`).
- **User closes picker mid-Customize:** state preserved in component until unmount. `pendingGoal` not yet set, so no leakage to dashboard.
- **AuthModal closed without completing auth:** `pendingGoal` stays in cookie for ~1h. If user later clicks Login from nav and lands on `/dashboard`, the existing `onboarding-dashboard.tsx` reads it and pre-fills the textarea (current behavior). No regression.
- **Browser blocks cookies (private mode):** `pending-goal.ts` falls back to sessionStorage. Same-tab path still works; cross-tab email-confirmation path may lose the goal — same risk as today.
- **Slow auth, user revisits `/`:** existing `loggedIn` effect runs, nav switches to "Dashboard" CTA. Picker still works (Path C).
- **Non-English locales for new feature copy:** initial commit uses English strings as placeholders for es/fr/pt to avoid blank UI. User refines copy later.
- **Resend / different goal:** if user picks a goal, doesn't sign up, then days later returns and picks a different goal — `setPendingGoal` overwrites the cookie. No conflict.

---

## Testing Plan

Manual checklist (no new automated tests; the existing repo doesn't run e2e on this surface):

1. `npm run dev` from `apps/web`. Hit `/`. Verify new layout renders, all 3 illustrations are crisp at desktop and mobile widths.
2. Logged-out: click Get Started → click "Land a new job" → AuthModal opens. Sign up with email → check confirmation flow points back to `/goals` not `/dashboard` → wizard auto-starts on the typed goal.
3. Logged-out: click Get Started → Customize → type "I want to write a book" → submit → AuthModal → continue with Google → after OAuth, lands on `/goals` with the wizard auto-started.
4. Logged-in: click Get Started → pick example → no AuthModal → `/goals` opens with wizard.
5. Logged-out: click nav "Sign Up" (NOT Get Started) → AuthModal opens → sign up → lands on `/dashboard` (NOT `/goals`). Onboarding-dashboard renders normally.
6. Logged-in: nav shows "Dashboard" button; clicking it goes to dashboard.
7. Picker ESC, ✕, overlay-click all close cleanly.
8. Customize → Back → examples view; previously typed text preserved.
9. `cd apps/web && npx tsc --noEmit` passes.
10. `cd apps/web && npx next build` succeeds.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AuthModal change breaks existing nav-button signup flow | `nextPath` is optional with `??"/dashboard"` fallback. Existing call sites that don't pass the prop see no behavior change. |
| Three new SVG illustrations balloon bundle size | Inline SVG is well under 5KB each; no asset bundle changes. |
| Removed feature copy keys break a non-English page | Keep `feature4-6` keys in JSON for now; only stop rendering them. Cleanup deferred. |
| Picker hides Customize input from users who want a free-form goal | Customize button is prominent (full width below the chip grid) and matches the user-supplied screenshot. |
| Returning user clicks "Sign Up" and expects new flow | Sign Up nav button intentionally retains old behavior. Get Started is the documented CTA for the redesign. |

---

## Out of Scope (Followups)

- Removing dead `feature4–6` i18n keys after a release cycle.
- Animations on the 3 illustrations (currently static).
- A/B test of "Get Started" vs old textarea entry.
- Deeper dashboard onboarding overhaul (separate spec).
