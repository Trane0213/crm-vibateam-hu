-- ============================================================
-- VIBA CRM — Email modul nagyjavítás (2026-06-14)
-- Új oszlopok + email_thread_access tábla + RLS szerver oldali
-- per-mailbox jogosultság-szigorítás. Idempotens, többször futtatható.
-- ============================================================

-- 1) emails – új oszlopok ------------------------------------
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS is_outbound       boolean NOT NULL DEFAULT false;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS internal_date     timestamptz;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS snippet           text;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS to_emails         text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS cc_emails         text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS bcc_emails        text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS gmail_label_ids   text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS owner_user_id     uuid;  -- melyik mailbox user-é
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS company_id        uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS lead_id           uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_emails_internal_date ON public.emails(internal_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_emails_from_email    ON public.emails(from_email);
CREATE INDEX IF NOT EXISTS idx_emails_owner_user    ON public.emails(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_emails_company_id    ON public.emails(company_id);
CREATE INDEX IF NOT EXISTS idx_emails_lead_id       ON public.emails(lead_id);
CREATE INDEX IF NOT EXISTS idx_emails_to_emails_gin ON public.emails USING gin(to_emails);
CREATE INDEX IF NOT EXISTS idx_emails_labels_gin    ON public.emails USING gin(gmail_label_ids);

-- 2) email_threads – új oszlopok -----------------------------
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS last_message_at  timestamptz;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS gmail_label_ids  text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS owner_user_id    uuid;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS company_id       uuid REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS contact_id       uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS lead_id          uuid REFERENCES public.leads(id) ON DELETE SET NULL;
ALTER TABLE public.email_threads ADD COLUMN IF NOT EXISTS participants     text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_email_threads_last_msg  ON public.email_threads(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_email_threads_owner     ON public.email_threads(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_company   ON public.email_threads(company_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_contact   ON public.email_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_lead      ON public.email_threads(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_part_gin  ON public.email_threads USING gin(participants);

-- 3) email_thread_access — per-user hozzáférési mátrix --------
CREATE TABLE IF NOT EXISTS public.email_thread_access (
  thread_id     uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,            -- auth.users.id
  mailbox_email text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_email_thread_access_user    ON public.email_thread_access(user_id);
CREATE INDEX IF NOT EXISTS idx_email_thread_access_mailbox ON public.email_thread_access(mailbox_email);

GRANT SELECT ON public.email_thread_access TO authenticated;
GRANT ALL    ON public.email_thread_access TO service_role;

-- 4) Jogosultság helper függvények (a policy-k előtt kell létezniük) -
CREATE OR REPLACE FUNCTION public.is_email_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_profile up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.auth_user_id = _user_id
      AND lower(coalesce(r.name,'')) IN ('owner','tulajdonos','admin','superadmin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_email_thread(_thread_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_email_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.email_thread_access a
      WHERE a.thread_id = _thread_id AND a.user_id = _user_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_email_admin(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_email_thread(uuid,uuid) TO authenticated;

ALTER TABLE public.email_thread_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eta_select_self" ON public.email_thread_access;
CREATE POLICY "eta_select_self"
  ON public.email_thread_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_email_admin(auth.uid()));

-- 5) RLS frissítés – per-user szigorítás ---------------------
ALTER TABLE public.emails        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emails_select_authenticated"  ON public.emails;
DROP POLICY IF EXISTS "emails_select_all"            ON public.emails;
DROP POLICY IF EXISTS "emails_select_per_user"       ON public.emails;
CREATE POLICY "emails_select_per_user"
  ON public.emails FOR SELECT TO authenticated
  USING (
    public.is_email_admin(auth.uid())
    OR (thread_id IS NOT NULL AND public.can_access_email_thread(thread_id, auth.uid()))
  );

DROP POLICY IF EXISTS "emails_write_authenticated" ON public.emails;
DROP POLICY IF EXISTS "emails_write_per_user"      ON public.emails;
CREATE POLICY "emails_write_per_user"
  ON public.emails FOR ALL TO authenticated
  USING (
    public.is_email_admin(auth.uid())
    OR (thread_id IS NOT NULL AND public.can_access_email_thread(thread_id, auth.uid()))
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "email_threads_select_authenticated" ON public.email_threads;
DROP POLICY IF EXISTS "email_threads_select_all"           ON public.email_threads;
DROP POLICY IF EXISTS "email_threads_select_per_user"      ON public.email_threads;
CREATE POLICY "email_threads_select_per_user"
  ON public.email_threads FOR SELECT TO authenticated
  USING (public.can_access_email_thread(id, auth.uid()));

DROP POLICY IF EXISTS "email_threads_write_authenticated" ON public.email_threads;
DROP POLICY IF EXISTS "email_threads_write_per_user"      ON public.email_threads;
CREATE POLICY "email_threads_write_per_user"
  ON public.email_threads FOR ALL TO authenticated
  USING (public.can_access_email_thread(id, auth.uid()))
  WITH CHECK (true);

-- email_attachments: hozzáférés az email-en keresztül
DROP POLICY IF EXISTS "email_attachments_select_authenticated" ON public.email_attachments;
DROP POLICY IF EXISTS "email_attachments_select_per_user"      ON public.email_attachments;
CREATE POLICY "email_attachments_select_per_user"
  ON public.email_attachments FOR SELECT TO authenticated
  USING (
    public.is_email_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.emails e
      WHERE e.id = email_attachments.email_id
        AND e.thread_id IS NOT NULL
        AND public.can_access_email_thread(e.thread_id, auth.uid())
    )
  );

-- 6) Backfill: létező emailekre internal_date + is_outbound + thread_access
UPDATE public.emails SET internal_date = created_at WHERE internal_date IS NULL;

-- is_outbound: ha a from_email valamely felhasználói gmail_email
UPDATE public.emails e
   SET is_outbound = true
 WHERE is_outbound = false
   AND e.from_email IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.users_profile up
      WHERE lower(coalesce(up.gmail_email,'')) = lower(e.from_email)
   );

-- email_thread_access backfill: minden szálhoz, ahol a from/to/to_emails megegyezik egy user gmail_email-jével
INSERT INTO public.email_thread_access (thread_id, user_id, mailbox_email)
SELECT DISTINCT e.thread_id, up.auth_user_id, lower(up.gmail_email)
  FROM public.emails e
  JOIN public.users_profile up ON up.gmail_email IS NOT NULL
 WHERE e.thread_id IS NOT NULL
   AND up.auth_user_id IS NOT NULL
   AND (
        lower(coalesce(e.from_email,'')) = lower(up.gmail_email)
     OR lower(coalesce(e.to_email,''))   = lower(up.gmail_email)
   )
ON CONFLICT DO NOTHING;

-- email_threads.last_message_at backfill
UPDATE public.email_threads t
   SET last_message_at = sub.max_dt
  FROM (
    SELECT thread_id, MAX(coalesce(internal_date, created_at)) AS max_dt
      FROM public.emails
     WHERE thread_id IS NOT NULL
     GROUP BY thread_id
  ) sub
 WHERE t.id = sub.thread_id
   AND (t.last_message_at IS NULL OR t.last_message_at < sub.max_dt);

-- GRANTs idempotens megerősítés
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emails        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_threads TO authenticated;
GRANT ALL ON public.emails        TO service_role;
GRANT ALL ON public.email_threads TO service_role;