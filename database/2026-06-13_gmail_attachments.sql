-- ============================================================
-- VIBA CRM — Gmail csatolmányok tárolása
-- Új tábla: public.email_attachments
-- A bináris tartalom R2-ben van; itt csak metaadat + r2_key.
-- Idempotens.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id            uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  gmail_attachment_id text,
  filename            text NOT NULL,
  mime_type           text,
  size_bytes          bigint,
  r2_key              text NOT NULL,
  inline              boolean NOT NULL DEFAULT false,
  content_id          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id
  ON public.email_attachments(email_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_attachments_email_gmail_att
  ON public.email_attachments(email_id, gmail_attachment_id)
  WHERE gmail_attachment_id IS NOT NULL;

-- Data API GRANTs ---------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_attachments TO authenticated;
GRANT ALL ON public.email_attachments TO service_role;

-- RLS — ugyanaz a modell, mint az emails táblán: minden authentikált
-- olvashat (a per-user szűrést a UI végzi a mailbox cím alapján).
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_attachments_select_authenticated" ON public.email_attachments;
CREATE POLICY "email_attachments_select_authenticated"
  ON public.email_attachments
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "email_attachments_write_authenticated" ON public.email_attachments;
CREATE POLICY "email_attachments_write_authenticated"
  ON public.email_attachments
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);