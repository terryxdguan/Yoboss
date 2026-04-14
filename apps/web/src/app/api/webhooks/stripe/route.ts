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
          .select("user_id, cost_this_month_cents, stripe_subscription_id")
          .eq("stripe_customer_id", sub.customer as string)
          .single();

        if (!quota) {
          console.error("[stripe webhook] No quota row for customer", sub.customer);
          break;
        }

        // If we're already tracking a *different* subscription for this
        // customer (duplicate subs, stale webhook replays, manual Stripe
        // Dashboard edits, etc.), ignore updates from the non-tracked one.
        // Otherwise we'd let a stale subscription silently overwrite the
        // user's real billing state. `created` events always take precedence
        // so a fresh checkout can replace a previously-canceled sub.
        if (
          event.type === "customer.subscription.updated" &&
          quota.stripe_subscription_id &&
          quota.stripe_subscription_id !== sub.id
        ) {
          console.warn(
            `[stripe webhook] Ignoring update for untracked sub ${sub.id}; tracked=${quota.stripe_subscription_id}`
          );
          break;
        }

        const wasActive = sub.status === "active" || sub.status === "trialing";

        // Stripe SDK 2026-03-25.dahlia: current_period_end lives on subscription items,
        // not the top-level Subscription anymore. Fall back to top-level for older shapes.
        const periodEnd =
          (firstItem as unknown as { current_period_end?: number })?.current_period_end ??
          (sub as unknown as { current_period_end?: number }).current_period_end;

        // Detect "scheduled to cancel at period end" in a version-proof way.
        // API 2026-03-25.dahlia no longer populates `cancel_at_period_end`
        // (it's always false). Instead, `cancel_at` is set to the future
        // Unix timestamp when cancellation will take effect. Older API
        // versions populated `cancel_at_period_end` directly. Support both.
        const rawSub = sub as unknown as {
          cancel_at_period_end?: boolean;
          cancel_at?: number | null;
          ended_at?: number | null;
        };
        const cancelAtPeriodEnd = Boolean(
          rawSub.cancel_at_period_end || (rawSub.cancel_at && !rawSub.ended_at)
        );

        // When a cancellation is scheduled, `cancel_at` is the canonical end
        // date (may differ from the billing period end for custom schedules).
        // Fall back to billing period end for the normal renewal case.
        const effectiveEndUnix = rawSub.cancel_at ?? periodEnd;

        await admin
          .from("user_quotas")
          .update({
            stripe_subscription_id: sub.id,
            subscription_status: wasActive ? "active" : sub.status,
            subscription_current_period_end: effectiveEndUnix
              ? new Date(effectiveEndUnix * 1000).toISOString()
              : null,
            monthly_allowance_cents: wasActive ? allowance : TIERS.free.monthlyAllowanceCents,
            tier,
            cancel_at_period_end: cancelAtPeriodEnd,
          })
          .eq("user_id", quota.user_id);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        // Only downgrade if the deleted subscription is the one we're
        // tracking. Otherwise a duplicate / stale sub being cleaned up
        // would incorrectly reset the user to free even though their
        // real subscription is still active.
        const { data: quota } = await admin
          .from("user_quotas")
          .select("stripe_subscription_id")
          .eq("stripe_customer_id", sub.customer as string)
          .single();

        if (!quota) {
          console.error("[stripe webhook] No quota row for customer", sub.customer);
          break;
        }

        if (quota.stripe_subscription_id && quota.stripe_subscription_id !== sub.id) {
          console.warn(
            `[stripe webhook] Ignoring delete for untracked sub ${sub.id}; tracked=${quota.stripe_subscription_id}`
          );
          break;
        }

        await admin
          .from("user_quotas")
          .update({
            subscription_status: "canceled",
            stripe_subscription_id: null,
            subscription_current_period_end: null,
            monthly_allowance_cents: TIERS.free.monthlyAllowanceCents,
            tier: "free",
            cancel_at_period_end: false,
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
