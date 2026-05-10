# Landing Page & Onboarding Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page hero (textarea + example chips + 6-card features grid) with a 3-card visual layout and a "Get Started" picker modal that funnels visitors straight into `/goals` after sign-in, bypassing the dashboard onboarding.

**Architecture:** New `get-started-modal.tsx` is a presentation component with two views (examples grid / Customize textarea). Parent `LandingPage` owns the post-submit flow: it sets `pendingGoal` and either pushes to `/goals` (logged-in) or opens AuthModal with a new `nextPath="/goals"` prop (logged-out). AuthModal threads `nextPath` through OAuth `redirectTo`, signup `emailRedirectTo`, and password-login `window.location.href`. Three new SVG/Tailwind illustration components (`RoadmapIllustration`, `SpecialistsIllustration`, `DeliverablesIllustration`) render inside a small `LandingFeatureCard` primitive used by all three cards.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind, next-intl, Supabase (existing auth flow), lucide-react.

**Spec:** [docs/superpowers/specs/2026-05-09-landing-onboarding-redesign-design.md](../specs/2026-05-09-landing-onboarding-redesign-design.md)

---

## File Structure

**Files to create:**

1. `apps/web/src/components/landing/illustrations/roadmap-illustration.tsx` — Card 1 SVG (path + flag + "This week" mini-calendar)
2. `apps/web/src/components/landing/illustrations/specialists-illustration.tsx` — Card 2 SVG (6 role pills around "Your goal" with dashed connectors)
3. `apps/web/src/components/landing/illustrations/deliverables-illustration.tsx` — Card 3 SVG (3 doc tiles → arrow → terminal window with "Run & deliver" badge)
4. `apps/web/src/components/landing/landing-feature-card.tsx` — Reusable card shell (title + body + illustration slot)
5. `apps/web/src/components/landing/get-started-modal.tsx` — Picker modal with two views

**Files to modify:**

1. `apps/web/src/components/landing/auth-modal.tsx` — Add optional `nextPath` prop
2. `apps/web/src/components/landing/landing-page.tsx` — Replace hero/features/example body, wire picker + nextPath
3. `apps/web/messages/en.json` — New `landing.ctaGetStarted`, `landing.picker.*`; rewrite `feature1/2/3*`
4. `apps/web/messages/es.json` — Mirror en (English placeholders for now)
5. `apps/web/messages/fr.json` — Mirror en
6. `apps/web/messages/pt.json` — Mirror en

**Task ordering (each task ends with a commit):**

1. i18n keys
2. AuthModal `nextPath` prop
3. RoadmapIllustration
4. SpecialistsIllustration
5. DeliverablesIllustration
6. LandingFeatureCard primitive
7. GetStartedModal
8. LandingPage rewire
9. Manual browser verification + final typecheck + build

Each task is self-contained and `npx tsc --noEmit` passes after every commit.

---

## Task 1: i18n keys

**Files:**
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/es.json`
- Modify: `apps/web/messages/fr.json`
- Modify: `apps/web/messages/pt.json`

The other locale files mirror English values verbatim per spec ("we copy the English values and the user can refine later"). Existing `feature4/5/6*`, `featuresTitle`, and `featuresSubtitle` keys remain in JSON (only stop being rendered) to avoid breaking other locales mid-deploy.

- [ ] **Step 1: Open en.json and locate the `landing` block (line ~304)**

Edit existing keys in place (lines 315–320) and add new keys.

Replace these lines (use `old_string`/`new_string`):

```json
    "feature1Title": "Turn any ambition into a clear plan",
    "feature1Body": "Tell your team where you want to land. They come back with a phased roadmap and milestones you can edit, reorder, or rip up. The blank-page problem, solved.",
    "feature2Title": "Your week, planned every Monday",
    "feature2Body": "Every Monday your team drafts the week — concrete tasks slotted into real time blocks. Miss a day? They re-plan around it, no guilt trip.",
    "feature3Title": "A team of specialists",
    "feature3Body": "Hire General Assistant, Content Writer, Market Researcher, and more. Each one ships output you can download.",
```

with:

```json
    "feature1Title": "Turn any ambition into a clear, adaptive plan",
    "feature1Body": "Get a roadmap and weekly plan with real tasks. We re-plan around life.",
    "feature2Title": "A team of specialists that remembers your goals",
    "feature2Body": "Specialists work together in one space. No re-explaining, ever.",
    "feature3Title": "Real Deliverables, not just chat",
    "feature3Body": "From decks to scripts to spreadsheets — we build it and deliver the file.",
```

- [ ] **Step 2: Add `ctaGetStarted` and `picker` keys inside the `landing` block**

Insert after the `ctaSignup` line (currently line 309). Use this exact replacement:

old_string:
```json
    "ctaSignup": "Sign Up",
```

new_string:
```json
    "ctaSignup": "Sign Up",
    "ctaGetStarted": "Get Started",
    "picker": {
      "title": "What's in your mind now?",
      "customize": "Customize",
      "customizeTitle": "Describe your goal — your digital employees plan & execute",
      "back": "Back",
      "closeAria": "Close goal picker"
    },
