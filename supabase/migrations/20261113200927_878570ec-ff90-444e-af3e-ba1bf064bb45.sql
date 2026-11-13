-- AI OS 2.0 / 5. szakasz: óránkénti determinisztikus változásfigyelés (0 LLM) + George-koordinált, korlátozott célzott vizsgálat.
-- Alapból KIKAPCSOLVA. Csak belső AI-felügyeleti táblákat ír; üzleti adatot nem módosít.

CREATE TABLE public.ai_review_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  daily_review_limit integer NOT NULL DEFAULT 6 CHECK (daily_review_limit BETWEEN 1 AND 48),
  daily_token_limit integer NOT NULL DEFAULT 1500000 CHECK (daily_token_limit BETWEEN 10000 AND 20000000),
  max_reviews_per_run integer NOT NULL DEFAULT 1 CHECK (max_reviews_per_run BETWEEN 1 AND 4),
  paused_reason text,
  paused_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_review_config TO authenticated;
GRANT ALL ON public.ai_review_config TO service_role;
ALTER TABLE public.ai_review_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_review_config_owner_select ON public.ai_review_config FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()));
INSERT INTO public.ai_review_config(id) VALUES (1);

CREATE TABLE public.ai_review_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('collect','review')),
  trigger text NOT NULL CHECK (trigger IN ('cron','owner')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','skipped','error','paused')),
  requested_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  finished_at timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  signal_count integer NOT NULL DEFAULT 0,
  new_signal_count integer NOT NULL DEFAULT 0,
  llm_reviews integer NOT NULL DEFAULT 0,
  tokens_used integer NOT NULL DEFAULT 0,
  note text NOT NULL DEFAULT ''
);
GRANT SELECT ON public.ai_review_runs TO authenticated;
GRANT ALL ON public.ai_review_runs TO service_role;
ALTER TABLE public.ai_review_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_review_runs_owner_select ON public.ai_review_runs FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()));
-- Futási zárolás: fajtánként egyszerre egy futó ciklus.
CREATE UNIQUE INDEX ai_review_runs_single_flight ON public.ai_review_runs(kind) WHERE status = 'running';
CREATE INDEX ai_review_runs_kind_started ON public.ai_review_runs(kind, started_at DESC);

CREATE TABLE public.ai_review_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('state','event')),
  domain text NOT NULL CHECK (domain IN ('sales','marketing','projects','documents','system','feedback')),
  agent text NOT NULL CHECK (agent IN ('george','scarlet','timothy','boss')),
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  title text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_table text,
  source_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','not_needed','in_review','reviewed','failed','resolved')),
  review_attempts integer NOT NULL DEFAULT 0,
  issue_id uuid REFERENCES public.issue_reports(id) ON DELETE SET NULL,
  last_run_id uuid REFERENCES public.ai_review_runs(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  resolved_at timestamptz
);
GRANT SELECT ON public.ai_review_signals TO authenticated;
GRANT ALL ON public.ai_review_signals TO service_role;
ALTER TABLE public.ai_review_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_review_signals_owner_select ON public.ai_review_signals FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()));
CREATE INDEX ai_review_signals_status ON public.ai_review_signals(review_status, severity);

