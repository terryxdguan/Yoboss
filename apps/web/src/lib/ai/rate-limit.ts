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

  // Check daily request limit
  if (quota.requests_today >= quota.daily_request_limit) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "Daily request limit reached. Resets at midnight." },
        { status: 429 }
      ),
    };
  }

  // Check daily cost limit
  if (quota.cost_today_cents >= quota.daily_cost_limit_cents) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "Daily usage limit reached. Resets at midnight." },
        { status: 429 }
      ),
    };
  }

  // Check monthly cost limit
  if (quota.cost_this_month_cents >= quota.monthly_cost_limit_cents) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "Monthly usage limit reached. Resets next month." },
        { status: 429 }
      ),
    };
  }

  // Increment request count
  await supabase
    .from("user_quotas")
    .update({ requests_today: quota.requests_today + 1 })
    .eq("user_id", userId);

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

  // Update quota cost counters
  const { data: quota } = await supabase
    .from("user_quotas")
    .select("cost_today_cents, cost_this_month_cents")
    .eq("user_id", userId)
    .single();

  if (quota) {
    await supabase
      .from("user_quotas")
      .update({
        cost_today_cents: quota.cost_today_cents + costCents,
        cost_this_month_cents: quota.cost_this_month_cents + costCents,
      })
      .eq("user_id", userId);
  }
}
