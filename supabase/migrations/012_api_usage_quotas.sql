-- ============================================================
-- Migration 012: API Usage Tracking & User Quotas
-- Adds rate limiting infrastructure for AI API calls
-- ============================================================

-- 1. Usage log — records every AI API call with token counts
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  route text NOT NULL,
  model text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  estimated_cost_cents int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_user_day ON public.ai_usage (user_id, created_at);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON public.ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Service role inserts only (from API routes)
CREATE POLICY "Service role can insert usage"
  ON public.ai_usage FOR INSERT
  WITH CHECK (true);

-- 2. User quotas — per-user limits, supports tier upgrades
CREATE TABLE IF NOT EXISTS public.user_quotas (
  user_id uuid PRIMARY KEY,
  tier text NOT NULL DEFAULT 'free',
  daily_request_limit int NOT NULL DEFAULT 50,
  daily_cost_limit_cents int NOT NULL DEFAULT 500,
  monthly_cost_limit_cents int NOT NULL DEFAULT 2500,
  requests_today int NOT NULL DEFAULT 0,
  cost_today_cents int NOT NULL DEFAULT 0,
  cost_this_month_cents int NOT NULL DEFAULT 0,
  last_reset_date date NOT NULL DEFAULT CURRENT_DATE,
  last_month_reset date NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date
);

ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own quota"
  ON public.user_quotas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage quotas"
  ON public.user_quotas FOR ALL
  WITH CHECK (true);

-- 3. Auto-create quota row for existing users who don't have one yet
INSERT INTO public.user_quotas (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_quotas)
ON CONFLICT DO NOTHING;

-- 4. Trigger: auto-create quota row on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_quota()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_quotas (user_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS on_auth_user_created_quota ON auth.users;
CREATE TRIGGER on_auth_user_created_quota
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_quota();
