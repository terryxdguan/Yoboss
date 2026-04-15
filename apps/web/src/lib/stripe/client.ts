import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  _stripe = new Stripe(key, {
    apiVersion: "2026-03-25.dahlia",
    appInfo: {
      name: "YoBoss",
      version: "1.0.0",
    },
  });
  return _stripe;
}

// Lazy proxy: callsites use `stripe.customers.create(...)` etc. unchanged,
// but the real Stripe instance is only constructed on first property access.
// This avoids crashing at module load during `next build` page-data
// collection when STRIPE_SECRET_KEY is absent in the build environment.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return Reflect.get(getStripe(), prop);
  },
});
