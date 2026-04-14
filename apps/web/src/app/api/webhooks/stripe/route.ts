import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/db/admin";
import { TIERS, tierFromPriceId } from "@/lib/stripe/config";

// Stripe needs the raw body for signature verification — Next 16 route handlers
// give us request.text() which preserves the original bytes.

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const kind = session.metadata?.kind;

        if (kind === "credits") {
          // One-time credits purchase
          const userId = session.metadata!.user_id;
          const creditsCents = parseInt(session.metadata!.credits_cents, 10);

          const { data: quota } = await admin
            .from("user_quotas")
            .select("credits_balance_cents")
            .eq("user_id", userId)
            .single();

          const newBalance = (quota?.credits_balance_cents || 0) + creditsCents;
          await admin
            .from("user_quotas")
            .update({ credits_balance_cents: newBalance })
            .eq("user_id", userId);

          await admin.from("credit_transactions").insert({
            user_id: userId,
            amount_cents: creditsCents,
            balance_after_cents: newBalance,
            kind: "purchase",
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id || null,
          });
        }
        // For subscriptions, `customer.subscription.created` will fire separately and handle state
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const firstItem = sub.items.data[0];
        const priceId = firstItem?.price.id;
        const tier = tierFromPriceId(priceId || "") || "free";
        const allowance = TIERS[tier].monthlyAllowanceCents;

        // Find the user via customer id
        const { data: quota } = await admin
          .from("user_quotas")
          .select("user_id, cost_this_month_cents")
          .eq("stripe_customer_id", sub.customer as string)
          .single();

        if (!quota) {
          console.error("[stripe webhook] No quota row for customer", sub.customer);
          break;
        }

        const wasActive = sub.status === "active" || sub.status === "trialing";

        // Stripe SDK 2026-03-25.dahlia: current_period_end lives on subscription items,
        // not the top-level Subscription anymore. Fall back to top-level for older shapes.
        const periodEnd =
          (firstItem as unknown as { current_period_end?: number })?.current_period_end ??
          (sub as unknown as { current_period_end?: number }).current_period_end;

        await admin
          .from("user_quotas")
          .update({
            stripe_subscription_id: sub.id,
            subscription_status: wasActive ? "active" : sub.status,
            subscription_current_period_end: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : null,
            monthly_allowance_cents: wasActive ? allowance : TIERS.free.monthlyAllowanceCents,
            tier,
          })
          .eq("user_id", quota.user_id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from("user_quotas")
          .update({
            subscription_status: "canceled",
            stripe_subscription_id: null,
            monthly_allowance_cents: TIERS.free.monthlyAllowanceCents,
            tier: "free",
          })
          .eq("stripe_customer_id", sub.customer as string);
        break;
      }

      case "invoice.payment_succeeded": {
        // New billing cycle — reset monthly spend to 0
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason === "subscription_cycle") {
          await admin
            .from("user_quotas")
            .update({
              cost_this_month_cents: 0,
              last_month_reset: new Date().toISOString().slice(0, 10),
            })
            .eq("stripe_customer_id", invoice.customer as string);
        }
        break;
      }

      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe webhook] Handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
