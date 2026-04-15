"use client";

import { useState, useEffect } from "react";
import { Check, Zap } from "lucide-react";
import { getBillingState } from "@/lib/db/actions";

type TierId = "free" | "basic" | "pro";

const TIERS_DISPLAY: Array<{
  id: TierId;
  name: string;
  price: string;
  priceLabel: string;
  allowance: string;
  features: string[];
  highlight?: boolean;
}> = [
  {
    id: "free",
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
  },
  {
    id: "basic",
    name: "Basic",
    price: "$9.99",
    priceLabel: "per month",
    allowance: "$15 / month",
    features: [
      "Everything in Free",
      "3× AI usage allowance",
      "Priority support",
    ],
  },
  {
    id: "pro",
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
    highlight: true,
  },
];

const CREDIT_PACKS_DISPLAY = [
  { id: "small" as const, name: "Small", price: "$5", credits: "$5 credits", bonus: null },
  { id: "medium" as const, name: "Medium", price: "$20", credits: "$22 credits", bonus: "+10%" },
  { id: "large" as const, name: "Large", price: "$50", credits: "$60 credits", bonus: "+20%" },
];

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<TierId>("free");
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const q = await getBillingState();
        const tier = (q?.tier as TierId) ?? "free";
        setCurrentTier(tier);
        // Any non-free tier with a linked subscription id means Stripe has a
        // live subscription for this user, so plan changes must go through
        // the portal rather than creating a new checkout session.
        setHasActiveSub(!!q?.stripe_subscription_id && tier !== "free");
      } catch (err) {
        console.error("Failed to load billing state:", err);
      } finally {
        setBillingLoaded(true);
      }
    })();
  }, []);

  const openPortal = async () => {
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Failed to open portal");
    } finally {
      setLoading(null);
    }
  };

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
      // Stripe Checkout lives on checkout.stripe.com — router.push() treats
      // that as an internal Next.js route and silently does nothing. Use a
      // hard nav, same pattern as the portal handler above.
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Checkout failed");
    } finally {
      setLoading(null);
    }
  };

  function getCtaState(tierId: TierId): {
    label: string;
    disabled: boolean;
    onClick?: () => void;
  } {
    if (!billingLoaded) {
      return { label: "Loading…", disabled: true };
    }
    if (tierId === currentTier) {
      return { label: "Current Plan", disabled: true };
    }

    const tierName = tierId === "basic" ? "Basic" : tierId === "pro" ? "Pro" : "Free";
    const portalLoadingLabel = loading === "portal" ? "Loading…" : null;

    // Free user (no active subscription) paths
    if (!hasActiveSub) {
      if (tierId === "free") {
        // Free → Free never happens (caught by "currentTier" check above)
        // but guard against the edge case of data inconsistency.
        return { label: "Current Plan", disabled: true };
      }
      // Free → Basic/Pro: normal checkout flow
      return {
        label: loading === tierId ? "Loading…" : `Upgrade to ${tierName}`,
        disabled: loading === tierId,
        onClick: () => startCheckout("subscription", tierId),
      };
    }

    // Paid user paths — all plan changes go through the Stripe portal,
    // but the label should describe the action, not the tool.
    if (tierId === "free") {
      // Paid → Free = cancel subscription
      return {
        label: portalLoadingLabel ?? "Cancel subscription",
        disabled: loading === "portal",
        onClick: openPortal,
      };
    }
    // Paid → other paid tier = switch plan (could be upgrade or downgrade)
    return {
      label: portalLoadingLabel ?? `Switch to ${tierName}`,
      disabled: loading === "portal",
      onClick: openPortal,
    };
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-[#2B2B2B] mb-3">Simple, transparent pricing</h1>
        <p className="text-lg text-[#6F6A64]">Start free. Upgrade when you need more AI power.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {TIERS_DISPLAY.map((tier) => {
          const cta = getCtaState(tier.id);
          const isCurrent = tier.id === currentTier;
          return (
            <div
              key={tier.id}
              className={`rounded-2xl border p-8 relative ${
                isCurrent
                  ? "border-[#7FB38A] bg-[#F3F8F3]"
                  : tier.highlight
                  ? "border-[#7FAEE6] bg-[#EAF3FD] shadow-lg"
                  : "border-[#E7DED2] bg-[#FFFDF9]"
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-3 left-6 inline-block text-xs font-semibold text-white bg-[#7FB38A] px-2 py-0.5 rounded-full">
                  CURRENT PLAN
                </span>
              )}
              {!isCurrent && tier.highlight && (
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
                onClick={cta.onClick}
                disabled={cta.disabled}
                className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  cta.disabled
                    ? "bg-[#F1ECE4] text-[#9B948B] cursor-not-allowed"
                    : "bg-[#7FAEE6] text-white hover:bg-[#6A9DDA]"
                }`}
              >
                {cta.label}
              </button>
            </div>
          );
        })}
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
