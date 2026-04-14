-- Migration 018: cascade goal deletion into its todos
--
-- Original FK (migration 015) used ON DELETE SET NULL, which produced two
-- nasty symptoms:
--   1. Deleting a goal left its todos sitting in the user's list as orphans
--      (user saw "deleted the goal but todos are still here")
--   2. Those orphans rendered with their raw `tag` column ("Goal") as the
--      source label instead of the actual goal title, so the dashboard had
--      inconsistent source labels — some todos showed the full title,
--      others just showed the word "Goal".
--
-- Fix: swap the FK to ON DELETE CASCADE so future goal deletions take
-- their todos with them. Historical orphans left over from the old
-- SET NULL behavior must be cleaned up by the app owner on a case-by-case
-- basis — some may be true orphans (delete), others may be valid todos
-- whose goal got deleted-and-recreated (re-link to the new goal).
-- Attempting a blanket DELETE here would lose legitimate work.

ALTER TABLE public.todos
  DROP CONSTRAINT IF EXISTS todos_goal_id_fkey;

ALTER TABLE public.todos
  ADD CONSTRAINT todos_goal_id_fkey
  FOREIGN KEY (goal_id)
  REFERENCES public.goals(id)
  ON DELETE CASCADE;
