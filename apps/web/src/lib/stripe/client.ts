import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY not set — Stripe features will fail");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-03-25.dahlia",
  appInfo: {
    name: "YoBoss",
    version: "1.0.0",
  },
});
