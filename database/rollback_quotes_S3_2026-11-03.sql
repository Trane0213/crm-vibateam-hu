-- Ajánlatkezelés V2.0 S3 visszaállítása (csak tulajdonosi jóváhagyással).
-- Előtte ellenőrizd: ha egy leadhez több current sor van (alternatívák), előbb döntsd el, melyik maradjon aktuális.
DROP TRIGGER IF EXISTS quotes_lock_guard ON public.quotes;
DROP TRIGGER IF EXISTS quotes_lock_delete_guard ON public.quotes;
DROP TRIGGER IF EXISTS quote_items_lock_guard ON public.quote_items;
DROP FUNCTION IF EXISTS public.quotes_lock_guard(), public.quotes_lock_delete_guard(), public.quote_items_lock_guard();
DROP FUNCTION IF EXISTS public.quote_new_version(uuid), public.quote_new_alternative(uuid, text), public.quote_lock_sent(uuid);
DROP INDEX IF EXISTS public.quotes_one_current_per_alt;
DROP INDEX IF EXISTS public.quotes_version_per_alt;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_one_current_per_lead ON public.quotes(lead_id) WHERE is_current AND lead_id IS NOT NULL;
DROP POLICY IF EXISTS quote_documents_delete ON public.quote_documents;
CREATE POLICY quote_documents_delete ON public.quote_documents FOR DELETE TO authenticated
  USING ((is_owner_role(auth.uid()) OR uploaded_by = current_profile_id())
    AND EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_id AND can_access_quote(q.lead_id, q.project_id, q.created_by)));
-- quote_create_draft S1-es változata: lásd S1 migráció (lead_id szerinti verziózás).
ALTER TABLE public.quote_items DROP COLUMN IF EXISTS section;
ALTER TABLE public.quotes DROP COLUMN IF EXISTS group_id, DROP COLUMN IF EXISTS alternative_key,
  DROP COLUMN IF EXISTS alternative_label, DROP COLUMN IF EXISTS locked_at;
