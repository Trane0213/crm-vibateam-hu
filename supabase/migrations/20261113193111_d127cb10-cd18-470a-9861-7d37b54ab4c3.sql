-- AI OS 2.0 / 2. részegység: dokumentum-feldolgozási sor a meglévő knowledge_documents táblán.
-- Rollback: DROP TRIGGER knowledge_enqueue_* / knowledge_retire_* a 4 forrástáblán; DROP FUNCTION knowledge_enqueue_source(), knowledge_retire_source(),
--   knowledge_claim_batch(integer), knowledge_store_result(uuid,uuid,text,bigint,text,text,text,text,jsonb,jsonb,boolean);
--   ALTER TABLE knowledge_documents DROP COLUMN claim_token, claimed_at, attempts; DELETE FROM knowledge_documents WHERE source_table IS NOT NULL (csak index).

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
-- Tárolási kulcs/URL nem kerül a tudásbázisba; a forrássor azonosítója elég.
ALTER TABLE public.knowledge_documents ALTER COLUMN file_url DROP NOT NULL;
CREATE INDEX IF NOT EXISTS knowledge_documents_pending_idx ON public.knowledge_documents (processing_status, claimed_at) WHERE superseded_at IS NULL;

-- Bizonyított kapcsolatok: csak a forrássor saját FK-i (e-mail-mellékletnél a vitatott levél–cég kötés NEM öröklődik).
CREATE OR REPLACE FUNCTION public.knowledge_enqueue_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_project uuid; v_quote uuid; v_lead uuid; v_email uuid; v_title text; v_changed boolean;
BEGIN
  IF TG_TABLE_NAME = 'email_attachments' AND coalesce(NEW.inline, false) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'company_documents' THEN v_company := NEW.company_id; v_title := NEW.name;
  ELSIF TG_TABLE_NAME = 'project_documents' THEN v_project := NEW.project_id; v_title := NEW.name;
    SELECT p.company_id, p.lead_id INTO v_company, v_lead FROM public.projects p WHERE p.id = NEW.project_id;
  ELSIF TG_TABLE_NAME = 'quote_documents' THEN v_quote := NEW.quote_id; v_title := NEW.name;
    SELECT q.lead_id, q.project_id INTO v_lead, v_project FROM public.quotes q WHERE q.id = NEW.quote_id;
  ELSE v_email := NEW.email_id; v_title := NEW.filename;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_changed := CASE WHEN TG_TABLE_NAME = 'email_attachments' THEN NEW.r2_key IS DISTINCT FROM OLD.r2_key ELSE NEW.file_url IS DISTINCT FROM OLD.file_url END;
    UPDATE public.knowledge_documents SET title = v_title, company_id = v_company, project_id = v_project, quote_id = v_quote, lead_id = v_lead,
      processing_status = CASE WHEN v_changed THEN 'pending' ELSE processing_status END,
      attempts = CASE WHEN v_changed THEN 0 ELSE attempts END,
      claim_token = CASE WHEN v_changed THEN NULL ELSE claim_token END,
      source_updated_at = CASE WHEN v_changed THEN now() ELSE source_updated_at END, updated_at = now()
    WHERE source_table = TG_TABLE_NAME AND source_id = NEW.id AND superseded_at IS NULL;
    IF FOUND THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.knowledge_documents (title, category, source_table, source_id, company_id, project_id, quote_id, lead_id, email_id, source_created_at, source_updated_at, processing_status)
  VALUES (coalesce(v_title, '[névtelen]'), TG_TABLE_NAME, TG_TABLE_NAME, NEW.id, v_company, v_project, v_quote, v_lead, v_email, NEW.created_at, now(), 'pending')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- Törölt forrás: az index érvénytelenítése (keresésben nem jelenik meg aktuálisként).
CREATE OR REPLACE FUNCTION public.knowledge_retire_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.knowledge_documents SET superseded_at = now(), updated_at = now(), error_code = coalesce(error_code, 'source_deleted')
  WHERE source_table = TG_TABLE_NAME AND source_id = OLD.id AND superseded_at IS NULL;
  RETURN OLD;
END $$;

