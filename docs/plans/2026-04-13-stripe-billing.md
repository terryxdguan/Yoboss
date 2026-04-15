# Stripe Subscription + Credits Wallet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Stripe subscriptions (Free/Basic/Pro) + prepaid credits wallet for overage, replacing current static daily quotas with tier-based monthly cost allowances that work in concert with the existing `user_quotas` / `ai_usage` schema.

**Architecture:**
- Stripe Checkout (hosted) for subscriptions and credit pack purchases — minimal frontend work
- Stripe Customer Portal for users to manage/cancel subscriptions
- Webhook at `/api/webhooks/stripe` handles all state changes (subscription created/updated/deleted, checkout completed, invoice paid)
- Existing `user_quotas` table extended with `stripe_customer_id`, `stripe_subscription_id`, `credits_balance_cents`, `subscription_status`
- Rate limit logic in `rate-limit.ts` updated: spend monthly allowance first, then fall back to credits balance

**Tech Stack:** Stripe Node SDK, Next.js 16 Route Handlers, Supabase (service role for webhook writes), existing TailwindCSS UI

**Pricing Structure:**
| Tier | Price | Monthly AI Allowance |
|------|-------|---------------------|
| Free | $0 | $5.00 (500¢) |
| Basic | $10/mo | $15.00 (1500¢) |
| Pro | $19.99/mo | $40.00 (4000¢) |

| Credit Pack | Price | Credits Added |
|-------------|-------|---------------|
| Small | $5 | $5.00 (500¢) |
| Medium | $20 | $22.00 (2200¢, +10% bonus) |
| Large | $50 | $60.00 (6000¢, +20% bonus) |

**Spending Order:** Monthly subscription allowance → Credits balance → Reject

---

## Setup Checklist (USER does this BEFORE starting tasks)

1. Go to https://dashboard.stripe.com and ensure your US company Stripe account is ready
2. Stay in **Test mode** for development
3. Create 3 Products in Stripe Dashboard → Product catalog:
   - **YoBoss Free** (one-time, $0 — actually skip this; we treat Free as no subscription)
   - **YoBoss Basic** → recurring price $10.00/month → copy `price_xxx` ID
   - **YoBoss Pro** → recurring price $19.99/month → copy `price_xxx` ID
4. Create 3 Products for credit packs (one-time prices):
   - **Credits Small** → one-time $5.00 → copy `price_xxx` ID
   - **Credits Medium** → one-time $20.00 → copy `price_xxx` ID
   - **Credits Large** → one-time $50.00 → copy `price_xxx` ID
5. Dashboard → Developers → API keys → copy `sk_test_...` (secret key) and `pk_test_...` (publishable)
6. Dashboard → Developers → Webhooks → Add endpoint (will come back to this in Task 9 after deploying) → copy `whsec_...` signing secret
7. Dashboard → Settings → Billing → Customer portal → Activate test link, enable "Customers can update payment methods, cancel subscriptions"
8. Paste the following into `apps/web/.env.local`:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... # (will fill after Task 9)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_CREDITS_SMALL=price_...
STRIPE_PRICE_CREDITS_MEDIUM=price_...
STRIPE_PRICE_CREDITS_LARGE=price_...
```

---

## Task 1: Database migration — extend user_quotas and create credit_transactions

**Files:**
- Create: `supabase/migrations/020_stripe_billing.sql`

**Step 1: Write migration SQL**

Create `supabase/migrations/020_stripe_billing.sql`:

```sql
-- Add Stripe and credits fields to user_quotas
ALTER TABLE public.user_quotas
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_allowance_cents int DEFAULT 500,
  ADD COLUMN IF NOT EXISTS credits_balance_cents int DEFAULT 0;

-- subscription_status values: 'free' | 'active' | 'past_due' | 'canceled' | 'incomplete'

