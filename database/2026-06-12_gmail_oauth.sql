-- ============================================================
-- VIBA CRM — Saját Google OAuth + Gmail integráció (additív)
-- Idempotens, többször futtatható.
-- ============================================================

-- 1) emails tábla bővítés: Gmail-szinkronhoz szükséges mezők ----
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS gmail_message_id text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS gmail_thread_id  text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS gmail_label_ids  text[];
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS gmail_history_id bigint;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS direction        text CHECK (direction IN ('in','out'));
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS sent_at          timestamptz;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS owner_user_id    uuid;  -- mely felhasználó Gmail-fiókjából jött

CREATE UNIQUE INDEX IF NOT EXISTS uniq_emails_gmail_message_id
  ON public.emails(gmail_message_id) WHERE gmail_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_gmail_thread_id ON public.emails(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_owner_user_id   ON public.emails(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_at         ON public.emails(sent_at DESC);

-- 2) gmail_accounts: per-user Gmail OAuth token tároló ---------
CREATE TABLE IF NOT EXISTS public.gmail_accounts (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL,
  refresh_token text NOT NULL,
  access_token  text,
  expires_at    timestamptz,
  history_id    bigint,
  scope         text,
  last_sync_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmail_accounts_email ON public.gmail_accounts(email);

-- A tokenek érzékenyek — RLS-szel a saját sorát látja csak a user.
-- Service role írja/olvassa az OAuth callback és a sync során.
GRANT SELECT, UPDATE ON public.gmail_accounts TO authenticated;
GRANT ALL ON public.gmail_accounts TO service_role;

ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gmail_accounts_select_own" ON public.gmail_accounts;
CREATE POLICY "gmail_accounts_select_own"
  ON public.gmail_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "gmail_accounts_delete_own" ON public.gmail_accounts;
CREATE POLICY "gmail_accounts_delete_own"
  ON public.gmail_accounts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- INSERT/UPDATE-et csak service_role végzi (callback + sync).

-- 3) updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_gmail_accounts_updated ON public.gmail_accounts;
CREATE TRIGGER trg_gmail_accounts_updated
  BEFORE UPDATE ON public.gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();