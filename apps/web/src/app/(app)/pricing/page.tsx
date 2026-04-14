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
    price: "$9.99",
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
