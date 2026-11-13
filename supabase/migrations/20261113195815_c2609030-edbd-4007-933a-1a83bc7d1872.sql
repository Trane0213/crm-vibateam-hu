-- AI OS 2.0 / 4. szakasz: egységes, szerepköralapú értesítési eseménytár
CREATE TABLE public.crm_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('ai','document','business','system','feedback')),
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  requires_decision boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link_path text CHECK (link_path IS NULL OR link_path ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  source_table text,
  source_id uuid,
  audience_roles text[] NOT NULL DEFAULT '{}',
  audience_user uuid,
  occurrences integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX crm_notifications_recent_idx ON public.crm_notifications(last_occurred_at DESC);
CREATE INDEX crm_notifications_user_idx ON public.crm_notifications(audience_user) WHERE audience_user IS NOT NULL;

CREATE TABLE public.crm_notification_reads (
  notification_id uuid NOT NULL REFERENCES public.crm_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

GRANT SELECT ON public.crm_notifications TO authenticated;
GRANT ALL ON public.crm_notifications TO service_role;
GRANT SELECT, INSERT, DELETE ON public.crm_notification_reads TO authenticated;
GRANT ALL ON public.crm_notification_reads TO service_role;

ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notification_reads ENABLE ROW LEVEL SECURITY;

-- Forrásrekord láthatósága a hívó saját RLS-ével (invoker), szűk táblalistával.
CREATE OR REPLACE FUNCTION public.crm_notification_source_visible(p_table text, p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE r boolean;
BEGIN
  IF p_id IS NULL OR p_table NOT IN ('leads','quotes','projects','companies','issue_reports','issue_report_findings','knowledge_documents') THEN
    RETURN false;
  END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', p_table) INTO r USING p_id;
  RETURN coalesce(r, false);
END $$;
REVOKE ALL ON FUNCTION public.crm_notification_source_visible(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_notification_source_visible(text, uuid) TO authenticated;

CREATE POLICY crm_notifications_select ON public.crm_notifications FOR SELECT TO authenticated
USING (
  (audience_user = auth.uid()
    OR ('owner' = ANY (audience_roles) AND public.is_owner_role(auth.uid()))
    OR public.crm_role_of(auth.uid()) = ANY (audience_roles))
  AND (source_table IS NULL
    OR (source_table = 'quote_requests' AND public.crm_role_of(auth.uid()) = ANY (ARRAY['owner','admin','project_manager','marketing','sales']))
    OR public.crm_notification_source_visible(source_table, source_id))
);

CREATE POLICY crm_notification_reads_select ON public.crm_notification_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY crm_notification_reads_insert ON public.crm_notification_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.crm_notifications n WHERE n.id = notification_id));
CREATE POLICY crm_notification_reads_delete ON public.crm_notification_reads FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Belső író függvények (csak triggerek / szerver). Egy esemény = egy értesítés (dedupe_key).
CREATE OR REPLACE FUNCTION public.crm_notify(p_key text, p_category text, p_severity text, p_title text, p_body text, p_link text,
  p_source_table text, p_source_id uuid, p_roles text[], p_user uuid, p_decision boolean, p_aggregate boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_aggregate THEN
    INSERT INTO public.crm_notifications(dedupe_key, category, severity, requires_decision, title, body, link_path, source_table, source_id, audience_roles, audience_user)
    VALUES (p_key, p_category, p_severity, p_decision, left(p_title, 200), left(coalesce(p_body, ''), 400), p_link, p_source_table, p_source_id, coalesce(p_roles, '{}'), p_user)
    ON CONFLICT (dedupe_key) DO UPDATE SET occurrences = crm_notifications.occurrences + 1, last_occurred_at = now(), body = EXCLUDED.body, resolved_at = NULL;
  ELSE
    INSERT INTO public.crm_notifications(dedupe_key, category, severity, requires_decision, title, body, link_path, source_table, source_id, audience_roles, audience_user)
    VALUES (p_key, p_category, p_severity, p_decision, left(p_title, 200), left(coalesce(p_body, ''), 400), p_link, p_source_table, p_source_id, coalesce(p_roles, '{}'), p_user)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.crm_notification_resolve(p_prefix text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.crm_notifications SET resolved_at = now() WHERE resolved_at IS NULL AND (dedupe_key = p_prefix OR dedupe_key LIKE p_prefix || ':%');
$$;
REVOKE ALL ON FUNCTION public.crm_notify(text,text,text,text,text,text,text,uuid,text[],uuid,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_notification_resolve(text) FROM PUBLIC, anon, authenticated;

-- 1) Visszajelzések (közös hibajegyzék)
CREATE OR REPLACE FUNCTION public.crm_notify_issue_reports() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM crm_notify('issue_new:'||NEW.id, 'feedback', 'warning', 'Új bejelentés a hibaközpontban', left(NEW.description, 160), '/help', 'issue_reports', NEW.id, ARRAY['owner'], NULL, true);
    RETURN NEW;
  END IF;
  IF OLD.status = 'new' AND NEW.status <> 'new' THEN PERFORM crm_notification_resolve('issue_new:'||NEW.id); END IF;
  IF NEW.status = 'checking' AND OLD.status IS DISTINCT FROM 'checking' THEN
    PERFORM crm_notify('issue_check:'||NEW.id||':'||floor(extract(epoch FROM now()))::bigint, 'feedback', 'warning', 'A bejelentésed javítása elkészült — kérjük, próbáld ki', left(NEW.description, 160), '/help', 'issue_reports', NEW.id, '{}', NEW.reporter_id, true);
  END IF;
  IF NEW.reporter_verdict IS NOT NULL AND NEW.reporter_verdict_at IS DISTINCT FROM OLD.reporter_verdict_at THEN
    PERFORM crm_notification_resolve('issue_check:'||NEW.id);
    PERFORM crm_notify('issue_verdict:'||NEW.id||':'||floor(extract(epoch FROM NEW.reporter_verdict_at))::bigint, 'feedback',
      CASE WHEN NEW.reporter_verdict = 'resolved' THEN 'info' ELSE 'warning' END,
      CASE WHEN NEW.reporter_verdict = 'resolved' THEN 'Bejelentő visszaigazolta: megoldódott' ELSE 'Bejelentő szerint nem oldódott meg' END,
      left(coalesce(NEW.reporter_feedback, NEW.description), 160), '/help', 'issue_reports', NEW.id, ARRAY['owner'], NULL, NEW.reporter_verdict <> 'resolved');
  END IF;
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
    PERFORM crm_notification_resolve('issue_new:'||NEW.id); PERFORM crm_notification_resolve('issue_verdict:'||NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_notify_issue_reports AFTER INSERT OR UPDATE ON public.issue_reports FOR EACH ROW EXECUTE FUNCTION public.crm_notify_issue_reports();

-- 2) AI-megállapítás: George koordinált vizsgálata elkészült
CREATE OR REPLACE FUNCTION public.crm_notify_issue_findings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.contribution = 'coordinator' THEN
    PERFORM crm_notify('ai_review:'||NEW.id, 'ai', CASE WHEN NEW.report_status IN ('blocked','invalid_format') THEN 'warning' ELSE 'info' END,
      'George vizsgálata elkészült', left(NEW.summary, 200), '/help', 'issue_report_findings', NEW.id, '{}', NEW.requested_by, false);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_notify_issue_findings AFTER INSERT ON public.issue_report_findings FOR EACH ROW EXECUTE FUNCTION public.crm_notify_issue_findings();

-- 3) Üzleti események: lead-hozzárendelés, megnyert / elvesztett ügy
CREATE OR REPLACE FUNCTION public.crm_notify_leads() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cname text;
BEGIN
  SELECT c.name INTO cname FROM public.companies c WHERE c.id = NEW.company_id;
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) AND NEW.assigned_to IS DISTINCT FROM auth.uid() THEN
    PERFORM crm_notify('lead_assign:'||NEW.id||':'||NEW.assigned_to||':'||floor(extract(epoch FROM now()))::bigint, 'business', 'warning', 'Új ügy lett hozzád rendelve',
      coalesce(cname, 'Ismeretlen cég'), '/leads/'||NEW.id, 'leads', NEW.id, '{}', NEW.assigned_to, false);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('won','lost') THEN
    PERFORM crm_notify('lead_status:'||NEW.id||':'||NEW.status, 'business', 'info',
      CASE WHEN NEW.status = 'won' THEN 'Megnyert ügy' ELSE 'Elvesztett ügy' END,
      coalesce(cname, 'Ismeretlen cég') || CASE WHEN NEW.status = 'lost' AND NEW.lost_reason IS NOT NULL THEN ' — ok: '||NEW.lost_reason ELSE '' END,
      '/leads/'||NEW.id, 'leads', NEW.id, ARRAY['owner'], NULL, false);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_notify_leads AFTER INSERT OR UPDATE OF assigned_to, status ON public.leads FOR EACH ROW EXECUTE FUNCTION public.crm_notify_leads();

-- 4) Üzleti esemény: igazolt ajánlatkiküldés
CREATE OR REPLACE FUNCTION public.crm_notify_quote_sends() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    PERFORM crm_notify('quote_sent:'||NEW.id, 'business', 'info', 'Ajánlat kiküldve (Gmail igazolással)', left(coalesce(NEW.subject, ''), 160),
      '/quotes/'||NEW.quote_id, 'quotes', NEW.quote_id, ARRAY['owner'], NULL, false);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_notify_quote_sends AFTER INSERT OR UPDATE OF status ON public.quote_sends FOR EACH ROW EXECUTE FUNCTION public.crm_notify_quote_sends();

-- 5) Üzleti esemény: új weboldali ajánlatkérés (személyes adat nélkül), feldolgozáskor lezárul
CREATE OR REPLACE FUNCTION public.crm_notify_quote_requests() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM crm_notify('web_request:'||NEW.id, 'business', 'warning',
      CASE WHEN coalesce(NEW.name,'')||' '||coalesce(NEW.message,'') ILIKE '%TESZT%' THEN 'Új weboldali ajánlatkérés (TESZT)' ELSE 'Új weboldali ajánlatkérés' END,
      'Űrlap: '||coalesce(NEW.form_type, 'ismeretlen')||' — feldolgozásra vár', '/web-quote-requests/'||NEW.id, 'quote_requests', NEW.id, ARRAY['owner','marketing'], NULL, true);
  ELSIF NEW.intake_at IS NOT NULL AND OLD.intake_at IS NULL THEN
    PERFORM crm_notification_resolve('web_request:'||NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_notify_quote_requests AFTER INSERT OR UPDATE OF intake_at ON public.quote_requests FOR EACH ROW EXECUTE FUNCTION public.crm_notify_quote_requests();

-- 6) Dokumentumváltozás: feldolgozás ellenőrzést igényel / sikertelen; sikeres újrafeldolgozáskor lezárul
CREATE OR REPLACE FUNCTION public.crm_notify_knowledge_documents() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.processing_status IS DISTINCT FROM OLD.processing_status THEN
    IF NEW.processing_status IN ('needs_review','failed') AND NEW.superseded_at IS NULL THEN
      PERFORM crm_notify('kdoc:'||NEW.id||':'||NEW.processing_status||':'||coalesce(NEW.content_sha256, 'nohash'), 'document',
        CASE WHEN NEW.processing_status = 'failed' THEN 'warning' ELSE 'info' END,
        CASE WHEN NEW.processing_status = 'failed' THEN 'Dokumentum feldolgozása sikertelen' ELSE 'Dokumentum ellenőrzést igényel' END,
        left(coalesce(NEW.title, 'Névtelen dokumentum'), 160)||coalesce(' — '||NEW.error_code, ''), '/settings/knowledge-graph', 'knowledge_documents', NEW.id, ARRAY['owner'], NULL, false);
    ELSIF NEW.processing_status IN ('processed','partial') THEN
      PERFORM crm_notification_resolve('kdoc:'||NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_notify_knowledge_documents AFTER UPDATE OF processing_status ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.crm_notify_knowledge_documents();

-- 7) Rendszerhiba: AI-futások — kredithiba kritikus (naponta egy összevont jelzés), egyéb hibák napi összevonással
CREATE OR REPLACE FUNCTION public.crm_notify_agent_runs() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d text := to_char((now() AT TIME ZONE 'Europe/Budapest')::date, 'YYYY-MM-DD');
BEGIN
  IF NEW.status = 'error' AND OLD.status IS DISTINCT FROM 'error' THEN
    IF coalesce(NEW.error_message, '') ~* '(429|insufficient_quota|credit)' THEN
      PERFORM crm_notify('ai_credit:'||d, 'system', 'critical', 'AI-szolgáltatás leállt: elfogyott az OpenAI-egyenleg', 'Az AI-asszisztensek nem tudnak válaszolni, amíg az egyenleg nincs feltöltve.', '/settings/openai', NULL, NULL, ARRAY['owner'], NULL, true, true);
    ELSIF coalesce(NEW.error_message, '') NOT LIKE 'stale_running_closed%' THEN
      PERFORM crm_notify('ai_error:'||NEW.agent_id||':'||d, 'system', 'warning', 'AI-futási hibák ma: '||NEW.agent_id, left(coalesce(NEW.error_message, 'Ismeretlen hiba'), 160), '/settings/agent-audit', NULL, NULL, ARRAY['owner'], NULL, false, true);
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_notify_agent_runs AFTER UPDATE OF status ON public.agent_runs FOR EACH ROW EXECUTE FUNCTION public.crm_notify_agent_runs();

