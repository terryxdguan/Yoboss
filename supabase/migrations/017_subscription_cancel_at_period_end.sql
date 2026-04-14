-- Track whether an active subscription is scheduled to cancel at period end.
-- Stripe's "Cancel subscription" in the Customer Portal defaults to
-- cancel_at_period_end=true: the subscription stays active until the current
-- period ends. We need to surface that state in the UI so users see
-- "Cancels May 14" instead of "Renews May 14".
ALTER TABLE public.user_quotas
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
