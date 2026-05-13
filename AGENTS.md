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

## Design system — YoBoss Brand v1.1 (Electric Violet)

The full brand reference lives in
[`design_handoff_yoboss_brand_v1_1/README.md`](design_handoff_yoboss_brand_v1_1/README.md).
Tokens live as CSS variables in
[apps/web/src/app/globals.css](apps/web/src/app/globals.css)
(`--primary`, `--ring`, `--ink`, `--primary-wash`, `--accent-*`, etc.) and are
exposed to Tailwind via `@theme inline`. Prefer the variables (shadcn’s
`bg-primary` / `text-primary` / `bg-card` / `border-border`) over raw hex;
fall back to hex only when the variable doesn’t cover the case.

### Typography

Three font families, all wired in `apps/web/src/app/layout.tsx` via
`next/font` and exposed as Tailwind utilities:

| Stack         | Family          | Class           | Weights | Use                                           |
| ------------- | --------------- | --------------- | ------- | --------------------------------------------- |
| Display       | Space Grotesk   | `font-display`  | 500/600/700 | Logo, hero/page titles, section H2s, stat values |
| UI / body     | Inter           | `font-sans`     | 400/500/600/700 | Everything else                                  |
| Mono          | JetBrains Mono  | `font-mono`     | 500/600 | Eyebrow labels (`TUE · MAY 13 · 2026`), badges, codes |

**Rule:** Display ≥20px; never use Space Grotesk for body. Body text is
never violet — violet is for headings and CTAs only.

### Colors

| Role                          | Token / Hex                                | Notes                                                    |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| **Primary — Electric Violet** | `--primary` · `#7C2DE8`                    | Logo, CTAs, accents, focus rings.                        |
| Primary hover                 | `#6921C7`                                  | Hover for primary buttons (`hover:bg-[#6921C7]`).        |
| Primary wash                  | `--primary-wash` · `#F3ECFB`               | Soft violet surface — pills, active sidebar, in-progress chips. |
| Primary wash (strong)         | `--primary-wash-strong` · `#E7D8FB`        | Heavier violet surface for emphasis.                     |
| Lavender (soft accent)        | `#C9A8F7`                                  | Glow halos, soft outlines (e.g. the breathing onboarding card border). |
| **Page background — Cream**   | `--background` · `#FDFAF6`                 | Default page surface. Use cream, not card-white, for outer containers. |
| Warm cream (muted/secondary)  | `--muted` / `--secondary` · `#F6F3EE`      | Hover surfaces, tab-pill rest state, illustration cards. |
| Card / popover                | `--card` · `#FFFFFF`                       | Cards, modals, dropdowns. Pure white pops against cream. |
| **Ink (dark surface)**        | `--ink` · `#1A1829`                        | Dark hero/CTA panels, dark-mode bg.                      |
| Foreground / Charcoal         | `--foreground` · `#2B2B2B`                 | Headings & nav text on light surfaces.                   |
| Warm Gray                     | `--muted-foreground` · `#6F6A64`           | Body text on light.                                      |
| Muted strong                  | `--muted-strong` · `#9B948B`               | Tertiary labels, captions, mono-uppercase eyebrows.      |
| Border                        | `--border` / `--input` · `#E7DED2`         | Card borders, inputs, dividers.                          |
| **Accent — Blue**             | `--accent-blue` · `#007AFF`                | **Teammate / category accent only** (e.g. Designer-role avatars). **Not** a CTA color anymore. |
| Accent Green                  | `--accent-green` · `#7FB38A`               | “Shipped” / success / teammate accent.                   |
| Accent Green wash             | `--accent-green-wash` · `#E6F2E8`          | Soft green surface.                                      |
| Accent Peach                  | `--accent-peach` · `#D5847A`               | Warning / teammate accent / “Active goals” stat. Also `--destructive`. |
| Accent Peach wash             | `--accent-peach-wash` · `#FBE6E3`          | Soft peach surface.                                      |

12% bg alpha = `1F` in hex — e.g. `#7C2DE81F`. In Tailwind:
`bg-[#7C2DE8]/[0.12]` or inline `style={{ backgroundColor: 'rgba(124,45,232,0.12)' }}`.

### Brand glow

Primary CTAs carry a soft violet glow defined as `.shadow-brand` in
`globals.css`:

```css
.shadow-brand { box-shadow: 0 6px 18px rgba(124, 45, 232, 0.22); }
```

The shadcn `<Button>` `default` variant already applies it. For non-shadcn
buttons, add `shadow-brand` directly.

