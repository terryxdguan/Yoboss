# YoBoss Design System

## Brand Direction
Warm muted pastel visual system built on creamy neutrals. Friendly, calm, modern, slightly playful. More vivid than a typical productivity SaaS, but never loud.

**Visual balance: 70% neutrals, 20% soft pastel support colors, 10% brand emphasis.**

## Core Principles
1. **Creamy neutrals first** — Large surfaces use warm whites and soft beige-grays
2. **Colorful, but softened** — Pink, yellow, blue, green feel milky and muted, not saturated
3. **Blue is the action color** — Primary interactive color is soft brand blue
4. **Illustration colors influence UI, not dominate** — Pastels in tags, badges, icons, charts

## Layout
- Mobile-first responsive
- Sidebar navigation (56px collapsed / 240px expanded)
- Inline AI chat panels (slide from right, resizable)
- Tab-based goal workspace

## Colors

```css
:root {
  /* Base neutrals */
  --bg-page: #F6F3EE;
  --bg-card: #FFFDF9;
  --bg-soft: #F1ECE4;
  --bg-soft-2: #EAE4DA;
  --bg-dark: #2B2B2B;
  --bg-dark-soft: #3A3937;

  /* Text */
  --text-primary: #2B2B2B;
  --text-secondary: #6F6A64;
  --text-muted: #9B948B;
  --text-on-dark: #FFFDF9;

  /* Borders */
  --border-light: #E7DED2;
  --border-default: #DDD3C7;
  --border-strong: #CFC3B5;

  /* Brand */
  --accent-primary: #7FAEE6;
  --accent-primary-hover: #6A9DDA;
  --accent-primary-soft: #EAF3FD;
  --accent-primary-strong: #5E8FCE;

  /* Character palette */
  --pink-soft: #F4C7C3;
  --pink-base: #E9A7A0;
  --pink-deep: #D98D86;
  --yellow-soft: #EED9A5;
  --yellow-base: #DDBE73;
  --yellow-deep: #C9A95F;
  --blue-soft: #BDD8F2;
  --blue-base: #8CB8E8;
  --blue-deep: #6E9FD4;
  --green-soft: #C7E6C8;
  --green-base: #8DCB96;
  --green-deep: #6EAF79;

  /* Status */
  --success: #7FB38A;
  --success-soft: #EAF5EC;
  --warning: #D4B06A;
  --warning-soft: #F8F1E3;
  --error: #D5847A;
  --error-soft: #F9EAE7;
  --info: #8BB7E8;
  --info-soft: #EAF3FD;

  /* Charts */
  --chart-1: var(--accent-primary);
  --chart-2: var(--green-base);
  --chart-3: var(--yellow-base);
  --chart-4: var(--pink-base);
  --chart-5: var(--blue-soft);
}
```

## Typography
- Font: Inter, sans-serif
- Page titles: 32-40px, semibold, --text-primary
- Section titles: 20-24px, semibold, --text-primary
- Card titles: 16-18px, semibold, --text-primary
- Body: 14-16px, regular, --text-secondary
- Labels / meta text: 12px, medium, --text-muted

## Radius & Shadows
- `--radius-sm: 8px` / `--radius-md: 12px` / `--radius-lg: 16px` / `--radius-xl: 20px`
- `--radius-pill: 999px` (buttons)
- `--shadow-card: 0 4px 16px rgba(43,43,43,0.04)`
- `--shadow-soft: 0 8px 24px rgba(43,43,43,0.05)`
- `--shadow-hover: 0 10px 28px rgba(43,43,43,0.08)`

## Components
- **Primary button**: bg accent-primary, text white, radius pill, hover accent-primary-hover
- **Secondary button**: bg card, border border-strong, radius pill
- **Ghost button**: transparent, text-secondary, hover bg-soft
- **Cards**: bg-card, border border-light, radius-lg, shadow-card
- **Inputs**: bg-card, border border-light, radius-md, focus ring accent-primary-soft
- **Chips**: bg-card, border border-light, radius-pill; active: bg accent-primary-soft
- **Tags**: use character palette (pink-soft, yellow-soft, blue-soft, green-soft)

## Character Color Tags
- **Planner (yellow)**: bg yellow-soft, text #7B6640
- **Coach (pink)**: bg pink-soft, text #8A5F5A
- **Analyst (blue)**: bg blue-soft, text #4F6E92
- **Builder (green)**: bg green-soft, text #55775E

## Anti-patterns
- No saturated neon colors on large areas
- No harsh black borders
- No cool pure gray backgrounds
- No fully white-on-white without beige warmth
- No oversaturated CTA blues
- No bright red danger buttons unless necessary
