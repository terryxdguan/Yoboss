-- workflow_runs.resume_lock_at — server-side coordination flag for the
-- recover-stale-runs cron sweeper. Whenever the sweeper picks up a
-- stuck run to either recover state from Anthropic events or kick off
-- the next pending step, it writes its acquisition timestamp here.
-- Concurrent sweepers (or the in-progress tab from a returning user)
-- skip a run whose lock is fresh.
--
-- TTL semantics: a lock older than 15 min is considered stale and may
-- be re-acquired. 15 min > Vercel Pro maxDuration (800s) so any
-- function holding the lock is guaranteed to be dead by then.
--
-- Implementation note: the sweeper acquires via UPDATE...WHERE so the
-- check + set is a single atomic Postgres operation. No advisory locks
-- needed.

alter table public.workflow_runs
  add column if not exists resume_lock_at timestamptz;

-- Partial index speeds up the sweeper's hot query
-- ("status = 'running' and lock free") so it doesn't scan the whole
-- workflow_runs table on every tick.
create index if not exists workflow_runs_running_idx
  on public.workflow_runs(started_at)
  where status = 'running';
