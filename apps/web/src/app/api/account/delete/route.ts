import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { stripe } from "@/lib/stripe/client";

// Hard-delete the user's account and all associated data.
//
// Order matters: cancel the Stripe subscription first (so we don't keep
// billing a deleted user), then call auth.admin.deleteUser. The DB schema
// has ON DELETE CASCADE from auth.users → public.users → every user-owned
// table, so a single auth delete cleans up the entire footprint.
//
// Stripe customer object itself is left in place (not deleted) so historical
// invoices/receipts remain valid for accounting on the Stripe side.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Double-confirmation: client must send { confirm: "DELETE" } so a stray
  // POST can't nuke an account.
  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body
  }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "Confirmation required" },
      { status: 400 }
    );
  }

  // Cancel any active Stripe subscription. We use cancel-immediately rather
  // than cancel-at-period-end so the deletion is final from the user's
  // perspective; they're not paying for a service they no longer have.
  const { data: quota } = await supabase
    .from("user_quotas")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .single();

  if (quota?.stripe_subscription_id) {
    try {
      await stripe.subscriptions.cancel(quota.stripe_subscription_id);
    } catch (err) {
      // Already-canceled subs throw — that's fine, keep going. Other errors
      // are logged but don't block the delete; leaving the user record
      // around just because Stripe is flaky is worse than an orphan sub.
      console.error("[account/delete] Stripe cancel failed:", err);
    }
  }

  // Sign out the current session before deleting the user, so the cookie
  // doesn't keep referencing a now-nonexistent uid.
  await supabase.auth.signOut();

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account/delete] auth.admin.deleteUser failed:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
