"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Globe, Check, Zap, BarChart3, CreditCard, Sparkles } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import {
  getBillingState,
  getMonthlyUsageSummary,
  getRecentAiUsage,
  getUserTimezone,
  upsertUserTimezone,
} from "@/lib/db/actions";
import type { UserQuota, AiUsageRecord } from "@/lib/types/database";

const TIMEZONES = [
  { value: "Pacific/Honolulu", label: "Hawaii (UTC-10)" },
  { value: "America/Anchorage", label: "Alaska (UTC-9)" },
  { value: "America/Los_Angeles", label: "Pacific Time (UTC-8)" },
  { value: "America/Denver", label: "Mountain Time (UTC-7)" },
  { value: "America/Chicago", label: "Central Time (UTC-6)" },
  { value: "America/New_York", label: "Eastern Time (UTC-5)" },
  { value: "America/Sao_Paulo", label: "Brasilia (UTC-3)" },
  { value: "Europe/London", label: "London (UTC+0)" },
  { value: "Europe/Paris", label: "Central Europe (UTC+1)" },
  { value: "Europe/Helsinki", label: "Eastern Europe (UTC+2)" },
  { value: "Asia/Dubai", label: "Dubai (UTC+4)" },
  { value: "Asia/Kolkata", label: "India (UTC+5:30)" },
  { value: "Asia/Bangkok", label: "Bangkok (UTC+7)" },
  { value: "Asia/Shanghai", label: "China (UTC+8)" },
  { value: "Asia/Tokyo", label: "Japan (UTC+9)" },
  { value: "Australia/Sydney", label: "Sydney (UTC+11)" },
  { value: "Pacific/Auckland", label: "New Zealand (UTC+12)" },
];

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  free: { bg: "bg-[#F1ECE4]", text: "text-[#6F6A64]", label: "Free" },
  basic: { bg: "bg-[#7FB38A]/10", text: "text-[#7FB38A]", label: "Basic" },
  pro: { bg: "bg-[#7FAEE6]/10", text: "text-[#7FAEE6]", label: "Pro" },
  team: { bg: "bg-[#7FB38A]/10", text: "text-[#7FB38A]", label: "Team" },
};

