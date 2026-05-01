"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Calendar, Globe, Check, BarChart3, CreditCard, Sparkles } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import {
  getBillingState,
  getCreditUsageSummary,
  getRecentAiUsage,
  getUserTimezone,
  upsertUserTimezone,
} from "@/lib/db/actions";
import { TIMEZONES } from "@/lib/timezones";
import type { UserQuota, AiUsageRecord } from "@/lib/types/database";

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  free: { bg: "bg-[#F1ECE4]", text: "text-[#6F6A64]", label: "Free" },
  basic: { bg: "bg-[#7FB38A]/10", text: "text-[#7FB38A]", label: "Basic" },
  pro: { bg: "bg-[#007AFF]/10", text: "text-[#007AFF]", label: "Pro" },
  team: { bg: "bg-[#7FB38A]/10", text: "text-[#7FB38A]", label: "Team" },
};

const ROUTE_LABELS: Record<string, string> = {
  plan: "Goal Planning",
  coach: "Team",
  "agent-chat": "Employee Chat",
  summarize: "Summarize",
  "workflow-execute": "Workflow",
  // Legacy tag kept so historical usage records show a friendly label.
  // Replaced by the three "goal-session-*" tags below as of Phase 2.
  "goal-detail-chat": "Goal Chat",
  "goal-session-creation": "Goal Creation",
  "goal-session-weekly": "Weekly Planning",
  "goal-session-coach": "Team",
};