-- Audit trail for credit transactions
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents int NOT NULL, -- positive = add, negative = spend
  balance_after_cents int NOT NULL,
  kind text NOT NULL, -- 'purchase' | 'spend' | 'refund' | 'subscription_reset' | 'grant'
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  route text, -- if kind='spend', which feature consumed credits
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
  ON public.credit_transactions (user_id, created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own credit transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages credit transactions"
  ON public.credit_transactions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Seed: existing users get Free tier defaults
UPDATE public.user_quotas
SET subscription_status = 'free',
    monthly_allowance_cents = 500
WHERE subscription_status IS NULL;
```

**Step 2: Apply migration**

Run: `cd /Users/xudongguan/AICode/GoalWeek && npx supabase db push` (or apply manually via Supabase dashboard if project is remote-linked)
Expected: "Applied migration 020_stripe_billing.sql"

**Step 3: Verify schema**

Run this via Supabase SQL editor:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_quotas'
  AND column_name IN ('stripe_customer_id','stripe_subscription_id','subscription_status','monthly_allowance_cents','credits_balance_cents');
```
Expected: 5 rows returned

**Step 4: Commit**

```bash
git add supabase/migrations/020_stripe_billing.sql
git commit -m "feat(billing): add Stripe + credits columns to user_quotas, create credit_transactions table"
```

---

## Task 2: Install Stripe SDK and create typed helper module

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/stripe/client.ts`
- Create: `apps/web/src/lib/stripe/config.ts`

**Step 1: Install dependency**

Run: `cd apps/web && npm install stripe`
Expected: `added 1 package` (Stripe Node SDK)

**Step 2: Create Stripe client singleton**

Create `apps/web/src/lib/stripe/client.ts`:

```ts
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY not set — Stripe features will fail");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-03-31.basil",
  appInfo: {
    name: "YoBoss",
    version: "1.0.0",
  },
});
```

**Step 3: Create pricing config (source of truth for tiers)**

Create `apps/web/src/lib/stripe/config.ts`:

```ts
export type SubscriptionTier = "free" | "basic" | "pro";

export interface TierConfig {
  tier: SubscriptionTier;
  name: string;
  priceCents: number; // display only
  monthlyAllowanceCents: number;
  stripePriceId: string | null; // null for Free
  features: string[];
}

export const TIERS: Record<SubscriptionTier, TierConfig> = {
  free: {
    tier: "free",
    name: "Free",
    priceCents: 0,
    monthlyAllowanceCents: 500, // $5
    stripePriceId: null,
    features: [
      "$5/month AI usage",
      "All core features",
      "Goal planning & weekly schedules",
    ],
  },
  basic: {
    tier: "basic",
    name: "Basic",
    priceCents: 1000, // $10
    monthlyAllowanceCents: 1500, // $15
    stripePriceId: process.env.STRIPE_PRICE_BASIC || "",
    features: [
      "$15/month AI usage",
      "All Free features",
      "Priority support",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro",
    priceCents: 1999, // $19.99
    monthlyAllowanceCents: 4000, // $40
    stripePriceId: process.env.STRIPE_PRICE_PRO || "",
    features: [
      "$40/month AI usage",
      "All Basic features",
      "Unlimited workflows",
      "Advanced agents",
    ],
  },
};

export interface CreditPack {
  id: "small" | "medium" | "large";
  name: string;
  priceCents: number;
  creditsAddedCents: number;
  bonusLabel: string | null;
  stripePriceId: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "small",
    name: "Small Pack",
    priceCents: 500,
    creditsAddedCents: 500,
    bonusLabel: null,
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_SMALL || "",
  },
  {
    id: "medium",
    name: "Medium Pack",
    priceCents: 2000,
    creditsAddedCents: 2200,
    bonusLabel: "+10% bonus",
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_MEDIUM || "",
  },
  {
    id: "large",
    name: "Large Pack",
    priceCents: 5000,
    creditsAddedCents: 6000,
    bonusLabel: "+20% bonus",
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_LARGE || "",
  },
];

