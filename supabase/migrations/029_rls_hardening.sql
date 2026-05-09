-- Migration 029: RLS hardening + SECURITY DEFINER search_path lock + hot indexes
--
-- Bundles the highest-impact security fixes from the full-project audit:
--
--   P1. ai_usage / user_quotas had `WITH CHECK (true)` policies meant for
--       service-role inserts but reachable by every authenticated PostgREST
--       client → arbitrary quota/credit forgery. Tighten to service_role.
--
--   P2. Every FOR ALL policy with `USING (auth.uid() = user_id)` but no
--       WITH CHECK lets a user UPDATE their own row to set
--       `user_id = '<victim>'`, transferring the row out of their own RLS
--       view into the victim's. Add WITH CHECK with the same predicate to
--       every user-scoped table.
--
--   P7. SECURITY DEFINER functions without `SET search_path` are vulnerable
--       to search-path injection by any role with CREATE on an earlier
--       schema. ALTER FUNCTION ... SET search_path = public, pg_temp
--       on the two definers in this codebase.
--
--   P8. Hot dashboard / cron / history queries do seq scans because of
--       missing indexes on workflows.user_id, workflow_runs.(user_id,
--       started_at), workflow_runs.(workflow_id, started_at), and a
--       partial index for the every-5-min scheduled-workflows cron.
--
-- This migration is idempotent: every DROP/CREATE uses IF EXISTS / IF NOT
-- EXISTS guards so re-runs are no-ops.

-- ============================================================
-- P1. Lock down ai_usage / user_quotas to service_role only.
-- ============================================================

-- ai_usage INSERT was open to anyone. The application path goes through the
-- service-role admin client; restrict the policy to that role so direct
-- PostgREST inserts from authenticated clients are denied.
DROP POLICY IF EXISTS "Service role can insert usage" ON public.ai_usage;
CREATE POLICY "Service role can insert usage"
  ON public.ai_usage FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- user_quotas FOR ALL with WITH CHECK (true) was the worst finding: any
-- authenticated user could update their own tier, monthly_allowance_cents,
-- credits_balance_cents, or wipe a victim's balance. The 016 policy on
-- credit_transactions uses the right shape (USING service_role); mirror it.
DROP POLICY IF EXISTS "Service role can manage quotas" ON public.user_quotas;
CREATE POLICY "Service role can manage quotas"
  ON public.user_quotas FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- ============================================================
-- P2. Add WITH CHECK to every FOR ALL user-scoped policy.
-- DROP + CREATE because PG's ALTER POLICY can't add WITH CHECK in one op
-- across all supported versions; re-creating is unambiguous.
-- ============================================================

-- goals (migration 002)
DROP POLICY IF EXISTS "Users can CRUD own goals" ON public.goals;
CREATE POLICY "Users can CRUD own goals" ON public.goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- weekly_plans (migration 002)
DROP POLICY IF EXISTS "Users can CRUD own weekly plans" ON public.weekly_plans;
CREATE POLICY "Users can CRUD own weekly plans" ON public.weekly_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- streaks (migration 002)
DROP POLICY IF EXISTS "Users can CRUD own streaks" ON public.streaks;
CREATE POLICY "Users can CRUD own streaks" ON public.streaks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- push_subscriptions (migration 002)
DROP POLICY IF EXISTS "Users can CRUD own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can CRUD own push subscriptions" ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- goal_notes (migration 004)
DROP POLICY IF EXISTS "Users can CRUD own notes" ON public.goal_notes;
CREATE POLICY "Users can CRUD own notes" ON public.goal_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- goal_deliverables (migration 004)
DROP POLICY IF EXISTS "Users can CRUD own deliverables" ON public.goal_deliverables;
CREATE POLICY "Users can CRUD own deliverables" ON public.goal_deliverables FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- chat_sessions (migration 005). Also extends WITH CHECK to require that any
-- non-null goal_id points at a goal the user owns — this closes the
-- "attach my session to a victim's goal" attack.
DROP POLICY IF EXISTS "Users own their sessions" ON public.chat_sessions;
CREATE POLICY "Users own their sessions" ON public.chat_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      goal_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.goals
        WHERE id = chat_sessions.goal_id AND user_id = auth.uid()
      )
    )
  );

