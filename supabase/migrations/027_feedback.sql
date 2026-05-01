-- ============================================================
-- Migration 027: User Feedback
-- In-app feedback collection (bug / suggestion / other) for
-- the floating "Send feedback" button.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  type text NOT NULL CHECK (type IN ('bug', 'suggestion', 'other')),
  body text NOT NULL,
  url text,
  user_agent text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_user_created ON public.feedback (user_id, created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can submit feedback for themselves (api route uses service role,
-- but RLS keeps this safe even if a client client ever inserts directly).
CREATE POLICY "Users insert own feedback"
  ON public.feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own feedback (mostly for a future "my feedback" page;
-- right now nothing reads from this table client-side).
CREATE POLICY "Users read own feedback"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id);
