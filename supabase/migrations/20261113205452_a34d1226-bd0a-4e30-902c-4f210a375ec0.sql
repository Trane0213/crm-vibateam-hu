-- Fix: knowledge_enqueue_source referenced NEW.inline / NEW.r2_key on tables without those columns (project/company/quote documents insert/update failed).
-- Rollback: previous definition in migration 20261113193111.
CREATE OR REPLACE FUNCTION public.knowledge_enqueue_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_project uuid; v_quote uuid; v_lead uuid; v_email uuid; v_title text; v_changed boolean;
BEGIN
  IF TG_TABLE_NAME = 'email_attachments' THEN
    IF coalesce(NEW.inline, false) THEN RETURN NEW; END IF;
    v_email := NEW.email_id; v_title := NEW.filename;
    IF TG_OP = 'UPDATE' THEN v_changed := NEW.r2_key IS DISTINCT FROM OLD.r2_key; END IF;
  ELSE
    IF TG_TABLE_NAME = 'company_documents' THEN v_company := NEW.company_id; v_title := NEW.name;
    ELSIF TG_TABLE_NAME = 'project_documents' THEN v_project := NEW.project_id; v_title := NEW.name;
      SELECT p.company_id, p.lead_id INTO v_company, v_lead FROM public.projects p WHERE p.id = NEW.project_id;
    ELSIF TG_TABLE_NAME = 'quote_documents' THEN v_quote := NEW.quote_id; v_title := NEW.name;
      SELECT q.lead_id, q.project_id INTO v_lead, v_project FROM public.quotes q WHERE q.id = NEW.quote_id;
    END IF;
    IF TG_OP = 'UPDATE' THEN v_changed := NEW.file_url IS DISTINCT FROM OLD.file_url; END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
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
REVOKE ALL ON FUNCTION public.knowledge_enqueue_source() FROM PUBLIC, anon, authenticated;