-- ============================================================
-- VIBA CRM — Gmail integráció minimális séma bővítés
-- Csak a meglévő users_profile / email_threads / emails táblákat
-- bővíti. Új tábla NEM jön létre. Idempotens.
-- ============================================================

-- 1) users_profile: Gmail OAuth token tárolás per user --------
ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS gmail_email          text;
ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS gmail_refresh_token  text;
ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS gmail_access_token   text;
ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS gmail_expires_at     timestamptz;
ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS gmail_scope          text;
ALTER TABLE public.users_profile ADD COLUMN IF NOT EXISTS gmail_last_sync_at   timestamptz;

-- 2) email_threads: Gmail thread azonosító ---------------------
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS gmail_thread_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_threads_gmail_thread_id
  ON public.email_threads(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;

-- 3) emails: Gmail message azonosító ---------------------------
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS gmail_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_emails_gmail_message_id
  ON public.emails(gmail_message_id) WHERE gmail_message_id IS NOT NULL;