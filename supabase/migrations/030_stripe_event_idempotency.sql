-- Migration 030: Stripe webhook idempotency
--
-- Stripe will deliver the same webhook event multiple times for legitimate
-- reasons: network retries, automatic re-deliveries after a 5xx, manual
-- replays from the Stripe Dashboard, and brief parallel re-attempts on
-- timeout. Without a dedup gate, `checkout.session.completed` for one-time
-- credit purchases ran `balance += creditsCents` (read-then-write) on every
-- retry — the user got free credits each time, and concurrent deliveries
-- raced on the same row losing/double-applying updates.
--
-- This table is the canonical "already processed?" log. The webhook
-- handler INSERTs into it BEFORE any side effects; a unique-violation on
-- `event_id` means another delivery has already claimed the event, so the
-- handler short-circuits to a 200. On handler exception, the row is
-- deleted so Stripe's next retry can attempt again.

CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

-- No PostgREST surface. The webhook handler uses the service-role admin
-- client, which bypasses RLS. Enabling RLS without policies means any
-- non-service caller is denied; defense-in-depth in case the table ever
-- gets exposed by accident.
ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;

-- Operational note: the table grows ~1 row per Stripe event. Stripe pacing
-- keeps growth slow; even at 100 events/day the table is < 40k rows after
-- a year, and lookups are PK hits. If pruning becomes desirable later,
-- a periodic `DELETE WHERE processed_at < now() - interval '60 days'` is
-- safe — past-window events would already be outside Stripe's retry
-- window.
