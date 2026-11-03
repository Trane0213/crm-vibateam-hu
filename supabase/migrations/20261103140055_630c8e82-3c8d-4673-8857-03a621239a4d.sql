CREATE TABLE public.quote_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('crm','gmail_link')),
  status text NOT NULL CHECK (status IN ('sending','sent','failed','recorded')),
  idempotency_key text UNIQUE,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  email_id uuid REFERENCES public.emails(id) ON DELETE SET NULL,
  gmail_message_id text,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  error text,
  sent_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_sends_quote_idx ON public.quote_sends(quote_id, created_at DESC);
CREATE UNIQUE INDEX quote_sends_email_once ON public.quote_sends(quote_id, email_id) WHERE email_id IS NOT NULL;
GRANT SELECT ON public.quote_sends TO authenticated;
GRANT ALL ON public.quote_sends TO service_role;
ALTER TABLE public.quote_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_sends_select ON public.quote_sends FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)));
ALTER TABLE public.quotes ADD COLUMN sent_at timestamptz;
CREATE OR REPLACE FUNCTION public.quotes_lock_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR (to_jsonb(NEW) - ARRAY['is_current','status','project_id','total_amount','sent_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['is_current','status','project_id','total_amount','sent_at']) THEN
      RAISE EXCEPTION 'Kiküldött ajánlat nem módosítható — készíts új verziót' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;