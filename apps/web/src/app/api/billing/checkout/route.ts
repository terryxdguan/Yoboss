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

    // Guard: a customer must have AT MOST ONE active subscription at any time.
    // Without this check, a Pro user could POST this endpoint again and Stripe
    // would happily create a second parallel subscription — billing twice for
    // the same plan. To change plans, users must go through the Customer Portal,
    // which swaps the price on the existing subscription instead of creating a
    // new one. We check Stripe directly (not the DB) because Stripe is the
    // source of truth — if the DB is out of sync for any reason, this still
    // prevents duplicate billing.
    const existing = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    const liveStatuses = new Set([
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "incomplete",
    ]);
    const hasLiveSub = existing.data.some(
      (sub) => liveStatuses.has(sub.status) && !sub.ended_at
    );
    if (hasLiveSub) {
      return NextResponse.json(
        {
          error:
            "You already have an active subscription. To change plans, use the Manage button in your account to open the billing portal.",
          code: "already_subscribed",
        },
        { status: 409 }
      );
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