### Buttons

- **Primary (filled):**
  `bg-[#7C2DE8] text-white rounded-xl font-semibold shadow-brand`,
  hover `bg-[#6921C7]`. Use shadcn `<Button>` for the default variant. Radius
  is 12px (`rounded-xl`), not full-pill, per v1.1.
- **Primary (disabled):** add `disabled:opacity-40 disabled:cursor-not-allowed
  disabled:shadow-none`.
- **Ghost / Outlined (secondary):**
  `bg-white text-[#1A1829] border border-[#E7DED2] rounded-xl font-semibold`,
  hover `bg-[#F6F3EE]`. Use shadcn `variant="outline"` when possible.
- **Text button:** plain violet text, no background —
  `text-[#7C2DE8] hover:text-[#6921C7] font-medium`. Use for inline secondary
  actions like “Regenerate”, “Start”.
- **Underlined link:** dark text + underline —
  `text-[#1A1829] font-semibold underline underline-offset-4`, active flips
  to `text-[#7C2DE8]`.

### Toggles

Two-segment pill. Selected half is `bg-[#7C2DE8]` / white text; unselected
half is transparent over an outer `bg-[#F6F3EE]` rounded-full container with
`text-[#000000]/60`. Both halves share `rounded-full px-3.5 py-1.5 text-sm
font-semibold`.

### Cards

- Standard card: `bg-white border border-[#E7DED2] rounded-2xl p-6` (or
  `p-5/p-8` depending on density), optional
  `shadow-[0_10px_28px_rgba(26,24,41,0.06)]` on hover.
- Eyebrow label inside a card:
  `font-mono text-[10px] font-bold uppercase tracking-[0.12em]
  text-[#9B948B]` — pair with a Space Grotesk title below.

### Pills (eyebrows / status badges)

- **Default violet eyebrow:** `bg-[#F3ECFB] text-[#7C2DE8] px-2.5 py-1
  rounded-full text-[10px] font-bold uppercase tracking-[0.12em]`.
- **On ink surfaces:** `bg-[rgba(124,45,232,0.22)] text-[#C9A8F7]` —
  same shape, brighter on dark.
- **Status — Shipped/Done:** `bg-[#E6F2E8] text-[#3F7A4C]`.
- **Status — Peach/Warning:** `bg-[#FBE6E3] text-[#D5847A]`.
- **In-Progress (sample):** violet eyebrow on violet wash.

The legacy `getGoalStatusBadge` helper in
[apps/web/src/app/(app)/goals/[id]/page.tsx](apps/web/src/app/(app)/goals/[id]/page.tsx)
still uses the older semantic palette (`#FE4435` / `#08A200` / `#E09226`).
That mapping is fine for goal-status pills (red/green/amber traffic-light
semantics); migrate to v1.1 accents only when the design team confirms.

### Ink banner pattern

Used by the landing final-CTA, dashboard welcome banner, and pricing Pro
tier (Pro is featured in the v1.1 mock):

```
bg-[#1A1829] text-[#FDFAF6] rounded-2xl/3xl px-8 md:px-14 py-12 md:py-16
```

Always layer a decorative Y-mark watermark in the top-right at
`opacity: 0.18` (use the `<YMark tone="violet" fadeOpacity={0.4} />`
component from [apps/web/src/components/brand/wordmark.tsx](apps/web/src/components/brand/wordmark.tsx)).
Eyebrow text uses mono uppercase at `text-[#FDFAF6]/55`; body copy at
`text-[#FDFAF6]/70`.

### Logo

Use the `<Wordmark>` / `<YMark>` components from
[apps/web/src/components/brand/wordmark.tsx](apps/web/src/components/brand/wordmark.tsx).
Both accept `tone="violet" | "white"`. The faded left arm of the Y (opacity
0.22) is the path *not* taken — don’t bump its opacity.

Static SVGs and favicons are in
[apps/web/public/branding/](apps/web/public/branding/) and the favicon
itself lives at [apps/web/src/app/icon.png](apps/web/src/app/icon.png)
(picked up automatically by Next 15’s file-based metadata convention).

### Anti-patterns

- **Don’t** keep `#007AFF` on CTAs anywhere — only as a teammate-avatar
  accent. The `--accent-blue` token exists for that single purpose.
- **Don’t** use Space Grotesk for body or below 20px.
- **Don’t** use violet for body paragraphs.
- **Don’t** introduce new emojis or icons — stick to `lucide-react`.
- **Don’t** copy mock inline-style approaches — lift values to utilities +
  CSS variables.