export function tierFromPriceId(priceId: string): SubscriptionTier | null {
  if (priceId === TIERS.basic.stripePriceId) return "basic";
  if (priceId === TIERS.pro.stripePriceId) return "pro";
  return null;
}

export function creditPackFromPriceId(priceId: string): CreditPack | null {
  return CREDIT_PACKS.find((p) => p.stripePriceId === priceId) || null;
}
```

**Step 4: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/lib/stripe/
git commit -m "feat(billing): install Stripe SDK, add tier + credit pack config"
```

---

## Task 3: Update rate-limit.ts to use monthly allowance + credits

**Files:**
- Modify: `apps/web/src/lib/ai/rate-limit.ts`

**Step 1: Read current implementation**

Read `apps/web/src/lib/ai/rate-limit.ts` lines 36–175 fully. Note the existing logic: daily request limit check, daily cost check, monthly cost check, `requests_today` increment.

**Step 2: Replace quota checks with allowance + credits logic**

In `withRateLimit()` function:

- KEEP: Upstash per-minute rate limiter (lines 40–57)
- KEEP: Auto-create quota row for new users
- KEEP: Daily `requests_today` counter + reset (for abuse prevention)
- KEEP: Monthly reset of `cost_this_month_cents`
- REPLACE: The daily cost limit and monthly cost limit checks
- ADD: Check if `cost_this_month_cents < monthly_allowance_cents`; if exceeded, check `credits_balance_cents > 0`; otherwise reject with "Monthly allowance used. Buy credits or upgrade plan."
- KEEP: The increment of `requests_today`

New check block (replaces lines 107–126):

```ts
// Has user exceeded monthly allowance?
const monthlySpent = quota.cost_this_month_cents;
const monthlyAllowance = quota.monthly_allowance_cents ?? 500;
const creditsBalance = quota.credits_balance_cents ?? 0;

if (monthlySpent >= monthlyAllowance && creditsBalance <= 0) {
  return {
    allowed: false,
    response: NextResponse.json(
      {
        error: "Monthly allowance exhausted. Upgrade your plan or buy credits to continue.",
        code: "QUOTA_EXCEEDED",
      },
      { status: 402 }
    ),
  };
}

// Keep daily request count check as abuse guardrail
if (quota.requests_today >= (quota.daily_request_limit ?? 500)) {
  return {
    allowed: false,
    response: NextResponse.json(
      { error: "Daily request limit reached. Resets at midnight." },
      { status: 429 }
    ),
  };
}
```

**Step 3: Update `logUsage()` to deduct from allowance first, then credits**

Replace the existing update logic (lines 160–175) with:

```ts
// Re-fetch latest quota to avoid races
const { data: quota } = await supabase
  .from("user_quotas")
  .select("cost_this_month_cents, monthly_allowance_cents, credits_balance_cents")
  .eq("user_id", userId)
  .single();

if (!quota) return;

const spent = quota.cost_this_month_cents;
const allowance = quota.monthly_allowance_cents ?? 500;
const credits = quota.credits_balance_cents ?? 0;

const allowanceRemaining = Math.max(0, allowance - spent);
const fromAllowance = Math.min(costCents, allowanceRemaining);
const fromCredits = Math.max(0, costCents - fromAllowance);

// Update counters
await supabase
  .from("user_quotas")
  .update({
    cost_today_cents: (quota.cost_today_cents ?? 0) + costCents,
    cost_this_month_cents: spent + fromAllowance + fromCredits,
    credits_balance_cents: Math.max(0, credits - fromCredits),
  })
  .eq("user_id", userId);

// If we spent from credits, log the transaction
if (fromCredits > 0) {
  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount_cents: -fromCredits,
    balance_after_cents: Math.max(0, credits - fromCredits),
    kind: "spend",
    route,
  });
}
```

(Note: The existing signature needs to be checked. Since `logUsage` already reads quota, adjust to match.)

**Step 4: Run typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors related to rate-limit.ts

**Step 5: Commit**