REVOKE ALL ON FUNCTION public.crm_notify_issue_reports(), public.crm_notify_issue_findings(), public.crm_notify_leads(), public.crm_notify_quote_sends(),
  public.crm_notify_quote_requests(), public.crm_notify_knowledge_documents(), public.crm_notify_agent_runs() FROM PUBLIC, anon, authenticated;

-- Nyitott állapotok egyszeri felvétele (csak értesítés-metaadat; üzleti adat nem változik)
INSERT INTO public.crm_notifications(dedupe_key, category, severity, requires_decision, title, body, link_path, source_table, source_id, audience_roles, created_at, last_occurred_at)
SELECT 'issue_new:'||r.id, 'feedback', 'warning', true, 'Új bejelentés a hibaközpontban', left(r.description, 160), '/help', 'issue_reports', r.id, ARRAY['owner'], r.created_at, r.created_at
FROM public.issue_reports r WHERE r.status = 'new'
ON CONFLICT (dedupe_key) DO NOTHING;
INSERT INTO public.crm_notifications(dedupe_key, category, severity, requires_decision, title, body, link_path, source_table, source_id, audience_roles, created_at, last_occurred_at)
SELECT 'kdoc:'||k.id||':'||k.processing_status||':'||coalesce(k.content_sha256, 'nohash'), 'document',
  CASE WHEN k.processing_status = 'failed' THEN 'warning' ELSE 'info' END, false,
  CASE WHEN k.processing_status = 'failed' THEN 'Dokumentum feldolgozása sikertelen' ELSE 'Dokumentum ellenőrzést igényel' END,
  left(coalesce(k.title, 'Névtelen dokumentum'), 160)||coalesce(' — '||k.error_code, ''), '/settings/knowledge-graph', 'knowledge_documents', k.id, ARRAY['owner'],
  coalesce(k.processed_at, k.updated_at), coalesce(k.processed_at, k.updated_at)
FROM public.knowledge_documents k WHERE k.processing_status IN ('needs_review','failed') AND k.superseded_at IS NULL
ON CONFLICT (dedupe_key) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_notifications;