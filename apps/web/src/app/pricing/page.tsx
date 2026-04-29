"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { getBillingState } from "@/lib/db/actions";

type TierId = "free" | "basic" | "pro";

const TIERS: Array<{
  id: TierId;
  nameKey: "tierFreeName" | "tierBasicName" | "tierProName";
  price: string;
  priceLabelKey: "tierFreePriceLabel" | "tierBasicPriceLabel" | "tierProPriceLabel";
  allowanceKey: "tierFreeAllowance" | "tierBasicAllowance" | "tierProAllowance";
  featureKeys: string[];
  highlight?: boolean;
}> = [
  {
    id: "free",
    nameKey: "tierFreeName",
    price: "$0",
    priceLabelKey: "tierFreePriceLabel",
    allowanceKey: "tierFreeAllowance",
    featureKeys: ["tierFreeF1", "tierFreeF2", "tierFreeF3", "tierFreeF4"],
  },
  {
    id: "basic",
    nameKey: "tierBasicName",
    price: "$9.99",
    priceLabelKey: "tierBasicPriceLabel",
    allowanceKey: "tierBasicAllowance",
    featureKeys: ["tierBasicF1", "tierBasicF2", "tierBasicF3"],
  },
  {
    id: "pro",
    nameKey: "tierProName",
    price: "$19.99",
    priceLabelKey: "tierProPriceLabel",
    allowanceKey: "tierProAllowance",
    featureKeys: ["tierProF1", "tierProF2", "tierProF3", "tierProF4"],
    highlight: true,
  },
];

const CREDIT_PACKS: Array<{
  id: "small" | "medium" | "large";
  nameKey: "packSmall" | "packMedium" | "packLarge";
  price: string;
  creditsAmount: string;
  bonus: string | null;
}> = [
  { id: "small", nameKey: "packSmall", price: "$5", creditsAmount: "$5", bonus: null },
  { id: "medium", nameKey: "packMedium", price: "$20", creditsAmount: "$22", bonus: "+10%" },
  { id: "large", nameKey: "packLarge", price: "$50", creditsAmount: "$60", bonus: "+20%" },
];

