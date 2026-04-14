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
    priceCents: 999, // $9.99 (user's actual Stripe product is priced at $9.99, NOT $10 — keep display in sync)
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