```

- [ ] **Step 3: Mirror the same two edits in `es.json`, `fr.json`, `pt.json`**

For each of the three files, apply the same `old_string` → `new_string` replacements. The values stay English; native translations are a follow-up task explicitly out of scope.

If a particular locale file has slightly different surrounding whitespace or additional keys nearby, locate the matching `feature1Title` line and the `ctaSignup` line and apply the same content swap. Use Read first to find exact context if Edit fails on uniqueness.

- [ ] **Step 4: Verify JSON is valid**

Run from repo root:

```bash
cd apps/web && node -e "['en','es','fr','pt'].forEach(l => JSON.parse(require('fs').readFileSync('messages/'+l+'.json','utf8')))" && echo OK
```

Expected output: `OK`

- [ ] **Step 5: Verify typecheck still passes**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. (Some existing landing components reference the old `feature4–6*` keys, but those keys remain in the JSON, so this is safe.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/es.json apps/web/messages/fr.json apps/web/messages/pt.json
git commit -m "$(cat <<'EOF'
i18n(landing): add ctaGetStarted + picker keys; rewrite feature1–3 copy

New 3-card hero copy and goal-picker modal strings. Older feature4–6
keys remain in JSON until rendering is removed in a follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: AuthModal `nextPath` prop

**Files:**
- Modify: `apps/web/src/components/landing/auth-modal.tsx`

Existing fallback to `/dashboard` is preserved when `nextPath` is undefined, so all current call sites are unaffected.

- [ ] **Step 1: Add `nextPath` to the props interface**

In `auth-modal.tsx`, find the interface block (lines 8–16) and replace:

old_string:
```ts
interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: "login" | "signup";
  // Fires once signup succeeds and the confirmation email is on its way.
  // Parent surfaces the "check your email" toast — the modal closes
  // immediately so the user isn't staring at a stale form.
  onSignupConfirmationSent?: (email: string) => void;
}
```

new_string:
```ts
interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: "login" | "signup";
  // Fires once signup succeeds and the confirmation email is on its way.
  // Parent surfaces the "check your email" toast — the modal closes
  // immediately so the user isn't staring at a stale form.
  onSignupConfirmationSent?: (email: string) => void;
  // Where to land the user after auth completes. Defaults to /dashboard.
  // The Get Started picker passes "/goals" so the wizard can auto-start
  // from the pendingGoal cookie without a dashboard detour.
  nextPath?: string;
}
```

- [ ] **Step 2: Destructure the new prop in the function signature**

old_string:
```ts
export function AuthModal({
  open,
  onClose,
  initialMode = "signup",
  onSignupConfirmationSent,
}: AuthModalProps) {
```

new_string:
```ts
export function AuthModal({
  open,
  onClose,
  initialMode = "signup",
  onSignupConfirmationSent,
  nextPath,
}: AuthModalProps) {
```

- [ ] **Step 3: Replace the hard-coded destination helper**

old_string:
```ts
  // Always land on /dashboard after auth. If the visitor typed a goal
  // before signing up, the dashboard onboarding pre-fills its "Welcome"
  // textarea from the pendingGoal cookie — letting the user press the
  // button themselves instead of being dropped straight into the
  // roadmap-creation AI flow.
  const postAuthDestination = (): string => "/dashboard";
```

new_string:
```ts
  // Where to land the user after auth. Defaults to /dashboard so nav
  // "Login"/"Sign Up" buttons preserve the original behavior. The Get
  // Started picker passes "/goals" so the wizard auto-starts from the
  // pendingGoal cookie without a dashboard detour.
  const postAuthDestination = (): string => nextPath ?? "/dashboard";
```

- [ ] **Step 4: Verify the three call sites still work**

No edits required — they all already call `postAuthDestination()`:

- Google OAuth (~line 109): `redirectTo: ${origin}/auth/callback?next=${encoded postAuthDestination}`
- Email signup `emailRedirectTo` (~line 140): `${origin}${postAuthDestination()}`
- Email/password login (~line 174): `window.location.href = postAuthDestination()`

Confirm by reading those three lines.

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/landing/auth-modal.tsx
git commit -m "$(cat <<'EOF'
feat(auth-modal): add optional nextPath prop

Defaults to /dashboard so existing call sites are unaffected. The new
Get Started picker passes "/goals" so the goal-creation wizard can
auto-start from the pendingGoal cookie immediately after sign-in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: RoadmapIllustration

**Files:**
- Create: `apps/web/src/components/landing/illustrations/roadmap-illustration.tsx`

Pure SVG/Tailwind. Top half: dashed wavy path with 3 milestone dots and a flag. Bottom half: "This week" mini-calendar with 5 weekday columns and stacked task chips.

- [ ] **Step 1: Create the file**

Write the full content:

```tsx
// Roadmap illustration for the first feature card on the landing page.
// Pure SVG + Tailwind so the bundle stays tiny and the colors come from
// the existing design tokens.
//
// Top half: dashed rising path with three milestone dots and a flag at
// the destination. Bottom half: "This week" mini-calendar with five
// columns of stacked task chips.

import { Flag, RotateCcw } from "lucide-react";

export function RoadmapIllustration() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#FFFDF9] p-3">
      {/* Top: rising path */}
      <div className="relative h-[40%] w-full">
        <svg
          viewBox="0 0 200 70"
          className="h-full w-full"
          aria-hidden
        >
          {/* Subtle baseline */}
          <line x1="0" y1="60" x2="200" y2="60" stroke="#F1ECE4" strokeWidth="1" />
          {/* The path itself */}
          <path
            d="M 10 55 Q 50 50 80 35 T 150 20 L 180 12"
            fill="none"
            stroke="#DDD3C7"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          {/* Milestone dots */}
          <circle cx="10" cy="55" r="4" fill="#007AFF" />
          <circle cx="80" cy="35" r="4" fill="#7FB38A" />
          <circle cx="150" cy="20" r="3" fill="#C9A968" opacity="0.55" />
          <circle cx="180" cy="12" r="3" fill="#9B6B5C" opacity="0.4" />
        </svg>
        {/* Flag perched at the path's end (positioned absolutely so it
            scales naturally with the SVG). */}
        <Flag
          className="absolute right-[6%] top-[8%] h-4 w-4 text-[#2B2B2B]"
          strokeWidth={1.75}
        />
      </div>

      {/* Bottom: This week mini calendar */}
      <div className="relative mt-2 rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-2.5">
        {/* Re-plan affordance, decorative */}
        <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#7FB38A]">
          <RotateCcw className="h-3 w-3" strokeWidth={2} />
        </div>

        <p className="mb-1.5 text-[9px] font-semibold text-[#2B2B2B]">
          This week
        </p>

        {/* 5 weekday columns */}
        <div className="grid grid-cols-5 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => (
            <div key={day} className="space-y-1">
              <p className="text-[7px] font-medium text-[#9B948B]">{day}</p>
              {/* Two stacked task chips per column. Color rotates so the
                  grid feels lively without random churn between renders. */}
              <div
                className="h-2 w-full rounded-sm"
                style={{
                  backgroundColor: ["#9CC4A4", "#C9A968", "#D5847A", "#7FB3B3", "#B58FA0"][i],
                  opacity: 0.7,
                }}
              />
              <div
                className="h-2 w-full rounded-sm"
                style={{
                  backgroundColor: ["#C9A968", "#D5847A", "#9CC4A4", "#B58FA0", "#7FB3B3"][i],
                  opacity: 0.45,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/illustrations/roadmap-illustration.tsx
git commit -m "$(cat <<'EOF'
feat(landing): add RoadmapIllustration for feature card 1

Pure SVG + Tailwind illustration showing a dashed rising path with
milestones and a flag, plus a "This week" mini-calendar with task
chips. No image assets — color tokens reused from the existing design
system.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SpecialistsIllustration

**Files:**
- Create: `apps/web/src/components/landing/illustrations/specialists-illustration.tsx`

Six role pills around a central "Your goal" pill, with dashed connector lines.

- [ ] **Step 1: Create the file**

```tsx
// Six specialist role pills around a central "Your goal" node, with
// dashed connectors. Pure SVG underlay for the lines + absolutely-
// positioned divs for the pills so each pill can pick up Tailwind
// hover/typography styling without needing foreignObject.

import {
  User,
  Bot,
  PenSquare,
  Search,
  Calendar,
  CheckCircle2,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Pill {
  label: string;
  icon: LucideIcon;
  // Position as a fraction of the container box (0..1).
  x: number;
  y: number;
  color: string;
}

// Hand-tuned positions form a rough ring around the center (0.5, 0.5).
// Tweaks favored avoiding label collisions over geometric purity.
const PILLS: Pill[] = [
  { label: "General Assistant", icon: Bot, x: 0.5, y: 0.07, color: "#9CC4A4" },
  { label: "This week's plan", icon: Calendar, x: 0.92, y: 0.28, color: "#7FB3B3" },
  { label: "Market Researcher", icon: Search, x: 0.92, y: 0.72, color: "#B58FA0" },
  { label: "And more", icon: Plus, x: 0.5, y: 0.93, color: "#9B948B" },
  { label: "Shipped yesterday", icon: CheckCircle2, x: 0.08, y: 0.72, color: "#7FB38A" },
  { label: "Content Writer", icon: PenSquare, x: 0.08, y: 0.28, color: "#D5847A" },
];

export function SpecialistsIllustration() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#FFFDF9]">
      {/* Dashed connector lines (underlay). The viewBox uses a 0..1
          coordinate space so positions match the pill placement above. */}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {PILLS.map((p) => (
          <line
            key={p.label}
            x1="0.5"
            y1="0.5"
            x2={p.x}
            y2={p.y}
            stroke="#DDD3C7"
            strokeWidth="0.005"
            strokeDasharray="0.015 0.015"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Center pill: Your goal */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex items-center gap-1.5 rounded-full border border-[#E7DED2] bg-[#FFFDF9] px-2.5 py-1 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F1ECE4]">
            <User className="h-3 w-3 text-[#6F6A64]" strokeWidth={2} />
          </span>
          <span className="text-[10px] font-semibold text-[#2B2B2B]">
            Your goal
          </span>
        </div>
      </div>

      {/* Surrounding role pills */}
      {PILLS.map((p) => {
        const Icon = p.icon;
        return (
          <div
            key={p.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            <div className="flex items-center gap-1 rounded-full border border-[#E7DED2] bg-[#FFFDF9] px-2 py-1 shadow-[0_1px_4px_rgba(30,34,39,0.04)]">
              <Icon
                className="h-3 w-3 shrink-0"
                strokeWidth={1.75}
                style={{ color: p.color }}
              />
              <span className="whitespace-nowrap text-[9px] font-medium text-[#2B2B2B]">
                {p.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/illustrations/specialists-illustration.tsx
git commit -m "$(cat <<'EOF'
feat(landing): add SpecialistsIllustration for feature card 2

Six role pills (General Assistant, Content Writer, Market Researcher,
This week's plan, Shipped yesterday, And more) around a central "Your
goal" node, with dashed SVG connectors. lucide icons + Tailwind only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: DeliverablesIllustration

**Files:**
- Create: `apps/web/src/components/landing/illustrations/deliverables-illustration.tsx`

Three doc tiles → arrow → terminal window with mock code lines and "Run & deliver" badge.

- [ ] **Step 1: Create the file**

```tsx
// Real Deliverables illustration: three doc tiles (Pitch Deck PDF,
// Spreadsheet XLSX, Interview Script DOC) connected by a downward
// arrow to a terminal window with a green "Run & deliver" badge.

import { FileText, ArrowDown, CheckCircle2 } from "lucide-react";

interface Tile {
  ext: string;
  label: string;
  color: string;
  bg: string;
}

const TILES: Tile[] = [
  { ext: "PDF", label: "Pitch Deck", color: "#D5847A", bg: "#FBE6E3" },
  { ext: "XLSX", label: "Spreadsheet", color: "#7FB38A", bg: "#E6F2E8" },
  { ext: "DOC", label: "Interview Script", color: "#5E8FCE", bg: "#E6F2FF" },
];

export function DeliverablesIllustration() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-xl bg-[#FFFDF9] p-3">
      {/* Top row: three doc tiles */}
      <div className="flex w-full items-center justify-center gap-2">
        {TILES.map((t) => (
          <div
            key={t.ext}
            className="flex flex-1 flex-col items-center gap-1 rounded-md border border-[#E7DED2] bg-[#FFFDF9] px-2 py-2"
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ backgroundColor: t.bg, color: t.color }}
            >
              <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
            </div>
            <span
              className="rounded-sm px-1 text-[7px] font-bold tracking-wider"
              style={{ backgroundColor: t.bg, color: t.color }}
            >
              {t.ext}
            </span>
            <span className="text-[7px] font-medium text-[#6F6A64]">
              {t.label}
            </span>
          </div>
        ))}
      </div>

      {/* Connector arrow */}
      <div className="my-1 flex items-center justify-center">
        <ArrowDown className="h-4 w-4 text-[#9B948B]" strokeWidth={1.75} />
      </div>

      {/* Terminal window */}
      <div className="relative w-full overflow-hidden rounded-md bg-[#1E1E1E] shadow-[0_4px_12px_rgba(30,34,39,0.12)]">
        {/* macOS-style window dots */}
        <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FF5F57]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#28C840]" />
        </div>
        {/* Mock code lines */}
        <div className="space-y-1 px-2 py-2">
          <div className="flex items-center gap-1">
            <span className="h-1 w-3 rounded-sm bg-[#5C9CDB]" />
            <span className="h-1 w-12 rounded-sm bg-[#7FB38A]" />
          </div>
          <div className="flex items-center gap-1 pl-2">
            <span className="h-1 w-2 rounded-sm bg-[#C586C0]" />
            <span className="h-1 w-10 rounded-sm bg-[#CCCCCC]/40" />
            <span className="h-1 w-4 rounded-sm bg-[#D7BA7D]" />
          </div>
          <div className="flex items-center gap-1 pl-2">
            <span className="h-1 w-3 rounded-sm bg-[#5C9CDB]" />
            <span className="h-1 w-8 rounded-sm bg-[#CCCCCC]/40" />
          </div>
        </div>

        {/* "Run & deliver" badge nestled inside the bottom-left of the
            terminal window, like a status indicator. */}
        <div className="flex items-center gap-1 px-2 pb-1.5">
          <CheckCircle2 className="h-2.5 w-2.5 text-[#28C840]" strokeWidth={2.5} />
          <span className="text-[7px] font-medium text-[#28C840]">
            Run &amp; deliver
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/illustrations/deliverables-illustration.tsx
git commit -m "$(cat <<'EOF'
feat(landing): add DeliverablesIllustration for feature card 3

Three doc tiles (PDF/XLSX/DOC) → downward arrow → mock terminal window
with code lines and a "Run & deliver" status badge. Pure SVG/Tailwind,
no image assets.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: LandingFeatureCard primitive

**Files:**
- Create: `apps/web/src/components/landing/landing-feature-card.tsx`

Reusable card shell. Receives icon, title, body, and an `illustration` slot.

- [ ] **Step 1: Create the file**

```tsx
// Card shell used by the three large feature cards on the landing page.
// Title + body sit on top; the illustration fills a fixed-aspect slot
// underneath so all three cards line up evenly.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface LandingFeatureCardProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
  illustration: ReactNode;
}

export function LandingFeatureCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  body,
  illustration,
}: LandingFeatureCardProps) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-5 transition-all hover:border-[#DDD3C7] hover:shadow-[0_8px_24px_rgba(30,34,39,0.06)]">
      {/* Icon chip */}
      <div
        className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>

      <h3 className="mb-2 text-base font-semibold leading-snug text-[#2B2B2B]">
        {title}
      </h3>
      <p className="mb-4 text-sm leading-relaxed text-[#6F6A64]">{body}</p>

      {/* Illustration slot — 4:3 aspect locks alignment across cards */}
      <div className="mt-auto aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F6F3EE]">
        {illustration}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/landing-feature-card.tsx
git commit -m "$(cat <<'EOF'
feat(landing): add LandingFeatureCard primitive

Reusable shell for the three large feature cards: icon chip + title +
body + 4:3 illustration slot. Hover lift consistent with the existing
landing page card style.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: GetStartedModal

**Files:**
- Create: `apps/web/src/components/landing/get-started-modal.tsx`

Two-view modal. Examples grid → Customize textarea (reusing `<GoalInput>`). Calls `onSubmit(text)` for either path; parent handles routing/auth.

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import {
  Dumbbell,
  Briefcase,
  Timer,
  Globe,
  ShoppingBag,
  Plane,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { GoalInput } from "./goal-input";

interface GetStartedModalProps {
  open: boolean;
  onClose: () => void;
  // Fires once the user has either picked an example or submitted
  // custom text. The parent owns what happens next (set pendingGoal,
  // push to /goals, or open AuthModal).
  onSubmit: (text: string) => void;
}

const EXAMPLE_KEYS: { key: string; icon: LucideIcon; color: string }[] = [
  { key: "lose", icon: Dumbbell, color: "#E8858B" },
  { key: "job", icon: Briefcase, color: "#D4C5A0" },
  { key: "marathon", icon: Timer, color: "#C9B88C" },
  { key: "language", icon: Globe, color: "#7BA8D9" },
  { key: "shop", icon: ShoppingBag, color: "#8BC5A3" },
  { key: "trip", icon: Plane, color: "#007AFF" },
];

export function GetStartedModal({ open, onClose, onSubmit }: GetStartedModalProps) {
  const t = useTranslations("landing.picker");
  const tExamples = useTranslations("landing.examples");

  const [view, setView] = useState<"examples" | "customize">("examples");
  const [customText, setCustomText] = useState("");
  // Visual feedback while we hand off — keeps the picked chip highlighted
  // for ~120ms so the user sees their click registered before parent
  // state changes can unmount the modal.
  const [picking, setPicking] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset to examples view whenever the modal reopens. Custom text is
  // intentionally NOT cleared so the user can close, reopen, and keep
  // typing.
  useEffect(() => {
    if (open) {
      setView("examples");
      setPicking(null);
    }
  }, [open]);

  // ESC closes; click on overlay closes. Focus the dialog when opened
  // for screen-reader and keyboard users.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handlePick = (key: string) => {
    if (picking) return;
    setPicking(key);
    const text = tExamples(`${key}.text`);
    // Brief visual delay so the user sees the highlight before the
    // parent (likely) replaces this view with AuthModal or /goals.
    setTimeout(() => onSubmit(text), 120);
  };

  const handleCustomSubmit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text.trim());
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
          className="relative w-full max-w-2xl rounded-2xl bg-[#FFFDF9] p-6 shadow-[0_24px_64px_rgba(30,34,39,0.16)] outline-none md:p-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onClose}
            aria-label={t("closeAria")}
            className="absolute right-4 top-4 rounded-md p-1.5 text-[#9B948B] transition-colors hover:bg-[#F1ECE4] hover:text-[#2B2B2B]"
          >
            <X className="h-5 w-5" />
          </button>

          {view === "examples" ? (
            <>
              <h2 className="mb-5 text-xl font-semibold text-[#2B2B2B] md:text-2xl">
                {t("title")}
              </h2>

              {/* 6-cell example grid */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                {EXAMPLE_KEYS.map(({ key, icon: Icon, color }) => {
                  const isPicked = picking === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handlePick(key)}
                      disabled={picking !== null}
                      className={`group flex items-center gap-2 rounded-xl border px-3.5 py-3 text-left transition-all disabled:cursor-default ${
                        isPicked
                          ? "border-[#007AFF] bg-[#F8FBFF] shadow-[0_0_0_3px_rgba(0,122,255,0.15)]"
                          : "border-[#E7DED2] bg-[#FFFDF9] hover:border-[#9FC3EF] hover:bg-[#F8FBFF]"
                      }`}
                    >
                      <Icon
                        className="h-4 w-4 shrink-0"
                        strokeWidth={1.75}
                        style={{ color }}
                      />
                      <span className="truncate text-sm font-medium text-[#2B2B2B]">
                        {tExamples(`${key}.title`)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Customize */}
              <button
                onClick={() => setView("customize")}
                className="mt-3 w-full rounded-xl border border-[#DDD3C7] bg-[#FFFDF9] px-3.5 py-3 text-left text-sm font-medium text-[#2B2B2B] transition-colors hover:border-[#9FC3EF] hover:bg-[#F8FBFF]"
              >
                {t("customize")}
              </button>
            </>
          ) : (
            <>
              {/* Customize header with Back */}
              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={() => setView("examples")}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[#6F6A64] transition-colors hover:bg-[#F1ECE4] hover:text-[#2B2B2B]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("back")}
                </button>
              </div>

              <h2 className="mb-5 text-xl font-semibold text-[#2B2B2B] md:text-2xl">
                {t("customizeTitle")}
              </h2>

              <GoalInput
                value={customText}
                onChange={setCustomText}
                onSubmit={handleCustomSubmit}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/landing/get-started-modal.tsx
git commit -m "$(cat <<'EOF'
feat(landing): add GetStartedModal goal picker

Two-view modal (example chips → Customize textarea reusing GoalInput).
Calls onSubmit(text) on pick or submit; parent owns auth/routing. ESC
and overlay close; previously-typed Customize text persists across
opens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: LandingPage rewire

**Files:**
- Modify: `apps/web/src/components/landing/landing-page.tsx`

Drop the `<GoalInput>`, `<ExampleGoals>`, and the 6-feature-cards section. Add 3 large `<LandingFeatureCard>`s, the centered "Get Started" button, picker modal state, and `nextPath` wiring for AuthModal.

- [ ] **Step 1: Replace the imports block**

old_string:
```tsx
import { useState, useEffect } from "react";
import {
  Check,
  X,
  AlertCircle,
  Flag,
  Calendar,
  Users,
  FileText,
  MessageCircle,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { GoalInput } from "./goal-input";
import { ExampleGoals } from "./example-goals";
import { AuthModal } from "./auth-modal";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { createClient } from "@/lib/db/client";
import { setPendingGoal } from "@/lib/pending-goal";
```

new_string:
```tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, X, AlertCircle, Flag, Users, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { AuthModal } from "./auth-modal";
import { GetStartedModal } from "./get-started-modal";
import { LandingFeatureCard } from "./landing-feature-card";
import { RoadmapIllustration } from "./illustrations/roadmap-illustration";
import { SpecialistsIllustration } from "./illustrations/specialists-illustration";
import { DeliverablesIllustration } from "./illustrations/deliverables-illustration";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { createClient } from "@/lib/db/client";
import { setPendingGoal } from "@/lib/pending-goal";
```

- [ ] **Step 2: Replace the state declarations and effect block**

old_string:
```tsx
export function LandingPage() {
  const t = useTranslations("landing");
  const [goalText, setGoalText] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  // Tracks which mode the modal should open in — set BEFORE setAuthOpen(true)
  // so the modal's open-time reset effect picks up the right initial mode.
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  // Holds the email of the just-signed-up user. Non-null = toast visible.
  const [signupToastEmail, setSignupToastEmail] = useState<string | null>(null);
  // Populated from ?error=... on mount — surfaces whatever Supabase sent
  // back through /auth/callback (expired link, invalid token, etc.).
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
```

new_string:
```tsx
export function LandingPage() {
  const t = useTranslations("landing");
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  // Tracks which mode the modal should open in — set BEFORE setAuthOpen(true)
  // so the modal's open-time reset effect picks up the right initial mode.
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  // When the picker drives auth, we want post-auth to land on /goals so
  // the wizard can auto-start from the pendingGoal cookie. Nav-driven
  // auth leaves this undefined → AuthModal falls back to /dashboard.
  const [authNextPath, setAuthNextPath] = useState<string | undefined>(undefined);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Holds the email of the just-signed-up user. Non-null = toast visible.
  const [signupToastEmail, setSignupToastEmail] = useState<string | null>(null);
  // Populated from ?error=... on mount — surfaces whatever Supabase sent
  // back through /auth/callback (expired link, invalid token, etc.).
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
```

- [ ] **Step 3: Replace `openAuth` and `handleSubmitGoal` with `openAuth` (nav) and `handlePickerSubmit`**

old_string:
```tsx
  const openAuth = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const handleSubmitGoal = (text: string) => {
    setPendingGoal(text);
    if (loggedIn) {
      // Already authenticated — skip the auth modal and drop them on
      // /dashboard. The onboarding-dashboard reads pendingGoal and
      // pre-fills its textarea with whatever they just typed.
      window.location.href = "/dashboard";
      return;
    }
    openAuth("signup");
  };
```

new_string:
```tsx
  // Nav-button auth: keeps the original /dashboard destination so
  // returning users land where they expect.
  const openAuth = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setAuthNextPath(undefined);
    setAuthOpen(true);
  };

  // Picker-driven submit: stash the goal in the pendingGoal cookie,
  // close the picker, and either push straight to /goals (logged-in)
  // or open AuthModal with nextPath="/goals" so the wizard auto-starts
  // immediately after sign-in.
  const handlePickerSubmit = (text: string) => {
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
  };
```

- [ ] **Step 4: Replace the `features` array with 3 entries**

old_string:
```tsx
  const features: Array<{
    icon: typeof Flag;
    titleKey: string;
    bodyKey: string;
    color: string;
  }> = [
    { icon: Flag, titleKey: "feature1Title", bodyKey: "feature1Body", color: "#007AFF" },
    { icon: Calendar, titleKey: "feature2Title", bodyKey: "feature2Body", color: "#7FB38A" },
    { icon: Users, titleKey: "feature3Title", bodyKey: "feature3Body", color: "#C9A968" },
    { icon: FileText, titleKey: "feature4Title", bodyKey: "feature4Body", color: "#D5847A" },
    { icon: MessageCircle, titleKey: "feature5Title", bodyKey: "feature5Body", color: "#9B6B5C" },
    { icon: Wallet, titleKey: "feature6Title", bodyKey: "feature6Body", color: "#7FB3B3" },
  ];
```

new_string:
```tsx
  const features = [
    {
      icon: Flag,
      titleKey: "feature1Title" as const,
      bodyKey: "feature1Body" as const,
      color: "#007AFF",
      iconBg: "#E6F2FF",
      illustration: <RoadmapIllustration />,
    },
    {
      icon: Users,
      titleKey: "feature2Title" as const,
      bodyKey: "feature2Body" as const,
      color: "#7FB38A",
      iconBg: "#E6F2E8",
      illustration: <SpecialistsIllustration />,
    },
    {
      icon: FileText,
      titleKey: "feature3Title" as const,
      bodyKey: "feature3Body" as const,
      color: "#D5847A",
      iconBg: "#FBE6E3",
      illustration: <DeliverablesIllustration />,
    },
  ];
```

- [ ] **Step 5: Replace the hero section markup (the `<section className="max-w-4xl ...">` block) with the new layout**

old_string:
```tsx
      {/* Hero */}
      <main className="-mt-2">
        <section className="max-w-4xl mx-auto px-6 text-center">
          {/* Hero illustration */}
          <div className="relative mx-auto max-w-2xl">
            <div className="overflow-hidden max-h-[280px] md:max-h-[340px]">
              <img
                src="/hero-illustration.png"
                alt={t("heroAlt")}
                className="w-full h-auto object-cover object-top"
              />
            </div>
            {/* Attribution badge — sits above the green (headphones)
                character. Positioned in % so it tracks the image as it
                scales down on narrower viewports. */}
            <span className="absolute right-[2%] top-[28%] z-20 inline-flex items-center rounded-full border border-[#007AFF]/40 bg-[#FFFDF9] px-2.5 py-1 text-[10px] md:text-xs font-medium text-[#5E8FCE] shadow-[0_2px_8px_rgba(0,122,255,0.18)] whitespace-nowrap">
              {t("heroBadge")}
            </span>
          </div>

          <p className="text-xl md:text-2xl text-[#2B2B2B] mb-4 max-w-4xl mx-auto whitespace-nowrap">
            {t("heroTagline")}
          </p>

          <GoalInput
            value={goalText}
            onChange={setGoalText}
            onSubmit={handleSubmitGoal}
          />

          <ExampleGoals onSelect={(text) => setGoalText(text)} />
        </section>

        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto px-6 mt-24 mb-20 scroll-mt-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#2B2B2B] mb-3">
              {t("featuresTitle")}
            </h2>
            <p className="text-base text-[#6F6A64] max-w-2xl mx-auto">
              {t("featuresSubtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, titleKey, bodyKey, color }) => (
              <div
                key={titleKey}
                className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-6 text-left hover:border-[#DDD3C7] hover:shadow-[0_8px_24px_rgba(30,34,39,0.06)] transition-all"
              >
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4"
                  style={{ backgroundColor: `${color}1F`, color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-[#2B2B2B] mb-1.5">{t(titleKey)}</h3>
                <p className="text-sm text-[#6F6A64] leading-relaxed">{t(bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>
```

new_string:
```tsx
      {/* Hero + 3-card layout */}
      <main className="-mt-2">
        <section className="max-w-6xl mx-auto px-6 text-center">
          {/* Hero illustration */}
          <div className="relative mx-auto max-w-2xl">
            <div className="overflow-hidden max-h-[280px] md:max-h-[340px]">
              <img
                src="/hero-illustration.png"
                alt={t("heroAlt")}
                className="w-full h-auto object-cover object-top"
              />
            </div>
            <span className="absolute right-[2%] top-[28%] z-20 inline-flex items-center rounded-full border border-[#007AFF]/40 bg-[#FFFDF9] px-2.5 py-1 text-[10px] md:text-xs font-medium text-[#5E8FCE] shadow-[0_2px_8px_rgba(0,122,255,0.18)] whitespace-nowrap">
              {t("heroBadge")}
            </span>
          </div>

          <p className="text-xl md:text-2xl text-[#2B2B2B] mt-2 mb-10 max-w-4xl mx-auto whitespace-normal md:whitespace-nowrap">
            {t("heroTagline")}
          </p>

          {/* 3 feature cards */}
          <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left scroll-mt-24">
            {features.map(({ icon, titleKey, bodyKey, color, iconBg, illustration }) => (
              <LandingFeatureCard
                key={titleKey}
                icon={icon}
                iconColor={color}
                iconBg={iconBg}
                title={t(titleKey)}
                body={t(bodyKey)}
                illustration={illustration}
              />
            ))}
          </div>

          {/* Get Started */}
          <div className="mt-10 mb-20 flex justify-center">
            <button
              onClick={() => setPickerOpen(true)}
              className="bg-[#007AFF] text-white px-8 py-3 rounded-full text-base font-semibold hover:bg-[#0066D6] active:scale-95 transition-all shadow-[0_4px_16px_rgba(0,122,255,0.25)]"
            >
              {t("ctaGetStarted")}
            </button>
          </div>
        </section>
```

- [ ] **Step 6: Replace the AuthModal call to pass `nextPath`**

old_string:
```tsx
      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onSignupConfirmationSent={(email) => setSignupToastEmail(email)}
      />
```

new_string:
```tsx
      <GetStartedModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSubmit={handlePickerSubmit}
      />

      <AuthModal
        open={authOpen}
        initialMode={authMode}
        nextPath={authNextPath}
        onClose={() => setAuthOpen(false)}
        onSignupConfirmationSent={(email) => setSignupToastEmail(email)}
      />
```

- [ ] **Step 7: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors. If you see "unused import" errors for `Calendar`, `MessageCircle`, or `Wallet`, double-check Step 1's import replacement landed correctly (those should be gone). If `goalText` / `setGoalText` is still referenced, Step 2 didn't fully apply.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/landing/landing-page.tsx
git commit -m "$(cat <<'EOF'
feat(landing): rewire hero to 3-card layout + Get Started picker

Drop the inline GoalInput, the example chip strip, and the 6-card
features grid. New hero shows three large feature cards with their own
illustrations and a centered Get Started button that opens the goal
picker. Picker-driven auth lands on /goals (skipping the dashboard
detour); nav Login/Sign Up still goes to /dashboard for returning users.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Verification

**Files:** none (verification only).

- [ ] **Step 1: Final typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Production build**

```bash
cd apps/web && npx next build
```

Expected: build succeeds. Look for warnings about unused i18n keys — `feature4–6*`, `featuresTitle`, `featuresSubtitle` may surface but are intentional (kept in JSON, not rendered).

- [ ] **Step 3: Start the dev preview**

Use the `mcp__Claude_Preview__preview_start` tool with the dev server command for `apps/web` (e.g., `npm run dev` from that directory). Wait until the server is listening, then take a screenshot of `/` to confirm:

- Hero illustration is intact
- Tagline reads "Describe your goal and your digital employees plan & execute"
- Three large feature cards render side by side at desktop width with their illustrations visible
- A blue pill-shaped "Get Started" button sits centered below the cards
- The old textarea, example chips, and 6-feature grid are gone

If anything is misaligned, edit the relevant component file and re-screenshot.

- [ ] **Step 4: Manual click-through (logged-out anonymous path)**

This step requires `DEV_AUTH_BYPASS=0` (or the env vars unset) so that auth actually runs. Use `preview_click` to:

1. Click "Get Started" → picker opens with 6 example chips and Customize button
2. Click "Learn a new language" chip → picker visually highlights briefly, then AuthModal opens (signup mode)
3. Close AuthModal (✕)
4. Click "Get Started" again → click "Customize" → Customize view shows GoalInput with Tab autofill hint
5. Click "Back" → back to examples view
6. Close picker (✕ or ESC)

If `DEV_AUTH_BYPASS=1`, paths through AuthModal short-circuit; document this and skip step 4 only — verify the picker UI itself.

- [ ] **Step 5: Manual click-through (logged-in path, optional)**

If `DEV_AUTH_BYPASS=1` is configured, the user is auto-logged-in. With this on:

1. Visit `/`
2. Click "Get Started" → picker
3. Pick any example → expect navigation to `/goals` and the wizard to auto-start with that goal text

If you can verify this once, that's enough — the wizard's behavior itself is unchanged.

- [ ] **Step 6: Stop the preview**

Use `mcp__Claude_Preview__preview_stop`.

- [ ] **Step 7: Final commit if any small fixes were made during verification**

If verification surfaced layout tweaks, group them into one follow-up commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(landing): polish from manual verification

[describe specific fixes]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no fixes were needed, skip this step.

- [ ] **Step 8: Print test points for the user**

Per project convention, never `git push` without explicit user instruction. Output a manual checklist for the user to verify in their own browser:

```
Branch: claude/crazy-sanderson-2877ea (already committed locally)

Test points to verify on your local dev server (npm run dev from apps/web):

1. Visit / — confirm hero, 3 feature cards with illustrations, and centered Get Started button render correctly
2. Click Get Started → modal shows 6 example chips + Customize button
3. Click an example chip → modal closes, AuthModal opens (signup mode)
4. Sign up via email → click confirmation link → expect to land on /goals with wizard auto-started on the picked goal text
5. Sign out, click Get Started → Customize → type a custom goal → submit → AuthModal → Google OAuth → expect /goals + wizard auto-start with custom text
6. Already-logged-in: click Get Started → pick example → expect direct push to /goals + wizard
7. Click nav "Sign Up" (NOT Get Started) → sign up → expect /dashboard (NOT /goals); onboarding-dashboard renders normally
8. ESC and overlay-click close the picker; ✕ closes both modals
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Implementing task |
|---|---|
| New 3-card landing layout | Tasks 3–8 |
| Get Started button + picker | Tasks 7, 8 |
| Picker examples view + Customize view | Task 7 |
| AuthModal `nextPath` prop | Task 2 |
| Three SVG illustrations | Tasks 3, 4, 5 |
| LandingFeatureCard primitive | Task 6 |
| i18n additions and feature copy rewrite | Task 1 |
| pending-goal mechanism reused | Task 8 (`handlePickerSubmit`) |
| Path A–E flows | Task 8 (`handlePickerSubmit` + AuthModal `nextPath`) |
| Edge cases (empty submit, ESC, overlay) | Task 7 |
| Testing plan (typecheck + build + browser) | Task 9 |
| Out-of-scope keys deferred | Task 1 (English values retained, keys not deleted) |

No gaps.

**2. Placeholder scan:** No "TBD", "implement later", "similar to". All code blocks are complete and copy-pasteable.

**3. Type consistency:** `nextPath?: string` is consistent across AuthModalProps (Task 2) and LandingPage call site (Task 8 Step 6). `handlePickerSubmit(text: string)` matches `GetStartedModalProps.onSubmit` signature. `LandingFeatureCardProps` field names match consumer in Task 8 Step 4.