export default function PricingPage() {
  const t = useTranslations("pricing");
  const tCommon = useTranslations("common");
  const [loading, setLoading] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<TierId>("free");
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);
  // signedIn is determined by whether getBillingState resolves; on the
  // public landing-style entry to this page we render sign-up CTAs
  // instead of subscribe/portal actions.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const q = await getBillingState();
        setSignedIn(true);
        const tier = (q?.tier as TierId) ?? "free";
        setCurrentTier(tier);
        // Any non-free tier with a linked subscription id means Stripe has a
        // live subscription for this user, so plan changes must go through
        // the portal rather than creating a new checkout session.
        setHasActiveSub(!!q?.stripe_subscription_id && tier !== "free");
      } catch {
        // Not authenticated — keep defaults; CTAs will switch to sign-up.
        setSignedIn(false);
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
      else alert(data.error || t("portalFailed"));
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
      else alert(data.error || t("checkoutFailed"));
    } finally {
      setLoading(null);
    }
  };

  function getCtaState(tierId: TierId): {
    label: string;
    disabled: boolean;
    onClick?: () => void;
    href?: string;
  } {
    if (!billingLoaded) {
      return { label: tCommon("loading"), disabled: true };
    }
    const tierName =
      tierId === "basic"
        ? t("tierBasicName")
        : tierId === "pro"
          ? t("tierProName")
          : t("tierFreeName");

    // Public visitor (not signed in): every tier CTA points at sign-up.
    if (!signedIn) {
      if (tierId === "free") {
        return { label: t("ctaSignupFree"), disabled: false, href: "/" };
      }
      return { label: t("ctaSignupTier", { tier: tierName }), disabled: false, href: "/" };
    }
    if (tierId === currentTier) {
      return { label: t("ctaCurrent"), disabled: true };
    }

    const portalLoadingLabel = loading === "portal" ? tCommon("loading") : null;

    // Free user (no active subscription) paths
    if (!hasActiveSub) {
      if (tierId === "free") {
        // Free → Free never happens (caught by "currentTier" check above)
        // but guard against the edge case of data inconsistency.
        return { label: t("ctaCurrent"), disabled: true };
      }
      // Free → Basic/Pro: normal checkout flow
      return {
        label: loading === tierId ? tCommon("loading") : t("ctaUpgradeTo", { tier: tierName }),
        disabled: loading === tierId,
        onClick: () => startCheckout("subscription", tierId),
      };
    }

    // Paid user paths — all plan changes go through the Stripe portal,
    // but the label should describe the action, not the tool.
    if (tierId === "free") {
      return {
        label: portalLoadingLabel ?? t("ctaCancel"),
        disabled: loading === "portal",
        onClick: openPortal,
      };
    }
    return {
      label: portalLoadingLabel ?? t("ctaSwitchTo", { tier: tierName }),
      disabled: loading === "portal",
      onClick: openPortal,
    };
  }

  return (
    <div className="min-h-screen bg-[#F6F3EE]">
      <div className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tighter text-[#2B2B2B]">
          YoBoss
        </Link>
        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {signedIn ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm text-[#6F6A64] hover:text-[#2B2B2B] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("back")}
            </Link>
          ) : (
            <Link
              href="/"
              className="text-sm text-[#007AFF] hover:text-[#0066D6] font-semibold"
            >
              {t("signupArrow")}
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[#2B2B2B] mb-3">{t("title")}</h1>
          <p className="text-lg text-[#6F6A64]">{t("subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {TIERS.map((tier) => {
            const cta = getCtaState(tier.id);
            const isCurrent = tier.id === currentTier;
            return (
              <div
                key={tier.id}
                className={`rounded-2xl border p-8 relative ${
                  isCurrent
                    ? "border-[#7FB38A] bg-[#F3F8F3]"
                    : tier.highlight
                    ? "border-[#007AFF] bg-[#E6F2FF] shadow-lg"
                    : "border-[#E7DED2] bg-[#FFFDF9]"
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-3 left-6 inline-block text-xs font-semibold text-white bg-[#7FB38A] px-2 py-0.5 rounded-full">
                    {t("currentPlan")}
                  </span>
                )}
                {!isCurrent && tier.highlight && (
                  <span className="inline-block text-xs font-semibold text-white bg-[#007AFF] px-2 py-0.5 rounded-full mb-3">
                    {t("mostPopular")}
                  </span>
                )}
                <h2 className="text-2xl font-bold text-[#2B2B2B]">{t(tier.nameKey)}</h2>
                <div className="mt-2 mb-1">
                  <span className="text-4xl font-bold text-[#2B2B2B]">{tier.price}</span>
                  <span className="text-sm text-[#6F6A64] ml-2">{t(tier.priceLabelKey)}</span>
                </div>
                <p className="text-sm font-semibold text-[#7FB38A] mb-6">{t(tier.allowanceKey)}</p>
                <ul className="space-y-2 mb-8">
                  {tier.featureKeys.map((fk) => (
                    <li key={fk} className="flex items-start gap-2 text-sm text-[#2B2B2B]">
                      <Check className="h-4 w-4 text-[#7FB38A] mt-0.5 shrink-0" />
                      {t(fk)}
                    </li>
                  ))}
                </ul>
                {cta.href ? (
                  <Link
                    href={cta.href}
                    className="block text-center w-full py-2.5 rounded-lg font-semibold text-sm transition-colors bg-[#007AFF] text-white hover:bg-[#0066D6]"
                  >
                    {cta.label}
                  </Link>
                ) : (
                  <button
                    onClick={cta.onClick}
                    disabled={cta.disabled}
                    className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                      cta.disabled
                        ? "bg-[#F1ECE4] text-[#9B948B] cursor-not-allowed"
                        : "bg-[#007AFF] text-white hover:bg-[#0066D6]"
                    }`}
                  >
                    {cta.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-[#E7DED2] pt-12">
          <div className="flex items-center gap-2 mb-2 justify-center">
            <Zap className="h-5 w-5 text-[#007AFF]" />
            <h2 className="text-2xl font-bold text-[#2B2B2B]">{t("creditsTitle")}</h2>
          </div>
          <p className="text-center text-sm text-[#6F6A64] mb-8">{t("creditsSubtitle")}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.id} className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6 text-center">
                <h3 className="text-lg font-bold text-[#2B2B2B]">{t(pack.nameKey)}</h3>
                <div className="text-3xl font-bold my-2">{pack.price}</div>
                <p className="text-sm text-[#7FB38A] font-semibold">{t("packCredits", { amount: pack.creditsAmount })}</p>
                {pack.bonus && (
                  <p className="text-xs text-[#D4B06A] mb-3">{t("packBonus", { percent: pack.bonus })}</p>
                )}
                {signedIn ? (
                  <button
                    onClick={() => startCheckout("credits", pack.id)}
                    disabled={loading === pack.id}
                    className="mt-4 w-full py-2 rounded-lg bg-[#007AFF] text-white text-sm font-semibold hover:bg-[#0066D6]"
                  >
                    {loading === pack.id ? tCommon("loading") : t("buy")}
                  </button>
                ) : (
                  <Link
                    href="/"
                    className="block text-center mt-4 w-full py-2 rounded-lg bg-[#007AFF] text-white text-sm font-semibold hover:bg-[#0066D6]"
                  >
                    {t("signupToBuy")}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
