import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { estimateCostCents } from "./pricing";

// --- Redis rate limiters (Upstash) ---

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function createLimiter(max: number, window: string) {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
    prefix: "rl",
  });
}

// Per-route per-minute limits
const ROUTE_LIMITS: Record<string, number> = {
  plan: 20,
  coach: 10,
  "agent-chat": 15,
  summarize: 30,
};

// --- Main guard ---

export async function withRateLimit(
  userId: string,
  route: string
): Promise<{ allowed: true } | { allowed: false; response: NextResponse }> {
  // 1. Upstash per-minute rate limit (skip if Upstash not configured)
  const perMinute = ROUTE_LIMITS[route] ?? 20;
  const limiter = createLimiter(perMinute, "1 m");
  if (limiter) {
    const result = await limiter.limit(`${userId}:${route}`);
    if (!result.success) {
      return {
        allowed: false,
        response: NextResponse.json(
          { error: "Too many requests. Please slow down." },
          {
            status: 429,
            headers: { "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)) },
          }
        ),
      };
    }
  }

  // 2. Database daily quota check
  const supabase = createAdminClient();
  const { data: quota } = await supabase
    .from("user_quotas")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!quota) {
    // Auto-create quota row for user
    await supabase.from("user_quotas").insert({ user_id: userId });
    return { allowed: true };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Reset daily counters if new day
  if (quota.last_reset_date !== today) {
    await supabase
      .from("user_quotas")
      .update({ requests_today: 0, cost_today_cents: 0, last_reset_date: today })
      .eq("user_id", userId);
    quota.requests_today = 0;
    quota.cost_today_cents = 0;
  }

  // Reset monthly counters if new month
  const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
  if (quota.last_month_reset !== thisMonth) {
    await supabase
      .from("user_quotas")
      .update({ cost_this_month_cents: 0, last_month_reset: thisMonth })
      .eq("user_id", userId);
    quota.cost_this_month_cents = 0;
  }

  // Allowance + credits check — spend monthly allowance first, then credits
  const monthlySpent = quota.cost_this_month_cents ?? 0;
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

  // Daily request limit removed — monthly allowance + credits is
  // sufficient. Users can spend their budget however they want.

  return { allowed: true };
}

// --- Usage logging (call after AI response) ---

export async function logUsage(
  userId: string,
  route: string,
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  const costCents = estimateCostCents(model, inputTokens, outputTokens);
  const supabase = createAdminClient();

  // Insert usage record
  await supabase.from("ai_usage").insert({
    user_id: userId,
    route,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_cents: costCents,
  });

  // Re-fetch full quota state for accurate deduction
  const { data: quota } = await supabase
    .from("user_quotas")
    .select("cost_today_cents, cost_this_month_cents, monthly_allowance_cents, credits_balance_cents")
    .eq("user_id", userId)
    .single();

  if (!quota) return;

  const spent = quota.cost_this_month_cents ?? 0;
  const allowance = quota.monthly_allowance_cents ?? 500;
  const credits = quota.credits_balance_cents ?? 0;

  const allowanceRemaining = Math.max(0, allowance - spent);
  const fromAllowance = Math.min(costCents, allowanceRemaining);
  const fromCredits = Math.max(0, costCents - fromAllowance);

  const newCreditsBalance = Math.max(0, credits - fromCredits);

  // Update counters: cost_today_cents tracks gross spend, cost_this_month_cents
  // tracks spend against allowance (capped at allowance so it cleanly represents
  // "how much of the monthly bucket is used"), credits get debited.
  await supabase
    .from("user_quotas")
    .update({
      cost_today_cents: (quota.cost_today_cents ?? 0) + costCents,
      cost_this_month_cents: spent + fromAllowance, // only counts against allowance, not credits
      credits_balance_cents: newCreditsBalance,
    })
    .eq("user_id", userId);

  // Audit trail: log credit spend as a transaction
  if (fromCredits > 0) {
    await supabase.from("credit_transactions").insert({
      user_id: userId,
      amount_cents: -fromCredits,
      balance_after_cents: newCreditsBalance,
      kind: "spend",
      route,
    });
  }
}
