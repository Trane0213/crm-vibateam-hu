-- ============================================================
-- VIBA CRM — Sprint 2 / Fázis 1
-- Customer-központú olvasási réteg: customer_activity_v + customer_kpi_v
-- 2026-06-16. Idempotens, additív, séma-bontás nélkül.
-- Customer = companies (logikai absztrakció, fizikailag NEM új tábla).
-- ============================================================

-- ------------------------------------------------------------
-- 1) customer_activity_v
-- Egységes eseménymodell minden CRM forrásból, ugyanazzal
-- a sémával, hogy Timeline / Dashboard / AI / Global Search
-- ugyanabból a view-ból olvashasson.
--
-- Oszlopok:
--   customer_id     uuid    -- = companies.id
--   event_type      text    -- 'project_created' | 'lead' | 'quote'
--                            -- | 'followup' | 'call' | 'meeting'
--                            -- | 'email' | 'note' | 'document'
--   event_date      timestamptz
--   title           text    -- rövid emberi cím
--   reference_type  text    -- forrás tábla neve
--   reference_id    uuid    -- forrás rekord id
--   created_by      uuid    -- ha ismert, különben NULL
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.customer_activity_v CASCADE;

CREATE VIEW public.customer_activity_v
WITH (security_invoker = on) AS
  -- Projekt létrehozás
  SELECT
    p.company_id              AS customer_id,
    'project_created'::text   AS event_type,
    p.created_at              AS event_date,
    COALESCE(p.title, '(névtelen projekt)') AS title,
    'projects'::text          AS reference_type,
    p.id                      AS reference_id,
    NULL::uuid                AS created_by
  FROM public.projects p
  WHERE p.company_id IS NOT NULL

  UNION ALL
  -- Lead
  SELECT
    l.company_id, 'lead', l.created_at,
    COALESCE(l.summary, 'Új lead'),
    'leads', l.id, NULL::uuid
  FROM public.leads l
  WHERE l.company_id IS NOT NULL

  UNION ALL
  -- Ajánlat (projecten keresztül)
  SELECT
    p.company_id, 'quote', q.created_at,
    CONCAT('Ajánlat v', COALESCE(q.version::text, '?'),
           CASE WHEN q.status IS NOT NULL THEN ' · ' || q.status ELSE '' END),
    'quotes', q.id, NULL::uuid
  FROM public.quotes q
  JOIN public.projects p ON p.id = q.project_id
  WHERE p.company_id IS NOT NULL

  UNION ALL
  -- Follow-up (esedékesség)
  SELECT
    p.company_id, 'followup', COALESCE(f.due_date, f.created_at),
    COALESCE(f.followup_type, 'Follow-up'),
    'followups', f.id, NULL::uuid
  FROM public.followups f
  JOIN public.projects p ON p.id = f.project_id
  WHERE p.company_id IS NOT NULL

  UNION ALL
  -- Telefonhívás
  SELECT
    c.company_id, 'call', c.created_at,
    COALESCE(c.summary, 'Telefonhívás'),
    'phone_calls', c.id, NULL::uuid
  FROM public.phone_calls c
  WHERE c.company_id IS NOT NULL

  UNION ALL
  -- Találkozó
  SELECT
    m.company_id, 'meeting', COALESCE(m.meeting_date, m.created_at),
    COALESCE(m.title, 'Találkozó'),
    'meetings', m.id, NULL::uuid
  FROM public.meetings m
  WHERE m.company_id IS NOT NULL

  UNION ALL
  -- Email szál
  SELECT
    t.company_id, 'email', COALESCE(t.last_message_at, t.created_at),
    COALESCE(t.subject, '(nincs tárgy)'),
    'email_threads', t.id, NULL::uuid
  FROM public.email_threads t
  WHERE t.company_id IS NOT NULL

  UNION ALL
  -- Projekt jegyzet
  SELECT
    p.company_id, 'note', n.created_at,
    LEFT(COALESCE(n.note, 'Jegyzet'), 80),
    'project_notes', n.id, NULL::uuid
  FROM public.project_notes n
  JOIN public.projects p ON p.id = n.project_id
  WHERE p.company_id IS NOT NULL

  UNION ALL
  -- Projekt dokumentum
  SELECT
    p.company_id, 'document', d.created_at,
    COALESCE(d.name, 'Dokumentum'),
    'project_documents', d.id, NULL::uuid
  FROM public.project_documents d
  JOIN public.projects p ON p.id = d.project_id
  WHERE p.company_id IS NOT NULL;