-- Determinisztikus gyűjtés: csak olvas üzleti táblákból, csak ai_review_* és crm_notifications táblába ír. Nincs LLM.
CREATE OR REPLACE FUNCTION public.ai_review_collect(p_trigger text, p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.ai_review_config;
  v_run uuid;
  v_from timestamptz;
  v_to timestamptz := now();
  v_day text := to_char(now() AT TIME ZONE 'Europe/Budapest', 'YYYY-MM-DD');
  v_total int := 0; v_new int := 0; v_new_review int := 0; v_resolved int := 0;
  v_keys text[] := '{}';
  rec record;
  v_inserted boolean;
BEGIN
  IF p_trigger NOT IN ('cron','owner') THEN RAISE EXCEPTION 'invalid trigger' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cfg FROM public.ai_review_config WHERE id = 1;
  IF p_trigger = 'cron' AND NOT coalesce(cfg.enabled, false) THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  UPDATE public.ai_review_runs SET status = 'error', finished_at = now(), note = 'stale_lease'
   WHERE kind = 'collect' AND status = 'running' AND lease_until < now();
  BEGIN
    INSERT INTO public.ai_review_runs(kind, trigger, requested_by, lease_until) VALUES ('collect', p_trigger, p_user, now() + interval '10 minutes') RETURNING id INTO v_run;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'locked');
  END;

  SELECT max(window_to) INTO v_from FROM public.ai_review_runs WHERE kind = 'collect' AND status = 'ok';
  v_from := greatest(coalesce(v_from, v_to - interval '1 hour'), v_to - interval '24 hours');

  FOR rec IN
    -- SALES (Timothy)
    SELECT 'sales_overdue:' || l.id || ':' || to_char(l.next_step_due_at AT TIME ZONE 'Europe/Budapest', 'YYYY-MM-DD') AS k, 'state' AS kind, 'sales' AS domain, 'timothy' AS agent, 'warning' AS sev,
           'Lejárt következő lépés egy nyitott ügynél' AS title,
           jsonb_build_object('lead_id', l.id, 'status', l.status, 'next_step_type', l.next_step_type, 'due_at', l.next_step_due_at, 'assigned_to', l.assigned_to) AS detail, 'leads' AS st, l.id AS sid
      FROM public.leads l WHERE l.status IN ('new','follow_up','quote_prep') AND l.next_step_due_at < v_to
    UNION ALL
    SELECT 'sales_no_next_step:' || l.id, 'state', 'sales', 'timothy', 'warning', 'Nyitott ügy következő lépés nélkül',
           jsonb_build_object('lead_id', l.id, 'status', l.status, 'assigned_to', l.assigned_to, 'created_at', l.created_at), 'leads', l.id
      FROM public.leads l WHERE l.status IN ('new','follow_up','quote_prep') AND l.next_step_due_at IS NULL AND l.created_at < v_to - interval '24 hours'
    UNION ALL
    SELECT 'sales_unassigned:' || l.id, 'state', 'sales', 'timothy', 'warning', 'Nyitott ügy felelős nélkül (csak Tulajdonos látja)',
           jsonb_build_object('lead_id', l.id, 'status', l.status), 'leads', l.id
      FROM public.leads l WHERE l.status IN ('new','follow_up','quote_prep') AND l.assigned_to IS NULL
    UNION ALL
    SELECT 'quote_sent_unproven:' || q.id, 'state', 'sales', 'timothy', 'critical', 'Kiküldöttnek jelölt ajánlat küldési bizonyíték nélkül',
           jsonb_build_object('quote_id', q.id, 'lead_id', q.lead_id, 'project_id', q.project_id), 'quotes', q.id
      FROM public.quotes q WHERE q.status = 'sent' AND NOT EXISTS (SELECT 1 FROM public.quote_sends s WHERE s.quote_id = q.id AND s.status = 'sent')
    UNION ALL
    -- MARKETING (Scarlet) — személyes adat nélkül
    SELECT 'web_request_waiting:' || r.id, 'state', 'marketing', 'scarlet',
           CASE WHEN coalesce(r.source_created_at, r.created_at) > v_to - interval '14 days' THEN 'warning' ELSE 'info' END,
           'Feldolgozatlan webes ajánlatkérés (24 óránál régebbi)',
           jsonb_build_object('quote_request_id', r.id, 'form_type', r.form_type, 'received_at', coalesce(r.source_created_at, r.created_at)), NULL, NULL::uuid
      FROM public.quote_requests r WHERE r.intake_at IS NULL AND coalesce(r.source_created_at, r.created_at) < v_to - interval '24 hours'
    UNION ALL
    SELECT 'campaign_delivery_failed:' || d.campaign_id || ':' || v_day, 'event', 'marketing', 'scarlet', 'warning', 'Sikertelen kampányküldési tételek',
           jsonb_build_object('campaign_id', d.campaign_id, 'failed_in_window', count(*)), NULL, NULL::uuid
      FROM public.campaign_delivery_items d WHERE d.state IN ('failed','error') AND d.updated_at >= v_from GROUP BY d.campaign_id
    UNION ALL
    -- PROJEKTEK (Boss)
    SELECT 'project_overdue:' || p.id || ':' || p.deadline, 'state', 'projects', 'boss', 'warning', 'Határidőn túli aktív projekt',
           jsonb_build_object('project_id', p.id, 'status', p.status, 'deadline', p.deadline), 'projects', p.id
      FROM public.projects p WHERE p.status NOT IN ('lezart','felfuggesztve') AND p.deadline < (v_to AT TIME ZONE 'Europe/Budapest')::date
    UNION ALL
    SELECT 'project_no_pm:' || p.id, 'state', 'projects', 'boss', 'warning', 'Aktív projekt projektvezető nélkül',
           jsonb_build_object('project_id', p.id, 'status', p.status), 'projects', p.id
      FROM public.projects p WHERE p.status NOT IN ('lezart','felfuggesztve') AND p.project_manager_user_id IS NULL
    UNION ALL
    SELECT 'task_overdue:' || t.id || ':' || to_char(t.due_date AT TIME ZONE 'Europe/Budapest', 'YYYY-MM-DD'), 'state', 'projects', 'boss', 'warning', 'Lejárt, nyitott projektfeladat',
           jsonb_build_object('task_id', t.id, 'project_id', t.project_id, 'status', t.status, 'due_date', t.due_date), 'projects', t.project_id
      FROM public.tasks t WHERE coalesce(t.status, '') <> 'done' AND t.due_date < v_to
    UNION ALL
    -- DOKUMENTUMOK (George): hiba = vizsgálandó; OCR-korlát = ismert, csak nyilvántartott
    SELECT 'document_error:' || kd.id, 'state', 'documents', 'george', 'warning', 'Dokumentumfeldolgozási hiba',
           jsonb_build_object('document_id', kd.id, 'source_table', kd.source_table, 'error_code', kd.error_code), 'knowledge_documents', kd.id
      FROM public.knowledge_documents kd WHERE kd.superseded_at IS NULL AND kd.processing_status = 'error'
    UNION ALL
    SELECT 'document_needs_review:' || kd.id, 'state', 'documents', 'george', 'info', 'Dokumentum ellenőrzést igényel (pl. szkennelt PDF)',
           jsonb_build_object('document_id', kd.id, 'source_table', kd.source_table, 'error_code', kd.error_code), 'knowledge_documents', kd.id
      FROM public.knowledge_documents kd WHERE kd.superseded_at IS NULL AND kd.processing_status = 'needs_review'
    UNION ALL
    -- FELHASZNÁLÓI BEJELENTÉSEK (George)
    SELECT 'issue_unreviewed:' || i.id, 'state', 'feedback', 'george', 'warning', 'Bejelentés automatikus vizsgálat nélkül',
           jsonb_build_object('issue_id', i.id, 'category', i.category, 'page_path', i.page_path), 'issue_reports', i.id
      FROM public.issue_reports i WHERE i.status = 'new' AND i.ai_analyzed_at IS NULL AND i.created_at < v_to - interval '15 minutes' AND coalesce(i.technical_code, '') <> 'AI_REVIEW'
    UNION ALL
    SELECT 'issue_reopened:' || i.id || ':' || to_char(i.reporter_verdict_at, 'YYYYMMDDHH24MISS'), 'state', 'feedback', 'george', 'warning', 'A bejelentő szerint a javítás nem oldotta meg a problémát',
           jsonb_build_object('issue_id', i.id, 'category', i.category, 'page_path', i.page_path), 'issue_reports', i.id
      FROM public.issue_reports i WHERE i.reporter_verdict = 'not_resolved' AND i.status <> 'closed' AND i.reporter_verdict_at IS NOT NULL AND (i.ai_analyzed_at IS NULL OR i.ai_analyzed_at < i.reporter_verdict_at)
    UNION ALL
    SELECT 'issue_recheck_waiting:' || i.id, 'state', 'feedback', 'george', 'info', 'Utóellenőrzésre váró bejelentés (48 óránál régebben)',
           jsonb_build_object('issue_id', i.id, 'page_path', i.page_path), 'issue_reports', i.id
      FROM public.issue_reports i WHERE i.status = 'checking' AND i.reporter_verdict IS NULL AND i.updated_at < v_to - interval '48 hours'
    UNION ALL
    -- RENDSZER (George): ablakon belüli események, napi összevonással
    SELECT 'ai_credit:' || v_day, 'event', 'system', 'george', 'critical', 'AI-szolgáltatás kredit- vagy rate-limit hibája',
           jsonb_build_object('errors_in_window', count(*)), NULL, NULL::uuid
      FROM public.agent_runs a WHERE a.status = 'error' AND coalesce(a.finished_at, a.started_at) >= v_from
       AND a.error_message ~* '(429|credit|insufficient_quota|rate.?limit)' HAVING count(*) > 0
    UNION ALL
    SELECT 'agent_errors:' || a.agent_id || ':' || v_day, 'event', 'system', 'george', 'warning', 'Ismétlődő AI-futási hibák',
           jsonb_build_object('agent_id', a.agent_id, 'errors_in_window', count(*)), NULL, NULL::uuid
      FROM public.agent_runs a WHERE a.status = 'error' AND coalesce(a.finished_at, a.started_at) >= v_from
       AND coalesce(a.error_message, '') !~* '(429|credit|insufficient_quota|rate.?limit|stale_)' GROUP BY a.agent_id HAVING count(*) >= 3
    UNION ALL
    SELECT 'agent_stuck:' || v_day, 'event', 'system', 'george', 'warning', 'Beragadt AI-futások (30 percnél régebben futnak)',
           jsonb_build_object('stuck', count(*)), NULL, NULL::uuid
      FROM public.agent_runs a WHERE a.status = 'running' AND a.started_at < v_to - interval '30 minutes' HAVING count(*) > 0
    UNION ALL
    SELECT 'gmail_sync_errors:' || v_day, 'event', 'system', 'george', 'warning', 'Gmail-szinkron hibák',
           jsonb_build_object('runs_with_errors', count(*) FILTER (WHERE jsonb_typeof(g.errors) = 'array' AND jsonb_array_length(g.errors) > 0), 'runs_in_window', count(*)), NULL, NULL::uuid
      FROM public.gmail_sync_runs g WHERE g.started_at >= v_from
      HAVING count(*) FILTER (WHERE jsonb_typeof(g.errors) = 'array' AND jsonb_array_length(g.errors) > 0) >= 3
  LOOP
    v_total := v_total + 1;
    v_keys := v_keys || rec.k;
    INSERT INTO public.ai_review_signals AS s(signal_key, kind, domain, agent, severity, title, detail, source_table, source_id, review_status, last_run_id)
    VALUES (rec.k, rec.kind, rec.domain, rec.agent, rec.sev, rec.title, rec.detail, rec.st, rec.sid, CASE WHEN rec.sev = 'info' THEN 'not_needed' ELSE 'pending' END, v_run)
    ON CONFLICT (signal_key) DO UPDATE SET
      last_seen_at = now(),
      occurrences = s.occurrences + 1,
      detail = EXCLUDED.detail,
      last_run_id = EXCLUDED.last_run_id,
      severity = CASE WHEN EXCLUDED.severity = 'critical' OR s.severity = 'critical' THEN 'critical' WHEN EXCLUDED.severity = 'warning' OR s.severity = 'warning' THEN 'warning' ELSE 'info' END,
      review_status = CASE WHEN s.review_status = 'resolved' THEN (CASE WHEN EXCLUDED.severity = 'info' THEN 'not_needed' ELSE 'pending' END)
                           WHEN s.review_status = 'not_needed' AND EXCLUDED.severity <> 'info' THEN 'pending'
                           ELSE s.review_status END,
      resolved_at = NULL
    RETURNING (xmax = 0) INTO v_inserted;
    IF v_inserted THEN
      v_new := v_new + 1;
      IF rec.sev <> 'info' THEN v_new_review := v_new_review + 1; END IF;
      IF rec.sev = 'critical' THEN
        PERFORM public.crm_notify('ai_review:' || rec.k, 'ai', 'critical', 'Súlyos jelzés: ' || rec.title,
          'Automatikus ellenőrzés észlelte. George célzott vizsgálata a Beállítások → AI-felülvizsgálat oldalon indítható.',
          '/settings/ai-review', NULL, NULL, ARRAY['owner'], NULL, true, false);
      END IF;
    END IF;
  END LOOP;

  -- Megszűnt állapotjelzések automatikus lezárása (folyamatban lévő vizsgálatot nem érint).
  UPDATE public.ai_review_signals SET review_status = 'resolved', resolved_at = now()
   WHERE kind = 'state' AND review_status IN ('pending','not_needed','reviewed','failed') AND NOT (signal_key = ANY (v_keys));
  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  IF v_new_review > 0 THEN
    PERFORM public.crm_notify('ai_review_pending:' || v_day, 'ai', 'warning', 'Új jelzések az automatikus AI-ellenőrzésben',
      v_new_review || ' új jelzés vár George célzott vizsgálatára.', '/settings/ai-review', NULL, NULL, ARRAY['owner'], NULL, false, true);
  END IF;

  UPDATE public.ai_review_runs SET status = 'ok', finished_at = now(), window_from = v_from, window_to = v_to,
         signal_count = v_total, new_signal_count = v_new, note = 'resolved=' || v_resolved
   WHERE id = v_run;
  RETURN jsonb_build_object('status', 'ok', 'run_id', v_run, 'signals', v_total, 'new', v_new, 'new_for_review', v_new_review, 'resolved', v_resolved, 'llm_calls', 0);
END $function$;

REVOKE EXECUTE ON FUNCTION public.ai_review_collect(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_review_collect(text, uuid) TO service_role;

-- Óránkénti SQL-only ütemezés (nincs HTTP-visszahívás). Kikapcsolt konfigurációnál azonnal, munka nélkül tér vissza.
SELECT cron.schedule('ai-review-hourly', '7 * * * *', $$SELECT public.ai_review_collect('cron')$$);