CREATE TRIGGER knowledge_enqueue_company AFTER INSERT OR UPDATE OF file_url, name ON public.company_documents FOR EACH ROW EXECUTE FUNCTION public.knowledge_enqueue_source();
CREATE TRIGGER knowledge_enqueue_project AFTER INSERT OR UPDATE OF file_url, name ON public.project_documents FOR EACH ROW EXECUTE FUNCTION public.knowledge_enqueue_source();
CREATE TRIGGER knowledge_enqueue_quote AFTER INSERT OR UPDATE OF file_url, name ON public.quote_documents FOR EACH ROW EXECUTE FUNCTION public.knowledge_enqueue_source();
CREATE TRIGGER knowledge_enqueue_attachment AFTER INSERT OR UPDATE OF r2_key, filename ON public.email_attachments FOR EACH ROW EXECUTE FUNCTION public.knowledge_enqueue_source();
CREATE TRIGGER knowledge_retire_company AFTER DELETE ON public.company_documents FOR EACH ROW EXECUTE FUNCTION public.knowledge_retire_source();
CREATE TRIGGER knowledge_retire_project AFTER DELETE ON public.project_documents FOR EACH ROW EXECUTE FUNCTION public.knowledge_retire_source();
CREATE TRIGGER knowledge_retire_quote AFTER DELETE ON public.quote_documents FOR EACH ROW EXECUTE FUNCTION public.knowledge_retire_source();
CREATE TRIGGER knowledge_retire_attachment AFTER DELETE ON public.email_attachments FOR EACH ROW EXECUTE FUNCTION public.knowledge_retire_source();

-- Egyszerre egy feldolgozó / dokumentum: SKIP LOCKED + 10 perces lejáró foglalás, max 3 próbálkozás.
CREATE OR REPLACE FUNCTION public.knowledge_claim_batch(p_limit integer)
RETURNS TABLE (id uuid, claim_token uuid, source_table text, source_id uuid, content_sha256 text, processing_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT d.id FROM public.knowledge_documents d
    WHERE d.superseded_at IS NULL AND d.processing_status = 'pending' AND d.attempts < 3
      AND (d.claimed_at IS NULL OR d.claimed_at < now() - interval '10 minutes')
    ORDER BY d.source_updated_at NULLS FIRST, d.id
    LIMIT greatest(1, least(coalesce(p_limit, 5), 10))
    FOR UPDATE SKIP LOCKED)
  UPDATE public.knowledge_documents d SET claim_token = gen_random_uuid(), claimed_at = now(), attempts = d.attempts + 1, updated_at = now()
  FROM picked WHERE d.id = picked.id
  RETURNING d.id, d.claim_token, d.source_table, d.source_id, d.content_sha256, d.processing_status;
END $$;

