import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { stripe } from "@/lib/stripe/client";

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: quota } = await supabase
    .from("user_quotas")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!quota?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription to manage" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer: quota.stripe_customer_id,
    return_url: `${appUrl}/account`,
  });

  return NextResponse.json({ url: session.url });
}
