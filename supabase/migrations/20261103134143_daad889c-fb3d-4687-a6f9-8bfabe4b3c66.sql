ALTER TABLE public.quotes
  ADD COLUMN quote_kind text CHECK (quote_kind IN ('received_budget','viba_offer')),
  ADD COLUMN scope_type text CHECK (scope_type IN ('material_labor','labor_only','other')),
  ADD COLUMN scope_note text,
  ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN responsible_user_id uuid,
  ADD COLUMN request_due_date date,
  ADD COLUMN offer_due_date date,
  ADD COLUMN manual_net_amount numeric CHECK (manual_net_amount IS NULL OR manual_net_amount >= 0),
  ADD COLUMN technical_scope text,
  ADD COLUMN exclusions text;

CREATE TABLE public.quote_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  name text NOT NULL,
  file_url text NOT NULL,
  document_type text NOT NULL DEFAULT 'other' CHECK (document_type IN ('unpriced_budget','priced_budget','technical_plan','technical_scope','contract_terms','sent_offer','other')),
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES public.users_profile(id) DEFAULT current_profile_id(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quote_documents_quote_idx ON public.quote_documents(quote_id);
GRANT SELECT, INSERT, DELETE ON public.quote_documents TO authenticated;
GRANT ALL ON public.quote_documents TO service_role;
ALTER TABLE public.quote_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_documents_select ON public.quote_documents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)));
CREATE POLICY quote_documents_insert ON public.quote_documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = current_profile_id() AND file_url LIKE 'quote-documents/' || quote_id::text || '/%'
    AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)));
CREATE POLICY quote_documents_delete ON public.quote_documents FOR DELETE TO authenticated
  USING ((is_owner_role(auth.uid()) OR uploaded_by = current_profile_id())
    AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)));