```bash
git add apps/web/src/lib/ai/rate-limit.ts
git commit -m "feat(billing): route AI spend through monthly allowance then credits wallet"
```

---

## Task 4: Server action — get/sync subscription state

**Files:**
- Modify: `apps/web/src/lib/db/actions.ts`

**Step 1: Add `getBillingState` server action**

Append to `actions.ts`:

```ts
export async function getBillingState() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: quota } = await supabase
    .from("user_quotas")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!quota) {
    // Auto-create default row
    const { data: created } = await supabase
      .from("user_quotas")
      .insert({ user_id: user.id })
      .select()
      .single();
    return created;
  }

  return quota;
}

export async function getRecentCreditTransactions(limit = 20) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/db/actions.ts
git commit -m "feat(billing): add getBillingState and credit transaction history actions"
```

---

## Task 5: Checkout session endpoint for subscriptions

**Files:**
- Create: `apps/web/src/app/api/billing/checkout/route.ts`

**Step 1: Create the endpoint**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { stripe } from "@/lib/stripe/client";
import { TIERS, CREDIT_PACKS, type SubscriptionTier } from "@/lib/stripe/config";

// POST /api/billing/checkout
// Body: { kind: 'subscription'; tier: 'basic'|'pro' } | { kind: 'credits'; pack: 'small'|'medium'|'large' }
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { kind } = body;

  // Ensure user has a Stripe customer
  const admin = createAdminClient();
  const { data: quota } = await admin
    .from("user_quotas")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  let customerId = quota?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("user_quotas").update({ stripe_customer_id: customerId }).eq("user_id", user.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  let priceId: string;
  let mode: "subscription" | "payment";
  let metadata: Record<string, string>;

  if (kind === "subscription") {
    const tier = body.tier as SubscriptionTier;
    if (tier === "free" || !TIERS[tier]?.stripePriceId) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    priceId = TIERS[tier].stripePriceId!;
    mode = "subscription";
    metadata = { kind: "subscription", tier, user_id: user.id };
  } else if (kind === "credits") {
    const pack = CREDIT_PACKS.find((p) => p.id === body.pack);
    if (!pack) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
    priceId = pack.stripePriceId;
    mode = "payment";
    metadata = { kind: "credits", pack: pack.id, credits_cents: String(pack.creditsAddedCents), user_id: user.id };
  } else {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/account?checkout=success`,
    cancel_url: `${appUrl}/account?checkout=cancelled`,
    metadata,
    ...(mode === "subscription"
      ? { subscription_data: { metadata } }
      : {}),
  });

  return NextResponse.json({ url: session.url });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/api/billing/checkout/route.ts
git commit -m "feat(billing): add Stripe Checkout session endpoint for subscriptions and credit packs"
```

---

## Task 6: Customer portal endpoint (manage/cancel subscription)

**Files:**
- Create: `apps/web/src/app/api/billing/portal/route.ts`

**Step 1: Create endpoint**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { stripe } from "@/lib/stripe/client";

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: quota } = await supabase
    .from("user_quotas")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!quota?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription to manage" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer: quota.stripe_customer_id,
    return_url: `${appUrl}/account`,
  });

  return NextResponse.json({ url: session.url });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/api/billing/portal/route.ts
git commit -m "feat(billing): add Stripe customer portal endpoint"
```

---

## Task 7: Webhook handler — the core of state sync

**Files:**
- Create: `apps/web/src/app/api/webhooks/stripe/route.ts`

**Step 1: Create endpoint with signature verification and event routing**

```ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/db/admin";
import { TIERS, tierFromPriceId, creditPackFromPriceId } from "@/lib/stripe/config";

