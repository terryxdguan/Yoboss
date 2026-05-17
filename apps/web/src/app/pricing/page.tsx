"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Zap } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { Wordmark } from "@/components/brand/wordmark";
import { getBillingState } from "@/lib/db/actions";

type TierId = "free" | "basic" | "pro";

const TIERS: Array<{
  id: TierId;
  nameKey: "tierFreeName" | "tierBasicName" | "tierProName";
  price: string;
  originalPrice?: string;
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
    price: "$6.99",
    originalPrice: "$9.99",
    priceLabelKey: "tierBasicPriceLabel",
    allowanceKey: "tierBasicAllowance",
    featureKeys: ["tierBasicF1", "tierBasicF2", "tierBasicF3"],
  },
  {
    id: "pro",
    nameKey: "tierProName",
    price: "$14.99",
    originalPrice: "$19.99",
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
  const locale = useLocale();
  const [loading, setLoading] = useState<string | null>(null);
  const [currentTier, setCurrentTier] = useState<TierId>("free");
  const [hasActiveSub, setHasActiveSub] = useState(false);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [billingLoaded, setBillingLoaded] = useState(false);
  // signedIn is determined by whether getBillingState resolves; on the
  // public landing-style entry to this page we render sign-up CTAs
  // instead of subscribe/portal actions.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const q = await getBillingState();
        if (!q) {
          // Anonymous visitor — keep defaults; CTAs render as sign-up.
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        const tier = (q.tier as TierId) ?? "free";
        setCurrentTier(tier);
        // Any non-free tier with a linked subscription id means Stripe has a
        // live subscription for this user, so plan changes must go through
        // the portal rather than creating a new checkout session.
        setHasActiveSub(!!q.stripe_subscription_id && tier !== "free");
        setCancelAtPeriodEnd(!!q.cancel_at_period_end);
        setPeriodEnd(q.subscription_current_period_end ?? null);
      } catch {
        // Unexpected DB / network failure — fall back to logged-out CTAs.
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
    const portalLoadingLabel = loading === "portal" ? tCommon("loading") : null;

    // The user's current tier card is also the action hub for that tier:
    // Free users see a passive "Current Plan" label; paid users get the
    // Cancel / Resume entry point here instead of on the Free card, which
    // is otherwise tier-agnostic.
    if (tierId === currentTier) {
      if (!hasActiveSub) {
        return { label: t("ctaCurrent"), disabled: true };
      }
      if (cancelAtPeriodEnd) {
        return {
          label: portalLoadingLabel ?? t("ctaResume"),
          disabled: loading === "portal",
          onClick: openPortal,
        };
      }
      return {
        label: portalLoadingLabel ?? t("ctaCancel"),
        disabled: loading === "portal",
        onClick: openPortal,
      };
    }

    // Free user (no active subscription) on a paid card → checkout
    if (!hasActiveSub) {
      return {
        label: loading === tierId ? tCommon("loading") : t("ctaUpgradeTo", { tier: tierName }),
        disabled: loading === tierId,
        onClick: () => startCheckout("subscription", tierId),
      };
    }

    // Paid user looking at a non-current tier card.
    // Free card stays purely descriptive — no subscription state, no cancel
    // action (that lives on the current paid card above).
    if (tierId === "free") {
      return { label: t("ctaFreePlan"), disabled: true };
    }
    return {
      label: portalLoadingLabel ?? t("ctaSwitchTo", { tier: tierName }),
      disabled: loading === "portal",
      onClick: openPortal,
    };
  }

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <div className="max-w-6xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link href="/" aria-label="YoBoss home" className="hover:opacity-80 transition-opacity">
          <Wordmark className="h-7" />
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
              className="text-sm text-[#7C2DE8] hover:text-[#6921C7] font-semibold"
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
                    ? "border-[#C9A8F7] bg-[#F8F4FE]"
                    : tier.highlight
                    ? "border-[#7C2DE8] bg-[#F3ECFB] shadow-lg"
                    : "border-[#E7DED2] bg-[#FFFFFF]"
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-6 flex items-center gap-1.5">
                    <span className="inline-block text-[10px] font-bold tracking-[0.12em] uppercase text-white bg-[#7C2DE8] px-2.5 py-1 rounded-full shadow-brand">
                      {t("currentPlan")}
                    </span>
                    {cancelAtPeriodEnd && (
                      <span className="inline-block text-[10px] font-bold tracking-[0.12em] uppercase text-[#C99442] bg-[#FAF2E0] border border-[#E8D5A5] px-2.5 py-1 rounded-full">
                        {t("canceling")}
                      </span>
                    )}
                  </div>
                )}
                {!isCurrent && tier.highlight && (
                  <span className="inline-block text-xs font-semibold text-white bg-[#7C2DE8] px-2 py-0.5 rounded-full mb-3">
                    {t("mostPopular")}
                  </span>
                )}
                <h2 className="text-2xl font-bold text-[#2B2B2B]">{t(tier.nameKey)}</h2>
                <div className="mt-2 mb-1 flex items-baseline flex-wrap gap-x-2">
                  <span className="text-4xl font-bold text-[#2B2B2B]">{tier.price}</span>
                  {tier.originalPrice && (
                    <span className="text-lg text-[#9B948B] line-through">
                      {tier.originalPrice}
                    </span>
                  )}
                  <span className="text-sm text-[#6F6A64]">{t(tier.priceLabelKey)}</span>
                </div>
                {tier.originalPrice && (
                  <p className="text-xs font-semibold text-[#C99442] mb-1">
                    {t("launchPrice")}
                  </p>
                )}
                <p className="text-sm font-semibold text-[#7FB38A]">{t(tier.allowanceKey)}</p>
                {isCurrent && cancelAtPeriodEnd && periodEnd ? (
                  <p className="text-xs text-[#9B948B] mt-1 mb-6">
                    {t("ctaCancelsOn", {
                      date: new Date(periodEnd).toLocaleDateString(locale, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }),
                    })}
                  </p>
                ) : (
                  <div className="mb-6" />
                )}
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
                    className="block text-center w-full py-2.5 rounded-lg font-semibold text-sm transition-colors bg-[#7C2DE8] text-white hover:bg-[#6921C7]"
                  >
                    {cta.label}
                  </Link>
                ) : (
                  <button
                    onClick={cta.onClick}
                    disabled={cta.disabled}
                    className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                      cta.disabled
                        ? "bg-[#F6F3EE] text-[#9B948B] cursor-not-allowed"
                        : "bg-[#7C2DE8] text-white hover:bg-[#6921C7]"
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
            <Zap className="h-5 w-5 text-[#7C2DE8]" />
            <h2 className="text-2xl font-bold text-[#2B2B2B]">{t("creditsTitle")}</h2>
          </div>
          <p className="text-center text-sm text-[#6F6A64] mb-8">{t("creditsSubtitle")}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {CREDIT_PACKS.map((pack) => (
              <div key={pack.id} className="rounded-xl border border-[#E7DED2] bg-[#FFFFFF] p-6 text-center">
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
                    className="mt-4 w-full py-2 rounded-lg bg-[#7C2DE8] text-white text-sm font-semibold hover:bg-[#6921C7]"
                  >
                    {loading === pack.id ? tCommon("loading") : t("buy")}
                  </button>
                ) : (
                  <Link
                    href="/"
                    className="block text-center mt-4 w-full py-2 rounded-lg bg-[#7C2DE8] text-white text-sm font-semibold hover:bg-[#6921C7]"
                  >
                    {t("signupToBuy")}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-12 text-center text-xs text-[#9B948B]">
          {t("currencyNote")}
        </p>
      </div>
    </div>
  );
}
