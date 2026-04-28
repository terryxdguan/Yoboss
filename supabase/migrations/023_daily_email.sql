-- Daily email digest: opt-in flag + per-user idempotency stamp.
-- Default ON so the feature is live for all existing users; they can opt out
-- via Settings or the one-click unsubscribe in any email.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_daily_email_sent_on date;

-- The cron handler scans only enabled users; partial index keeps the scan
-- cheap even as the user table grows and people opt out.
CREATE INDEX IF NOT EXISTS idx_users_daily_email_enabled
  ON public.users(daily_email_enabled) WHERE daily_email_enabled = true;
