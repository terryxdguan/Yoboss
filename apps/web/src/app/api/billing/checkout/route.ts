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