// IMPORTANT: Stripe needs the raw body for signature verification
export const config = { api: { bodyParser: false } };

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const kind = session.metadata?.kind;

        if (kind === "credits") {
          // One-time credits purchase
          const userId = session.metadata!.user_id;
          const creditsCents = parseInt(session.metadata!.credits_cents, 10);

          const { data: quota } = await admin
            .from("user_quotas")
            .select("credits_balance_cents")
            .eq("user_id", userId)
            .single();

          const newBalance = (quota?.credits_balance_cents || 0) + creditsCents;
          await admin
            .from("user_quotas")
            .update({ credits_balance_cents: newBalance })
            .eq("user_id", userId);

          await admin.from("credit_transactions").insert({
            user_id: userId,
            amount_cents: creditsCents,
            balance_after_cents: newBalance,
            kind: "purchase",
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id || null,
          });
        }
        // For subscriptions, `customer.subscription.created` will fire separately and handle state
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id;
        const tier = tierFromPriceId(priceId || "") || "free";
        const allowance = TIERS[tier].monthlyAllowanceCents;

        // Find the user via customer id
        const { data: quota } = await admin
          .from("user_quotas")
          .select("user_id, cost_this_month_cents")
          .eq("stripe_customer_id", sub.customer as string)
          .single();

        if (!quota) {
          console.error("[stripe webhook] No quota row for customer", sub.customer);
          break;
        }

        const wasActive = sub.status === "active" || sub.status === "trialing";

        await admin.from("user_quotas").update({
          stripe_subscription_id: sub.id,
          subscription_status: wasActive ? "active" : sub.status,
          subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          monthly_allowance_cents: wasActive ? allowance : TIERS.free.monthlyAllowanceCents,
          tier,
        }).eq("user_id", quota.user_id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await admin.from("user_quotas").update({
          subscription_status: "canceled",
          stripe_subscription_id: null,
          monthly_allowance_cents: TIERS.free.monthlyAllowanceCents,
          tier: "free",
        }).eq("stripe_customer_id", sub.customer as string);
        break;
      }

      case "invoice.payment_succeeded": {
        // New billing cycle — reset monthly spend to 0
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason === "subscription_cycle") {
          await admin.from("user_quotas").update({
            cost_this_month_cents: 0,
            last_month_reset: new Date().toISOString().slice(0, 10),
          }).eq("stripe_customer_id", invoice.customer as string);
        }
        break;
      }

      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe webhook] Handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/api/webhooks/stripe/route.ts
git commit -m "feat(billing): Stripe webhook handler for subscriptions, credits, and period resets"
```

---

## Task 8: Pricing page (public)

**Files:**
- Create: `apps/web/src/app/(app)/pricing/page.tsx`

**Step 1: Create pricing page**

```tsx
"use client";

import { useState } from "react";
import { Check, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

const TIERS_DISPLAY = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    priceLabel: "forever",
    allowance: "$5 / month",
    features: [
      "All core features",
      "Goal planning & weekly schedules",
      "Personal to-do list",
      "Basic AI agents",
    ],
    cta: "Current Plan",
    disabled: true,
  },
  {
    id: "basic" as const,
    name: "Basic",
    price: "$10",
    priceLabel: "per month",
    allowance: "$15 / month",
    features: [
      "Everything in Free",
      "3× AI usage allowance",
      "Priority support",
    ],
    cta: "Upgrade to Basic",
    disabled: false,
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "$19.99",
    priceLabel: "per month",
    allowance: "$40 / month",
    features: [
      "Everything in Basic",
      "8× AI usage allowance",
      "Unlimited workflows",
      "Advanced agent templates",
    ],
    cta: "Upgrade to Pro",
    disabled: false,
    highlight: true,
  },
];

