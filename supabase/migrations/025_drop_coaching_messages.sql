-- Drop the unused coaching_messages table.
-- Originally created in 001_initial_schema.sql for a Dashboard "morning
-- coaching message" feature that was later removed in a Dashboard redesign.
-- The /api/ai/coach route, lib/ai/coach.ts, and saveCoachingMessage /
-- getTodayCoachingMessage helpers have all been deleted in this same
-- change set; this table has had no readers or writers since.
DROP TABLE IF EXISTS public.coaching_messages CASCADE;