const ROUTE_LABELS: Record<string, string> = {
  plan: "Goal Planning",
  coach: "AI Coach",
  "agent-chat": "Agent Chat",
  summarize: "Summarize",
  "workflow-execute": "Workflow",
  "goal-detail-chat": "Goal Chat",
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
  const [user, setUser] = useState<{
    name: string;
    email: string;
    avatar: string | null;
    createdAt: string;
  } | null>(null);

  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [monthly, setMonthly] = useState({ totalRequests: 0, totalCostCents: 0 });
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

        const [q, m, u, tz] = await Promise.all([
          getBillingState(),
          getMonthlyUsageSummary(),
          getRecentAiUsage(30, 0),
          getUserTimezone(),
        ]);

        setQuota(q);
        setMonthly(m);
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

  // Handle quota staleness — if last_reset_date is not today, show zero
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
  const requestsToday = quota && quota.last_reset_date === today ? quota.requests_today : 0;
  const costToday = quota && quota.last_reset_date === today ? quota.cost_today_cents : 0;
  const costMonth = quota && quota.last_month_reset === thisMonth ? quota.cost_this_month_cents : 0;

  const dailyLimit = quota?.daily_request_limit ?? 50;
  const dailyCostLimit = quota?.daily_cost_limit_cents ?? 500;
  const monthlyCostLimit = quota?.monthly_cost_limit_cents ?? 2500;
  const tier = quota?.tier ?? "free";
  const tierStyle = TIER_STYLES[tier] || TIER_STYLES.free;

  const requestPct = Math.min(100, Math.round((requestsToday / dailyLimit) * 100));
  const dailyCostPct = Math.min(100, Math.round((costToday / dailyCostLimit) * 100));
  const monthlyCostPct = Math.min(100, Math.round((costMonth / monthlyCostLimit) * 100));

  // Billing-specific derived state
  const monthlyAllowance = quota?.monthly_allowance_cents ?? 500;
  const allowanceUsed = quota && quota.last_month_reset === thisMonth
    ? Math.min(quota.cost_this_month_cents, monthlyAllowance)
    : 0;
  const allowancePct = Math.min(100, Math.round((allowanceUsed / monthlyAllowance) * 100));
  const creditsBalance = quota?.credits_balance_cents ?? 0;
  const hasStripeCustomer = !!quota?.stripe_customer_id;
  const subscriptionPeriodEnd = quota?.subscription_current_period_end ?? null;

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-[#2B2B2B]">Account</h1>
          <p className="mt-1 text-sm text-[#6F6A64]">Your profile and AI usage</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 border-2 border-[#7FAEE6] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-[#2B2B2B]">Account</h1>
        <p className="mt-1 text-sm text-[#6F6A64]">Your profile and AI usage</p>
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
                  Member since{" "}
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                    : "—"}
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
                    Saved
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7FAEE6]/10">
            <CreditCard className="h-4 w-4 text-[#7FAEE6]" />
          </div>
          <h2 className="text-sm font-semibold text-[#2B2B2B]">Subscription & Billing</h2>
        </div>

        {/* Checkout result banner */}
        {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("checkout") === "success" && (
          <div className="mb-4 rounded-lg border border-[#7FB38A]/30 bg-[#7FB38A]/10 px-4 py-2.5 flex items-center gap-2">
            <Check className="h-4 w-4 text-[#7FB38A]" />
            <span className="text-sm text-[#2B2B2B]">Payment successful. Your plan is active.</span>
          </div>
        )}
        {typeof window !== "undefined" && new URLSearchParams(window.location.search).get("checkout") === "cancelled" && (
          <div className="mb-4 rounded-lg border border-[#D4B06A]/30 bg-[#D4B06A]/10 px-4 py-2.5 flex items-center gap-2">
            <span className="text-sm text-[#2B2B2B]">Checkout cancelled. No charges were made.</span>
          </div>
        )}

        {/* Current plan + actions */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6F6A64]">Current Plan</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${tierStyle.bg} ${tierStyle.text}`}>
                {tierStyle.label}
              </span>
            </div>
            {subscriptionPeriodEnd && (
              <p className="text-xs text-[#9B948B] mt-1">
                Renews {new Date(subscriptionPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/pricing"
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] transition-colors"
            >
              {tier === "free" ? "Upgrade Plan" : "Change Plan"}
            </a>
            {hasStripeCustomer && (
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[#E7DED2] text-[#2B2B2B] hover:bg-[#F1ECE4] transition-colors disabled:opacity-50"
              >
                {portalLoading ? "Loading..." : "Manage"}
              </button>
            )}
          </div>
        </div>

        {/* Monthly allowance progress */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[#6F6A64] font-medium">Monthly Allowance</span>
            <span className="text-[#2B2B2B] font-semibold">
              {formatCost(allowanceUsed)} / {formatCost(monthlyAllowance)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1ECE4]">
            <div
              className={`h-full rounded-full transition-all ${progressColor(allowancePct)}`}
              style={{ width: `${allowancePct}%` }}
            />
          </div>
        </div>

        {/* Credits balance */}
        <div className="flex items-center justify-between rounded-lg border border-[#E7DED2] bg-[#FAF9F6] px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#D4B06A]" />
            <div>
              <p className="text-xs text-[#6F6A64]">Credits Balance</p>
              <p className="text-lg font-bold text-[#2B2B2B]">{formatCost(creditsBalance)}</p>
            </div>
          </div>
          <a
            href="/pricing"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-[#7FAEE6] text-[#7FAEE6] hover:bg-[#EAF3FD] transition-colors"
          >
            Buy Credits
          </a>
        </div>
      </div>

      {/* Section 2: Usage Overview */}
      <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7FAEE6]/10">
            <Zap className="h-4 w-4 text-[#7FAEE6]" />
          </div>
          <h2 className="text-sm font-semibold text-[#2B2B2B]">AI Usage</h2>
        </div>

        {/* Today */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[#6F6A64] font-medium">Today&apos;s Requests</span>
              <span className="text-[#2B2B2B] font-semibold">{requestsToday} / {dailyLimit}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1ECE4]">
              <div className={`h-full rounded-full transition-all ${progressColor(requestPct)}`} style={{ width: `${requestPct}%` }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[#6F6A64] font-medium">Today&apos;s Cost</span>
              <span className="text-[#2B2B2B] font-semibold">{formatCost(costToday)} / {formatCost(dailyCostLimit)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1ECE4]">
              <div className={`h-full rounded-full transition-all ${progressColor(dailyCostPct)}`} style={{ width: `${dailyCostPct}%` }} />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[#E7DED2] my-5" />

        {/* This Month */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6F6A64] font-medium">Monthly Requests</span>
            <span className="text-[#2B2B2B] font-semibold">{monthly.totalRequests}</span>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[#6F6A64] font-medium">Monthly Cost</span>
              <span className="text-[#2B2B2B] font-semibold">{formatCost(costMonth)} / {formatCost(monthlyCostLimit)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1ECE4]">
              <div className={`h-full rounded-full transition-all ${progressColor(monthlyCostPct)}`} style={{ width: `${monthlyCostPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Usage History */}
      <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7FAEE6]/10">
            <BarChart3 className="h-4 w-4 text-[#7FAEE6]" />
          </div>
          <h2 className="text-sm font-semibold text-[#2B2B2B]">Usage History</h2>
        </div>

        {usage.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-[#6F6A64]">No AI usage recorded yet.</p>
            <p className="text-xs text-[#9B948B] mt-1">Usage will appear here after your first AI interaction.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#E7DED2]">
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold">Date</th>
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold">Route</th>
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold">Model</th>
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold text-right">Tokens (in/out)</th>
                    <th className="pb-2.5 text-[11px] uppercase tracking-[0.08em] text-[#9B948B] font-semibold text-right">Cost</th>
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
                  className="px-4 py-2 text-xs font-medium text-[#7FAEE6] hover:bg-[#7FAEE6]/5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load more"}
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
    <div className="h-16 w-16 rounded-full bg-[#7FAEE6] flex items-center justify-center text-white text-xl font-semibold shrink-0">
      {(name || "U").charAt(0).toUpperCase()}
    </div>
  );
}