-- todos (migration 007)
DROP POLICY IF EXISTS "Users own their todos" ON public.todos;
CREATE POLICY "Users own their todos" ON public.todos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- todo_tags (migration 007)
DROP POLICY IF EXISTS "Users own their tags" ON public.todo_tags;
CREATE POLICY "Users own their tags" ON public.todo_tags FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- workflows (migration 008)
DROP POLICY IF EXISTS "Users own their workflows" ON public.workflows;
CREATE POLICY "Users own their workflows" ON public.workflows FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- workflow_runs (migration 008)
DROP POLICY IF EXISTS "Users own their runs" ON public.workflow_runs;
CREATE POLICY "Users own their runs" ON public.workflow_runs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_memory (migration 024)
DROP POLICY IF EXISTS "Users own their memory" ON public.user_memory;
CREATE POLICY "Users own their memory" ON public.user_memory FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Subquery-based FOR ALL policies — same predicate replicated as WITH CHECK
-- so INSERT/UPDATE can't attach a row to a parent (goal/plan/phase/session)
-- the user doesn't own.

-- phases (migration 002)
DROP POLICY IF EXISTS "Users can CRUD own phases" ON public.phases;
CREATE POLICY "Users can CRUD own phases" ON public.phases FOR ALL
  USING (goal_id IN (SELECT id FROM public.goals WHERE user_id = auth.uid()))
  WITH CHECK (goal_id IN (SELECT id FROM public.goals WHERE user_id = auth.uid()));

-- daily_tasks (migration 002)
DROP POLICY IF EXISTS "Users can CRUD own daily tasks" ON public.daily_tasks;
CREATE POLICY "Users can CRUD own daily tasks" ON public.daily_tasks FOR ALL
  USING (weekly_plan_id IN (SELECT id FROM public.weekly_plans WHERE user_id = auth.uid()))
  WITH CHECK (weekly_plan_id IN (SELECT id FROM public.weekly_plans WHERE user_id = auth.uid()));

-- chat_messages (migration 005)
DROP POLICY IF EXISTS "Users own their messages" ON public.chat_messages;
CREATE POLICY "Users own their messages" ON public.chat_messages FOR ALL
  USING (session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = auth.uid()))
  WITH CHECK (session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = auth.uid()));

-- phase_tasks (migration 022)
DROP POLICY IF EXISTS "Users can CRUD own phase tasks" ON public.phase_tasks;
CREATE POLICY "Users can CRUD own phase tasks" ON public.phase_tasks FOR ALL
  USING (
    phase_id IN (
      SELECT phases.id FROM public.phases
      JOIN public.goals ON goals.id = phases.goal_id
      WHERE goals.user_id = auth.uid()
    )
  )
  WITH CHECK (
    phase_id IN (
      SELECT phases.id FROM public.phases
      JOIN public.goals ON goals.id = phases.goal_id
      WHERE goals.user_id = auth.uid()
    )
  );

-- ============================================================
-- P7. Lock search_path on every SECURITY DEFINER function.
-- ALTER FUNCTION ... SET is idempotent.
-- ============================================================

ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user_quota() SET search_path = public, pg_temp;

-- ============================================================
-- P8. Indexes for hot paths.
-- ============================================================

-- Dashboard: getDashboardData filters workflow_runs by (user_id, started_at).
-- Workflow history list also filters by user_id and orders by started_at.
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_started
  ON public.workflow_runs (user_id, started_at DESC);

-- Workflow detail: history dialog filters by workflow_id ordered by recency.
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_started
  ON public.workflow_runs (workflow_id, started_at DESC);

-- Every-5-min cron `/api/cron/run-scheduled` filters
-- `WHERE schedule_enabled = true AND schedule_next_run_at <= now()`.
-- Partial index keeps it tiny — most rows have schedule_enabled = false.
CREATE INDEX IF NOT EXISTS idx_workflows_due
  ON public.workflows (schedule_next_run_at)
  WHERE schedule_enabled = true;

-- workflows.user_id is filtered by every list page; without an index, RLS
-- forces a seq scan on growing tables.
CREATE INDEX IF NOT EXISTS idx_workflows_user_id
  ON public.workflows (user_id);
