ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS pricing_settings jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS quote_requested boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS public.uq_quotes_lead_current;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_lead_current_alt
  ON public.quotes USING btree (lead_id, alternative_key)
  WHERE (is_current AND lead_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.quote_create_for_lead(p_lead_id uuid, p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE l record; nid uuid;
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'Válaszd ki, melyik ügyhöz készül az ajánlat' USING ERRCODE = 'check_violation';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('received_budget','viba_offer') THEN
    RAISE EXCEPTION 'Válaszd ki az ajánlat típusát' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id, status, contact_id, summary INTO l FROM leads WHERE id = p_lead_id FOR UPDATE;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Az ügy nem található, vagy nincs hozzá jogosultságod' USING ERRCODE = '42501';
  END IF;
  IF l.status IN ('won','lost') THEN
    RAISE EXCEPTION 'Lezárt ügyhöz nem indítható új ajánlat' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM quotes WHERE lead_id = p_lead_id) THEN
    RAISE EXCEPTION 'Ehhez az ügyhöz már van ajánlat — nyisd meg, és ott készíts új verziót vagy alternatívát' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO quotes(lead_id, version, is_current, status, group_id, alternative_key, quote_kind, contact_id, title)
  VALUES (p_lead_id, 1, true, 'draft', gen_random_uuid(), 'A', p_kind, l.contact_id,
          NULLIF(left(trim(COALESCE(l.summary, '')), 200), ''))
  RETURNING id INTO nid;
  RETURN nid;
END
$$;

REVOKE ALL ON FUNCTION public.quote_create_for_lead(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_create_for_lead(uuid, text) TO authenticated;