function progressColor(pct: number): string {
  if (pct >= 85) return "bg-[#D5847A]";
  if (pct >= 60) return "bg-[#D4B06A]";
  return "bg-[#7FB38A]";
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortModel(model: string): string {
  return model.replace("claude-", "");
}

export default function AccountPage() {
  const t = useTranslations("account");
  const locale = useLocale();
  const [user, setUser] = useState<{
    name: string;
    email: string;
    avatar: string | null;
    createdAt: string;
  } | null>(null);

  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [creditUsage, setCreditUsage] = useState({
    totalCreditsCents: 0,
    usedCreditsCents: 0,
    balanceCents: 0,
  });
  const [usage, setUsage] = useState<AiUsageRecord[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [timezone, setTimezone] = useState("UTC");
  const [tzSaved, setTzSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (authUser) {
          setUser({
            name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "User",
            email: authUser.email || "",
            avatar: authUser.user_metadata?.avatar_url || null,
            createdAt: authUser.created_at,
          });
        }

        const [q, credit, u, tz] = await Promise.all([
          getBillingState(),
          getCreditUsageSummary(),
          getRecentAiUsage(30, 0),
          getUserTimezone(),
        ]);

        setQuota(q);
        setCreditUsage(credit);
        setUsage(u);
        setHasMore(u.length === 30);

        // Auto-detect timezone if UTC
        let finalTz = tz;
        if (tz === "UTC") {
          const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (detected && detected !== "UTC") {
            finalTz = detected;
            await upsertUserTimezone(finalTz);
          }
        }
        setTimezone(finalTz);
      } catch (err) {
        console.error("Failed to load account data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const more = await getRecentAiUsage(30, usage.length);
      setUsage((prev) => [...prev, ...more]);
      setHasMore(more.length === 30);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [usage.length]);

  async function handleManageSubscription() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Failed to open portal");
      }
    } catch (err) {
      console.error("Portal error:", err);
      alert("Failed to open portal");
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleTimezoneChange(newTz: string) {
    setTimezone(newTz);
    try {
      await upsertUserTimezone(newTz);
      setTzSaved(true);
      setTimeout(() => setTzSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save timezone:", err);
    }
  }

  const tier = quota?.tier ?? "free";
  const tierStyle = TIER_STYLES[tier] || TIER_STYLES.free;

  // Billing-specific derived state
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyAllowance = quota?.monthly_allowance_cents ?? 500;
  const allowanceUsed =
    quota?.last_month_reset?.startsWith(currentMonth)
      ? Math.min(quota.cost_this_month_cents ?? 0, monthlyAllowance)
      : 0;
  const allowancePct =
    monthlyAllowance > 0
      ? Math.min(100, Math.round((allowanceUsed / monthlyAllowance) * 100))
      : 0;
  const creditsBalance = creditUsage.balanceCents;
  const creditsTotal = Math.max(creditUsage.totalCreditsCents, creditsBalance);
  const creditsUsed = Math.min(creditUsage.usedCreditsCents, creditsTotal);
  const creditsPct =
    creditsTotal > 0
      ? Math.min(100, Math.round((creditsUsed / creditsTotal) * 100))
      : 0;
  const hasStripeCustomer = !!quota?.stripe_customer_id;
  const subscriptionPeriodEnd = quota?.subscription_current_period_end ?? null;
  const cancelAtPeriodEnd = !!quota?.cancel_at_period_end;

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-[#2B2B2B]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#6F6A64]">{t("subtitle")}</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 border-2 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-[#2B2B2B]">{t("title")}</h1>
        <p className="mt-1 text-sm text-[#6F6A64]">{t("subtitle")}</p>
      </div>

      {/* Section 1: Profile Card */}
      <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <AccountAvatar src={user?.avatar} name={user?.name} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-semibold text-[#2B2B2B] truncate">{user?.name}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${tierStyle.bg} ${tierStyle.text}`}>
                {tierStyle.label}
              </span>
            </div>
            <p className="text-sm text-[#6F6A64] mt-0.5 truncate">{user?.email}</p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-xs text-[#9B948B]">
              {/* Member since */}
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {t("memberSince", {
                    date: user?.createdAt
                      ? new Date(user.createdAt).toLocaleDateString(locale, { month: "short", year: "numeric" })
                      : "—",
                  })}
                </span>
              </div>

              {/* Timezone */}
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                <select
                  value={timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs text-[#9B948B] hover:text-[#2B2B2B] cursor-pointer transition-colors"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                {tzSaved && (
                  <span className="flex items-center gap-0.5 text-[#7FB38A] font-medium">
                    <Check className="h-3 w-3" />
                    {t("saved")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section: Subscription & Billing */}
      <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007AFF]/10">
            <CreditCard className="h-4 w-4 text-[#007AFF]" />
          </div>
          <h2 className="text-sm font-semibold text-[#2B2B2B]">{t("billingTitle")}</h2>
        </div>

        {/* Checkout result banner.
            Subscription path: only confirm "plan is active" once the Stripe
            webhook has actually flipped the tier in our DB. Showing the
            success banner purely based on the URL would lie whenever event
            delivery fails (wrong endpoint, signature mismatch, etc.) — the
            user pays, sees "active", but stays on Free tier.
            Credits path: keep showing immediately — credits delivery is
            simpler and the balance below reflects the truth either way. */}
        {(() => {
          if (typeof window === "undefined") return null;
          const params = new URLSearchParams(window.location.search);
          const result = params.get("checkout");
          if (result === "success") {
            const kind = params.get("kind");
            const isSubscription = kind === "subscription";
            if (isSubscription && tier === "free") return null;
            return (
              <div className="mb-4 rounded-lg border border-[#7FB38A]/30 bg-[#7FB38A]/10 px-4 py-2.5 flex items-center gap-2">
                <Check className="h-4 w-4 text-[#7FB38A]" />
                <span className="text-sm text-[#2B2B2B]">{t("checkoutSuccess")}</span>
              </div>
            );
          }
          if (result === "cancelled") {
            return (
              <div className="mb-4 rounded-lg border border-[#D4B06A]/30 bg-[#D4B06A]/10 px-4 py-2.5 flex items-center gap-2">
                <span className="text-sm text-[#2B2B2B]">{t("checkoutCancelled")}</span>
              </div>
            );
          }
          return null;
        })()}

        {/* Current plan + actions */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6F6A64]">{t("currentPlan")}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${tierStyle.bg} ${tierStyle.text}`}>
                {tierStyle.label}
              </span>
              {cancelAtPeriodEnd && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#D4B06A]/10 text-[#C99442]">
                  {t("canceling")}
                </span>
              )}
            </div>
            {subscriptionPeriodEnd && (
              <p className="text-xs text-[#9B948B] mt-1">
                {cancelAtPeriodEnd ? `${t("cancels")} ` : `${t("renews")} `}
                {new Date(subscriptionPeriodEnd).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Free users see an Upgrade CTA that goes through checkout.
                Paid users see a subtle "View plans" link (for browsing the
                tier comparison) plus Manage → portal, which is the single
                source of truth for plan changes, cancellation, and payment
                methods. The pricing page itself now has guards so any
                tier-change click routes to the portal instead of creating a
                duplicate subscription. */}
            {tier === "free" ? (
              <a
                href="/pricing"
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#007AFF] text-white hover:bg-[#0066D6] transition-colors"
              >
                {t("upgradePlan")}
              </a>
            ) : (
              <a
                href="/pricing"
                className="px-3 py-1.5 text-xs font-medium text-[#007AFF] hover:text-[#0066D6] hover:underline transition-colors"
              >
                {t("viewPlans")}
              </a>
            )}
            {hasStripeCustomer && (
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[#E7DED2] text-[#2B2B2B] hover:bg-[#F1ECE4] transition-colors disabled:opacity-50"
              >
                {portalLoading ? t("loading") : t("manage")}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-[#6F6A64]">{t("monthlyAllowance")}</span>
              <span className="font-semibold text-[#2B2B2B]">
                {t("usedOf", { used: formatCost(allowanceUsed), total: formatCost(monthlyAllowance) })}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1ECE4]">
              <div
                className={`h-full rounded-full transition-all ${progressColor(allowancePct)}`}
                style={{ width: `${allowancePct}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg border border-[#E7DED2] bg-[#FAF9F6] px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#D4B06A]/10">
                  <Sparkles className="h-5 w-5 text-[#D4B06A]" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[#6F6A64]">{t("credits")}</p>
                  <p className="text-2xl font-bold text-[#2B2B2B]">
                    {t("usedOf", { used: formatCost(creditsUsed), total: formatCost(creditsTotal) })}
                  </p>
                  <p className="mt-0.5 text-xs text-[#9B948B]">
                    {t("remaining", { amount: formatCost(creditsBalance) })}
                  </p>
                </div>
              </div>
              <a
                href="/pricing"
                className="inline-flex justify-center rounded-lg border border-[#007AFF] px-3.5 py-1.5 text-xs font-semibold text-[#007AFF] transition-colors hover:bg-[#E6F2FF]"
              >
                {t("buyCredits")}
              </a>
            </div>

            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#F1ECE4]">
              <div
                className={`h-full rounded-full transition-all ${progressColor(creditsPct)}`}
                style={{ width: `${creditsPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Usage History */}
      <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#007AFF]/10">
            <BarChart3 className="h-4 w-4 text-[#007AFF]" />
          </div>
          <h2 className="text-sm font-semibold text-[#2B2B2B]">{t("usageHistoryTitle")}</h2>
        </div>

        {usage.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-[#6F6A64]">{t("noUsage")}</p>
            <p className="text-xs text-[#9B948B] mt-1">{t("noUsageHint")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#E7DED2]">
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold">{t("colDate")}</th>
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold">{t("colRoute")}</th>
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold">{t("colModel")}</th>
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold text-right">{t("colTokens")}</th>
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold text-right">{t("colCost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((r) => (
                    <tr key={r.id} className="border-b border-[#F1ECE4] last:border-0 hover:bg-[#F6F3EE]/50 transition-colors">
                      <td className="py-2.5 text-xs text-[#6F6A64]">{formatDate(r.created_at)}</td>
                      <td className="py-2.5 text-xs text-[#2B2B2B] font-medium">{ROUTE_LABELS[r.route] || r.route}</td>
                      <td className="py-2.5 text-xs text-[#9B948B]">{shortModel(r.model)}</td>
                      <td className="py-2.5 text-xs text-[#6F6A64] text-right font-mono">
                        {r.input_tokens.toLocaleString()} / {r.output_tokens.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-xs text-[#2B2B2B] font-medium text-right">{formatCost(r.estimated_cost_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="mt-4 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 text-xs font-medium text-[#007AFF] hover:bg-[#007AFF]/5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loadingMore ? t("loading") : t("loadMore")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AccountAvatar({ src, name }: { src?: string | null; name?: string }) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name || "User"}
        className="h-16 w-16 rounded-full object-cover border border-[#E7DED2] shrink-0"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="h-16 w-16 rounded-full bg-[#007AFF] flex items-center justify-center text-white text-xl font-semibold shrink-0">
      {(name || "U").charAt(0).toUpperCase()}
    </div>
  );
}
