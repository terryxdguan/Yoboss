-- Add rolling summary (session-level memory) to chat_sessions
ALTER TABLE public.chat_sessions ADD COLUMN summary text;
