-- Add Stripe and credits fields to user_quotas
ALTER TABLE public.user_quotas
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_allowance_cents int DEFAULT 500,
  ADD COLUMN IF NOT EXISTS credits_balance_cents int DEFAULT 0;

-- subscription_status values: 'free' | 'active' | 'past_due' | 'canceled' | 'incomplete'

-- Audit trail for credit transactions
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents int NOT NULL, -- positive = add, negative = spend
  balance_after_cents int NOT NULL,
  kind text NOT NULL, -- 'purchase' | 'spend' | 'refund' | 'subscription_reset' | 'grant'
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  route text, -- if kind='spend', which feature consumed credits
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
  ON public.credit_transactions (user_id, created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own credit transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages credit transactions"
  ON public.credit_transactions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Seed: existing users get Free tier defaults
UPDATE public.user_quotas
SET subscription_status = 'free',
    monthly_allowance_cents = 500
WHERE subscription_status IS NULL;
