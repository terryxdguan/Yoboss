-- Add metadata column to chat_messages for storing generated files, tool activity, etc.
ALTER TABLE public.chat_messages ADD COLUMN metadata jsonb DEFAULT NULL;
