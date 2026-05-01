-- Track consecutive quota-related failures for scheduled workflows so the
-- cron loop can auto-disable a schedule after N strikes. Without this, a
-- user who hits their monthly cap keeps getting their workflow attempted
-- every cron tick (and a notification each time) until they top up — both
-- noisy and wasteful of cron quota.
--
-- Counter is incremented in the workflows execute path on QUOTA_EXCEEDED
-- and reset to 0 on a successful run. Manual triggers (triggered_by =
-- 'manual') don't touch this counter; only scheduled runs do.
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS consecutive_quota_failures int NOT NULL DEFAULT 0;
