-- User-level long-term memory: stable preferences extracted from chats so
-- agents can pick up cross-session/cross-agent context without re-asking.
-- Populated by the same Haiku rollover that maintains chat_sessions.summary
-- (every 10 turns). Capped at 50 entries per user; eviction handled in app
-- code (oldest 'low' importance first, then medium).
CREATE TABLE public.user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  -- Loose tag like 'communication_style', 'work_context', 'goals_focus',
  -- 'preferences', 'background'. Free-form so we can iterate on taxonomy
  -- without migrations.
  category text,
  -- The actual fact, stored verbatim in the user's language.
  content text NOT NULL,
  importance text NOT NULL DEFAULT 'medium'
    CHECK (importance IN ('low', 'medium', 'high')),
  -- Where this was extracted from — useful for debugging and for the
  -- Settings UI to show "from your chat with the X coach".
  source_session_id uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Bumped every time this entry is injected into a prompt; used for LRU
  -- eviction when the user hits the 50-entry cap.
  last_used_at timestamptz NOT NULL DEFAULT now()
);

-- Pulls all memory for a user ordered by injection priority (high importance
-- first, then most-recently-used). Single hit, no extra sort needed.
CREATE INDEX idx_user_memory_priority
  ON public.user_memory(user_id, importance DESC, last_used_at DESC);

ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their memory" ON public.user_memory FOR ALL
  USING (auth.uid() = user_id);