-- Atomikus eredményrögzítés: azonos hash → nincs újraindexelés; új hash → régi verzió elavul, új aktuális; visszaállt korábbi tartalom → régi verzió újraaktiválva.
CREATE OR REPLACE FUNCTION public.knowledge_store_result(p_id uuid, p_token uuid, p_hash text, p_bytes bigint, p_parser text, p_status text,
  p_error text, p_doc_type text, p_limitations jsonb, p_chunks jsonb, p_retry boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur public.knowledge_documents%ROWTYPE; target uuid; old_version uuid;
BEGIN
  SELECT * INTO cur FROM public.knowledge_documents WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR cur.claim_token IS DISTINCT FROM p_token OR cur.superseded_at IS NOT NULL THEN RETURN jsonb_build_object('stored', false, 'reason', 'claim_lost'); END IF;
  IF p_status NOT IN ('processed','partial','needs_review','unsupported','error') THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF p_status = 'error' AND p_retry AND cur.attempts < 3 THEN
    UPDATE public.knowledge_documents SET processing_status = 'pending', error_code = left(p_error, 200), claim_token = NULL, updated_at = now() WHERE id = p_id;
    RETURN jsonb_build_object('stored', true, 'outcome', 'retry_scheduled');
  END IF;
  target := p_id;
  IF p_hash IS NOT NULL AND cur.content_sha256 IS NOT NULL AND cur.content_sha256 <> p_hash THEN
    UPDATE public.knowledge_documents SET superseded_at = now(), claim_token = NULL, updated_at = now() WHERE id = p_id;
    SELECT id INTO old_version FROM public.knowledge_documents WHERE source_table = cur.source_table AND source_id = cur.source_id AND content_sha256 = p_hash;
    IF old_version IS NOT NULL THEN
      UPDATE public.knowledge_documents SET superseded_at = NULL, title = cur.title, source_updated_at = cur.source_updated_at, updated_at = now() WHERE id = old_version;
      RETURN jsonb_build_object('stored', true, 'outcome', 'restored_previous_version', 'document_id', old_version);
    END IF;
    INSERT INTO public.knowledge_documents (title, category, source_table, source_id, company_id, project_id, quote_id, lead_id, email_id, source_created_at, source_updated_at, processing_status)
    VALUES (cur.title, cur.category, cur.source_table, cur.source_id, cur.company_id, cur.project_id, cur.quote_id, cur.lead_id, cur.email_id, cur.source_created_at, cur.source_updated_at, 'pending')
    RETURNING id INTO target;
  END IF;
  DELETE FROM public.knowledge_chunks WHERE document_id = target;
  IF p_chunks IS NOT NULL AND jsonb_typeof(p_chunks) = 'array' THEN
    INSERT INTO public.knowledge_chunks (document_id, content, unit_label, unit_index, claim_kind)
    SELECT target, left(c->>'text', 8000), left(c->>'label', 200), coalesce((c->>'index')::int, 0),
           CASE WHEN p_status = 'processed' THEN 'source_fact' ELSE 'unverified' END
    FROM jsonb_array_elements(p_chunks) c WHERE coalesce(c->>'text', '') <> '' LIMIT 2000;
  END IF;
  UPDATE public.knowledge_documents SET content_sha256 = coalesce(p_hash, content_sha256), byte_length = coalesce(p_bytes, byte_length), parser = p_parser,
    processing_status = p_status, error_code = left(p_error, 200), limitations = coalesce(p_limitations, '[]'::jsonb),
    category = coalesce(nullif(p_doc_type, ''), category), processed_at = now(), claim_token = NULL, updated_at = now()
  WHERE id = target;
  RETURN jsonb_build_object('stored', true, 'outcome', CASE WHEN target <> p_id THEN 'new_version' ELSE 'indexed' END, 'document_id', target);
END $$;

REVOKE ALL ON FUNCTION public.knowledge_claim_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.knowledge_store_result(uuid,uuid,text,bigint,text,text,text,text,jsonb,jsonb,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.knowledge_enqueue_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.knowledge_retire_source() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_claim_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_store_result(uuid,uuid,text,bigint,text,text,text,text,jsonb,jsonb,boolean) TO service_role;

-- Meglévő dokumentumok sorba állítása (csak index-metaadat, forrásfájl nem változik).
INSERT INTO public.knowledge_documents (title, category, source_table, source_id, company_id, source_created_at, source_updated_at, processing_status)
SELECT coalesce(name,'[névtelen]'), 'company_documents', 'company_documents', id, company_id, created_at, coalesce(updated_at, created_at), 'pending' FROM public.company_documents ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_documents (title, category, source_table, source_id, company_id, project_id, lead_id, source_created_at, source_updated_at, processing_status)
SELECT coalesce(d.name,'[névtelen]'), 'project_documents', 'project_documents', d.id, p.company_id, d.project_id, p.lead_id, d.created_at, d.created_at, 'pending'
FROM public.project_documents d LEFT JOIN public.projects p ON p.id = d.project_id ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_documents (title, category, source_table, source_id, quote_id, lead_id, project_id, source_created_at, source_updated_at, processing_status)
SELECT coalesce(d.name,'[névtelen]'), 'quote_documents', 'quote_documents', d.id, d.quote_id, q.lead_id, q.project_id, d.created_at, d.created_at, 'pending'
FROM public.quote_documents d LEFT JOIN public.quotes q ON q.id = d.quote_id ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_documents (title, category, source_table, source_id, email_id, source_created_at, source_updated_at, processing_status)
SELECT coalesce(filename,'[névtelen]'), 'email_attachments', 'email_attachments', id, email_id, created_at, created_at, 'pending'
FROM public.email_attachments WHERE NOT coalesce(inline, false) ON CONFLICT DO NOTHING;