GRANT SELECT ON public.customer_activity_v TO authenticated;
GRANT SELECT ON public.customer_activity_v TO service_role;


-- ------------------------------------------------------------
-- 2) customer_kpi_v
-- Per-customer aggregált KPI-k. Egyetlen forrás a Customer
-- listához, Detail Summary panelhez, Dashboardhoz.
--
-- Oszlopok:
--   customer_id        uuid
--   total_projects     int
--   active_projects    int
--   open_quotes        int
--   overdue_followups  int
--   last_activity_at   timestamptz
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.customer_kpi_v CASCADE;

CREATE VIEW public.customer_kpi_v
WITH (security_invoker = on) AS
WITH proj AS (
  SELECT
    p.company_id,
    COUNT(*)::int                                                AS total_projects,
    COUNT(*) FILTER (
      WHERE p.status IN (
        'uj_megkereses','felmeres','ajanlat_keszul','ajanlat_kikuldve',
        'utankovetes','kivitelezes'
      )
    )::int                                                        AS active_projects,
    ARRAY_AGG(p.id)                                              AS project_ids
  FROM public.projects p
  WHERE p.company_id IS NOT NULL
  GROUP BY p.company_id
),
quo AS (
  SELECT p.company_id, COUNT(*)::int AS open_quotes
  FROM public.quotes q
  JOIN public.projects p ON p.id = q.project_id
  WHERE p.company_id IS NOT NULL
    AND q.status IN ('draft','sent','negotiation')
  GROUP BY p.company_id
),
fup AS (
  SELECT p.company_id, COUNT(*)::int AS overdue_followups
  FROM public.followups f
  JOIN public.projects p ON p.id = f.project_id
  WHERE p.company_id IS NOT NULL
    AND COALESCE(f.completed, false) = false
    AND f.due_date IS NOT NULL
    AND f.due_date < now()
  GROUP BY p.company_id
),
act AS (
  SELECT customer_id, MAX(event_date) AS last_activity_at
  FROM public.customer_activity_v
  GROUP BY customer_id
)
SELECT
  c.id                                          AS customer_id,
  COALESCE(proj.total_projects, 0)              AS total_projects,
  COALESCE(proj.active_projects, 0)             AS active_projects,
  COALESCE(quo.open_quotes, 0)                  AS open_quotes,
  COALESCE(fup.overdue_followups, 0)            AS overdue_followups,
  act.last_activity_at                          AS last_activity_at
FROM public.companies c
LEFT JOIN proj ON proj.company_id = c.id
LEFT JOIN quo  ON quo.company_id  = c.id
LEFT JOIN fup  ON fup.company_id  = c.id
LEFT JOIN act  ON act.customer_id = c.id;

GRANT SELECT ON public.customer_kpi_v TO authenticated;
GRANT SELECT ON public.customer_kpi_v TO service_role;


-- ------------------------------------------------------------
-- 3) Támogató indexek (idempotens)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_projects_company_id      ON public.projects(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_company_id         ON public.leads(company_id);
CREATE INDEX IF NOT EXISTS idx_phone_calls_company_id   ON public.phone_calls(company_id);
CREATE INDEX IF NOT EXISTS idx_meetings_company_id      ON public.meetings(company_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_company_id ON public.email_threads(company_id);
CREATE INDEX IF NOT EXISTS idx_quotes_project_id        ON public.quotes(project_id);
CREATE INDEX IF NOT EXISTS idx_followups_project_id     ON public.followups(project_id);
CREATE INDEX IF NOT EXISTS idx_followups_due_date       ON public.followups(due_date);
