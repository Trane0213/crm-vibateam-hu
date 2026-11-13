-- Fix: crm_notify_knowledge_documents checked 'failed', but the ingest status is 'error'. Rollback: previous definition (migration with crm_notify triggers).
CREATE OR REPLACE FUNCTION public.crm_notify_knowledge_documents() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.processing_status IS DISTINCT FROM OLD.processing_status THEN
    IF NEW.processing_status IN ('needs_review','error') AND NEW.superseded_at IS NULL THEN
      PERFORM crm_notify('kdoc:'||NEW.id||':'||NEW.processing_status||':'||coalesce(NEW.content_sha256, 'nohash'), 'document',
        CASE WHEN NEW.processing_status = 'error' THEN 'warning' ELSE 'info' END,
        CASE WHEN NEW.processing_status = 'error' THEN 'Dokumentum feldolgozása sikertelen' ELSE 'Dokumentum ellenőrzést igényel' END,
        left(coalesce(NEW.title, 'Névtelen dokumentum'), 160)||coalesce(' — '||NEW.error_code, ''), '/settings/knowledge-graph', 'knowledge_documents', NEW.id, ARRAY['owner'], NULL, false);
    ELSIF NEW.processing_status IN ('processed','partial') THEN
      PERFORM crm_notification_resolve('kdoc:'||NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.crm_notify_knowledge_documents() FROM PUBLIC, anon, authenticated;