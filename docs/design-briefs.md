# YoBoss — Screen Design Briefs

Use these briefs to generate layouts/mockups in your preferred design tool.
All screens share the same global shell (sidebar + chat FAB).
Reference: DESIGN.md for colors, typography, spacing, anti-patterns.

---

## Global Shell (present on ALL authenticated pages)

```
┌──────────┬──────────────────────────────────────────────────────┐
│ SIDEBAR  │                                                      │
│ (56px    │              MAIN CONTENT AREA                       │
│ collapsed│              (varies per page)                       │
│ icons    │                                                      │
│ only)    │                                                      │
│          │                                                      │
│ [logo]   │                                                      │
│ ──────── │                                                      │
│ 📅 Today │                                                      │
│ 🎯 Goals │                                                      │
│ 📊 Prog  │                                                      │
│ ──────── │                                                      │
│ ⚙ Set   │                                         ┌──────────┐│
│          │                                         │ 💬 FAB   ││
│          │                                         │ (chat)   ││
│          │                                         └──────────┘│
└──────────┴──────────────────────────────────────────────────────┘
```

**Sidebar behavior:**
- Default: collapsed at 56px, showing only icons (lucide-react outline style)
- On hover: expands to 240px, revealing text labels with smooth animation (200ms)
- Background: `--bg-secondary` (#F7F7F5)
- Active page: icon + background highlight using `--accent-primary-soft` (#EAF2FF) + `--accent-primary` (#2F76E6) icon color
- Inactive icons: `--text-secondary` (#5F5F5A)
- Border right: 1px `--border-subtle` (#ECECE8)
- Bottom of sidebar: settings icon
- Logo at top: "GW" monogram or simple wordmark "YoBoss" (only visible when expanded)

**FAB (Floating Action Button):**
- Position: bottom-right corner, 24px from edge
- Size: 48px circle
- Color: `--accent-primary` (#2F76E6) background, white icon
- Hover: `--accent-primary-hover` (#2368D8)
- Icon: MessageCircle from lucide-react
- On click: opens the Chat Panel (slides in from right)
- Shadow: `0 2px 8px rgba(0,0,0,0.10)`

**Design tokens (apply to all screens):**
- Background: #FFFFFF (pure white)
- Secondary bg: #F7F7F5 (sidebar, secondary sections)
- Text: #191919 (primary), #5F5F5A (secondary), #8B8B85 (tertiary/hints)
- Borders: #E2E2DD (default), #ECECE8 (subtle), #D3D3CD (strong)
- Accent: #2F76E6 (rational blue)
- Success: #2E8B57 (muted green)
- Warning: #B78105 (amber)
- Error: #D14D41 (muted red)
- Font: Inter, 13px body, 15px task titles, 20px section headings, 28px page headings
- Border radius: 6px everywhere
- No shadows on flat elements. Shadow only on elevated (chat panel, modals, FAB)

---

## Screen 1: `/today` — Daily View (MOST IMPORTANT)

This is the screen users see every day. It must feel clean, focused, and satisfying to use.

**Layout:**
```
┌──────────────────────────────────────────────────┐
│                                                  │
│  Good morning, Terry                   Thu Apr 3 │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  COACHING MESSAGE CARD                     │  │
│  │                                            │  │
│  │  "You completed 4 out of 5 tasks           │  │
│  │  yesterday. The speaking practice you      │  │
│  │  skipped? Try 10 minutes before lunch      │  │
│  │  today. Small wins add up."                │  │
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Today's Tasks                    4/6 completed  │
│  ──────────────────────────────────────────────  │
│                                                  │
│  MORNING                                         │
│  ┌────────────────────────────────────────────┐  │
│  │ [x] Review vocabulary flashcards    30 min │  │
│  │ [x] Listen to English podcast       20 min │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  AFTERNOON                                       │
│  ┌────────────────────────────────────────────┐  │
│  │ [x] Practice business email writing 45 min │  │
│  │ [ ] Speaking practice: idioms       30 min │  │
│  │ [✨] Create flashcard deck (AI)     ── min │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  EVENING                                         │
│  ┌────────────────────────────────────────────┐  │
│  │ [x] Watch TED talk + note new words 25 min │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  🔥 7-day streak                                 │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Coaching message card:**
- Background: `--bg-soft` (#F3F3F1)
- Border: 1px `--border-subtle` (#ECECE8)
- Text: 15px, `--text-primary` (#191919), line-height 1.6
- When loading: 3 animated dots (typing indicator)

**Task list:**
- Section headers: "MORNING" etc in 11px uppercase, `--text-tertiary` (#8B8B85), letter-spacing 0.5px
- Rows separated by 1px `--border-subtle` (#ECECE8)
- Checkbox: 20px, rounded 4px, unchecked = `--border-default` (#E2E2DD), checked = `--success` (#2E8B57) fill
- Completed task title: `--text-tertiary` (#8B8B85) with strikethrough
- Time estimate: right-aligned, 13px, `--text-tertiary`
- AI-executable: sparkle icon + label in `--accent-primary` (#2F76E6)
- Hover: row bg `--bg-secondary` (#F7F7F5)

**Streak:** Flame icon in `--warning` (#B78105), text in `--text-secondary` (#5F5F5A)

**Empty state:** "No tasks for today yet" + FAB pulses

---

## Screen 2: `/goals` — Goal List

Goal cards with `--bg-primary` (#FFFFFF) bg, 1px `--border-default` (#E2E2DD) border. Progress bar fill: `--accent-primary` (#2F76E6). Hover: border `--accent-primary` at 40%. Create card: dashed border, hover turns `--accent-primary`.

---

## Screen 3: `/goals/:id` — Goal Detail

Phase timeline: completed = `--success` (#2E8B57), active = `--accent-primary` (#2F76E6) border, upcoming = `--border-default`. Today highlight: 2px `--accent-primary` left border. Review card bg: `--bg-soft` (#F3F3F1). Complete Phase button: outlined `--accent-primary`.

---

## Screen 4: `/progress` — Streak & Progress

Heatmap: 0% = `--bg-soft` (#F3F3F1), 100% = `--accent-primary` (#2F76E6). Bar chart bars: `--accent-primary`. Grid lines: `--border-subtle` (#ECECE8).

---

## Screen 5: `/` — Landing Page

White bg. Headline 36px `--text-primary`. Subtext 16px `--text-secondary`. CTA: `--accent-primary` (#2F76E6) bg, white text, hover `--accent-primary-hover`. No images, no hero, text only.

---

## Screen 6: Chat Panel

Width 320px. Background `--bg-chat` (#FAFAF8). Shadow `-4px 0 16px rgba(0,0,0,0.06)`. AI bubbles: `--bg-soft` (#F3F3F1). User bubbles: `--accent-primary` (#2F76E6) bg, white text. Send button: `--accent-primary`. Confirmation card: white bg, `--border-default` border. "Looks good!" button: `--accent-primary` filled.

---

## Screen 7: Login / Signup

White bg, centered max-width 400px. Google button: outlined `--border-default`. Submit: `--accent-primary` (#2F76E6) bg, white text. Links: `--accent-primary` color. Errors: `--error` (#D14D41).

---

## Anti-Patterns

- No purple/violet gradients
- No icons in colored circles
- No 3-column feature grids
- No center-aligned everything
- No 12px+ bubbly border-radius
- No decorative blobs/waves
- No emoji as design elements
- No colored left-border cards
- No shadows on flat elements
- No warm amber/gold as primary accent

## What Success Looks Like

**Notion's cleanliness meets calm focus.** Clean, rational, professional.