const CREDIT_PACKS_DISPLAY = [
  { id: "small" as const, name: "Small", price: "$5", credits: "$5 credits", bonus: null },
  { id: "medium" as const, name: "Medium", price: "$20", credits: "$22 credits", bonus: "+10%" },
  { id: "large" as const, name: "Large", price: "$50", credits: "$60 credits", bonus: "+20%" },
];

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const startCheckout = async (kind: "subscription" | "credits", id: string) => {
    setLoading(id);
    try {
      const body = kind === "subscription" ? { kind, tier: id } : { kind, pack: id };
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) router.push(data.url);
      else alert(data.error || "Checkout failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-[#2B2B2B] mb-3">Simple, transparent pricing</h1>
        <p className="text-lg text-[#6F6A64]">Start free. Upgrade when you need more AI power.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {TIERS_DISPLAY.map((tier) => (
          <div
            key={tier.id}
            className={`rounded-2xl border p-8 ${
              tier.highlight
                ? "border-[#7FAEE6] bg-[#EAF3FD] shadow-lg"
                : "border-[#E7DED2] bg-[#FFFDF9]"
            }`}
          >
            {tier.highlight && (
              <span className="inline-block text-xs font-semibold text-white bg-[#7FAEE6] px-2 py-0.5 rounded-full mb-3">
                MOST POPULAR
              </span>
            )}
            <h2 className="text-2xl font-bold text-[#2B2B2B]">{tier.name}</h2>
            <div className="mt-2 mb-1">
              <span className="text-4xl font-bold text-[#2B2B2B]">{tier.price}</span>
              <span className="text-sm text-[#6F6A64] ml-2">{tier.priceLabel}</span>
            </div>
            <p className="text-sm font-semibold text-[#7FB38A] mb-6">{tier.allowance}</p>
            <ul className="space-y-2 mb-8">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-[#2B2B2B]">
                  <Check className="h-4 w-4 text-[#7FB38A] mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => !tier.disabled && startCheckout("subscription", tier.id)}
              disabled={tier.disabled || loading === tier.id}
              className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                tier.disabled
                  ? "bg-[#F1ECE4] text-[#9B948B] cursor-not-allowed"
                  : "bg-[#7FAEE6] text-white hover:bg-[#6A9DDA]"
              }`}
            >
              {loading === tier.id ? "Loading..." : tier.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-[#E7DED2] pt-12">
        <div className="flex items-center gap-2 mb-2 justify-center">
          <Zap className="h-5 w-5 text-[#7FAEE6]" />
          <h2 className="text-2xl font-bold text-[#2B2B2B]">Need more? Top up with credits.</h2>
        </div>
        <p className="text-center text-sm text-[#6F6A64] mb-8">Credits never expire and stack on top of your monthly allowance.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {CREDIT_PACKS_DISPLAY.map((pack) => (
            <div key={pack.id} className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6 text-center">
              <h3 className="text-lg font-bold text-[#2B2B2B]">{pack.name}</h3>
              <div className="text-3xl font-bold my-2">{pack.price}</div>
              <p className="text-sm text-[#7FB38A] font-semibold">{pack.credits}</p>
              {pack.bonus && <p className="text-xs text-[#D4B06A] mb-3">{pack.bonus} bonus</p>}
              <button
                onClick={() => startCheckout("credits", pack.id)}
                disabled={loading === pack.id}
                className="mt-4 w-full py-2 rounded-lg bg-[#7FAEE6] text-white text-sm font-semibold hover:bg-[#6A9DDA]"
              >
                {loading === pack.id ? "Loading..." : "Buy"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/pricing/page.tsx
git commit -m "feat(billing): pricing page with tiers and credit packs"
```

---

## Task 9: Account page — subscription management section

**Files:**
- Modify: `apps/web/src/app/(app)/account/page.tsx`

**Step 1: Add subscription section**

Above the "AI Usage" section, insert a new "Subscription & Billing" card that:
- Displays current tier (from `quota.tier` / `quota.subscription_status`)
- Shows monthly allowance: `${quota.cost_this_month_cents}/${quota.monthly_allowance_cents}` with progress bar
- Shows credits balance: `${quota.credits_balance_cents}`
- "Upgrade Plan" button → routes to `/pricing`
- "Manage Subscription" button → POST `/api/billing/portal`, redirect to returned URL (only show if `stripe_customer_id` exists)
- "Buy Credits" button → routes to `/pricing#credits`

**Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/account/page.tsx
git commit -m "feat(billing): add subscription and credits section to account page"
```

---

## Task 10: Local webhook testing with Stripe CLI

**Files:**
- No code changes

**Step 1: Install Stripe CLI (USER)**

Run: `brew install stripe/stripe-cli/stripe` (macOS) or see https://stripe.com/docs/stripe-cli
Expected: `stripe --version` shows a version

**Step 2: Login (USER)**

Run: `stripe login`
Expected: Opens browser, authorizes CLI against your Stripe test account

**Step 3: Forward webhooks to local**

Run: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
Expected: Prints `webhook signing secret: whsec_...`

**Step 4: USER copies that `whsec_...` into `.env.local` as `STRIPE_WEBHOOK_SECRET`, then restarts dev server**

**Step 5: End-to-end test — Basic subscription**

1. In app, click Upgrade → Basic
2. Stripe Checkout opens → use test card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP
3. Complete → redirected to `/account?checkout=success`
4. Check `stripe listen` terminal: should see `checkout.session.completed` and `customer.subscription.created` → 200 response
5. Check Supabase: `user_quotas.subscription_status = 'active'`, `tier = 'basic'`, `monthly_allowance_cents = 1500`

**Step 6: End-to-end test — Credit purchase**

1. Buy Small Pack → test card `4242 4242 4242 4242` → complete
2. Check webhook fires `checkout.session.completed` with `kind=credits`
3. Check Supabase: `credits_balance_cents = 500`, new row in `credit_transactions`

**Step 7: End-to-end test — Cancel via portal**

1. Click "Manage Subscription" → opens portal → cancel
2. Webhook fires `customer.subscription.deleted`
3. Check `subscription_status = 'canceled'`, `tier = 'free'`, `monthly_allowance_cents = 500`

**Step 8: Commit any fixes discovered during testing**

```bash
git commit -am "fix(billing): ..." # if needed
```

---

## Task 11: Production webhook setup (when ready to go live)

**Steps (USER does these, no code changes):**

1. Deploy to production (e.g. Vercel) with all `STRIPE_*` env vars set
2. Stripe Dashboard → Developers → Webhooks → Add endpoint
3. URL: `https://yourdomain.com/api/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
5. Copy the new production `whsec_...` → set in production env → redeploy
6. Toggle Stripe to Live mode → create live products/prices → update env vars with live `sk_live_...` and live price IDs

---

## Verification Checklist

- [ ] Migration applied, all new columns present
- [ ] Stripe products created, price IDs in `.env.local`
- [ ] `rate-limit.ts` spends allowance before credits (unit test or manual)
- [ ] Free user hits quota → gets 402 error with friendly message
- [ ] Subscription checkout redirects back and activates tier
- [ ] Credit purchase increases `credits_balance_cents`
- [ ] Customer portal cancels subscription → tier drops to Free
- [ ] `invoice.payment_succeeded` resets `cost_this_month_cents` monthly
- [ ] Account page shows correct state in all conditions

---

## Notes & Gotchas

- **Checkout session vs. subscription events:** For subscriptions, don't update state on `checkout.session.completed` — use `customer.subscription.created` instead. Stripe fires both, but the subscription event has the authoritative data.
- **Idempotency:** Webhook handler should be idempotent. Stripe retries on 5xx. Setting `stripe_subscription_id` with `.eq('user_id', ...)` won't duplicate.
- **Race condition on user creation:** Rate-limit auto-creates quota row on first request. When webhook arrives, customer_id might exist before quota row. Solution: webhook uses `upsert` or handle null gracefully.
- **Tax:** Stripe doesn't handle US sales tax automatically unless you enable Stripe Tax. For MVP targeting developers, skip this.
- **Refunds:** Not implemented in MVP. Handle manually via Stripe Dashboard if needed.
- **Testing cards:** Use `4242 4242 4242 4242` for success, `4000 0000 0000 9995` for insufficient funds.
