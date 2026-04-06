# YoBoss Design System

## Direction
Notion-like minimal. Clean, premium, warm-neutral. Task-focused utility with an AI coaching companion.
Not gamified, not corporate. Calm, focused, professional.

## Layout
- Mobile-first responsive (daily check-offs happen on phones, planning on desktop)
- Sidebar navigation (56px collapsed / 240px expanded)
- Omnipresent AI chat panel (slide-out from right, 320px)
- Chat triggered by: FAB button (bottom-right), Cmd+K shortcut, or any "Ask Coach" CTA

## Colors

```css
:root {
  /* Background */
  --bg-page:      #F7F5F1;   /* main page background, warm neutral */
  --bg-card:      #FFFFFF;   /* cards, elevated panels */
  --bg-soft:      #F1EEE8;   /* secondary/muted areas, sidebar */
  --bg-dark:      #1F2328;   /* dark elements, inverse surfaces */

  /* Text */
  --text-primary:   #1E2227;   /* primary text */
  --text-secondary: #626A73;   /* secondary text */
  --text-muted:     #8C939B;   /* muted hints, placeholders */
  --text-on-dark:   #F7F5F1;   /* text on dark backgrounds */

  /* Border */
  --border-light:   #E6E1D8;   /* subtle borders */
  --border-default: #D8D1C6;   /* standard borders */

  /* Accent */
  --accent-blue:       #4C7CF0;   /* primary accent */
  --accent-blue-hover: #3F6FE4;   /* hover state */
  --accent-soft:       #EAF0FF;   /* blue tint background */

  /* Semantic */
  --success: #4D8B6A;   /* green, completed */
  --warning: #C6923D;   /* amber, streaks */
  --error:   #C65B52;   /* red, errors */
}
```

## Typography
- Font: Inter (300-800 weights)
- Headline: Inter, font-weight 800 (extrabold for hero), 700 (bold for section headings)
- Body: Inter, font-weight 400
- Label: Inter, font-weight 500-600
- Scale: 13px body, 15px task titles, 20px section headings, 28px page headings

## Spacing
- Base unit: 4px
- Scale: 4, 8, 12, 16, 24, 32, 48

## Components
- Border radius: 6px (default), 8px (cards), 12px (large containers)
- Shadows: `0 0 24px 0 rgba(30,34,39,0.06)` on elevated elements
- No decorative shadows on flat elements
- Icons: Material Symbols Outlined or Lucide React
- Task list: rows, not cards
- Streak: flame icon in `--warning`

## Anti-patterns (do NOT use)
- Purple/violet/indigo gradients
- Icons in colored circles
- 3-column feature grids with centered text
- Uniform bubbly 12px+ border-radius
- Decorative blobs, waves, SVG dividers
- Emoji as design elements
- Colored left-border cards
- Box shadows on flat elements
