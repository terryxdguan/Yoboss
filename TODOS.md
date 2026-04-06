# TODOS

## Pre-Build Validation

### Manual execution validation
- **What:** Create 2-3 AI-generated study materials (flashcards, conversation script) and send to existing English-learning user via WeChat
- **Why:** Validates Phase 2 thesis (AI-created deliverables are useful) before building the execution layer
- **Effort:** 30 min founder time
- **Depends on:** Nothing. Can do today.
- **Priority:** HIGH — do before Phase 2 implementation

### OpenClaw server deployment test
- **What:** Deploy OpenClaw to a test VPS in Docker. Run 5-10 execution tasks (web search, file creation, image gen). Verify WebSocket, skill execution, file output.
- **Why:** OpenClaw has only run locally. Server-side multi-tenant deployment is untested. This is the biggest technical risk in the plan.
- **Effort:** human ~2h / CC ~30min + $20-40 VPS for a few days
- **Depends on:** Docker Compose config for OpenClaw
- **Priority:** CRITICAL — do before building the Bridge. If this fails, Phase 2 architecture needs rethinking.

## Operational

### Cost monitoring from day 1
- **What:** Track tokens_used in coaching_messages and execution_jobs. Review Anthropic dashboard weekly. Write SQL query for per-user monthly cost.
- **Why:** Cost model estimates $0.95/user/month but Opus calls with iteration could exceed this. Need visibility before costs become a problem.
- **Effort:** 5 min/week operational task
- **Depends on:** Anthropic dashboard access (have), Phase 1 deployed
- **Priority:** MEDIUM — start when first users arrive

## Design

### Full design system via /design-consultation
- **What:** Run /design-consultation for competitor analysis, typography research, color theory, complete component inventory
- **Why:** DESIGN.md is minimal (tokens only). A proper design system prevents visual drift as the product grows past Phase 1
- **Effort:** CC ~30min
- **Depends on:** Nothing. Can run anytime.
- **Priority:** MEDIUM — after Phase 1 ships, before Phase 2 UI work

### Dark mode
- **What:** Define dark mode color tokens and test all screens
- **Why:** Variant C mockup explored dark mode with amber accents. Users may prefer it, especially for evening task check-offs.
- **Depends on:** DESIGN.md (done), Phase 1 screens implemented
- **Priority:** LOW — after Phase 1 validation

## Deferred Features

### Goal Sharing / Social Proof
- **What:** Public progress page + share button for WeChat/Twitter distribution
- **Why:** Good for organic distribution but not essential for core loop validation
- **From:** CEO plan scope decision #3 (DEFERRED)
- **Priority:** LOW — Phase 3+
