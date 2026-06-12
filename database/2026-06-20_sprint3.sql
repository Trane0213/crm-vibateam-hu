-- ============================================================================
-- VIBA CRM — Sprint 3
-- Customer 360 + Activity Timeline + Executive Dashboard + Route Permissions
-- 2026-06-20. Idempotens, additív. Meglévő táblákat NEM módosít, csak olvas.
-- A valós séma (information_schema export 2026-06-20) alapján.
-- ============================================================================

-- ============================================================================
-- 1) dashboard_status_config — konfigurálható status mapping
-- Nem feltételezünk semmilyen status értéket. Üresen szállítjuk.
-- Frontend tölti fel (Settings → Dashboard) az alábbi `kind` értékekkel:
--   'quote_won'        → quotes.status értékek, amelyek elfogadottnak számítanak
--   'project_active'   → projects.status értékek, amelyek aktívnak számítanak
--   'project_closed'   → projects.status értékek, amelyek lezártnak számítanak
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dashboard_status_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('quote_won','project_active','project_closed')),
  status_value text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (kind, status_value)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_status_config TO authenticated;
GRANT ALL ON public.dashboard_status_config TO service_role;
ALTER TABLE public.dashboard_status_config ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2) route_permissions — szerkeszthető route × role engedélyek (A opció)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.route_permissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name     text NOT NULL,
  route_prefix  text NOT NULL,
  allowed       boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (role_name, route_prefix)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_permissions TO authenticated;
GRANT ALL ON public.route_permissions TO service_role;
ALTER TABLE public.route_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3) is_owner_role helper — RLS policy-khez
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_owner_role(_auth_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users_profile up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.auth_user_id = _auth_user
      AND lower(r.name) IN ('owner','tulajdonos','admin','superadmin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_owner_role(uuid) TO authenticated, service_role;

-- ============================================================================
-- 4) Policies
-- ============================================================================
DROP POLICY IF EXISTS "route_permissions_select_all"  ON public.route_permissions;
CREATE POLICY "route_permissions_select_all"
  ON public.route_permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "route_permissions_write_owner" ON public.route_permissions;
CREATE POLICY "route_permissions_write_owner"
  ON public.route_permissions FOR ALL TO authenticated
  USING (public.is_owner_role(auth.uid()))
  WITH CHECK (public.is_owner_role(auth.uid()));

DROP POLICY IF EXISTS "dashboard_status_config_select_all"  ON public.dashboard_status_config;
CREATE POLICY "dashboard_status_config_select_all"
  ON public.dashboard_status_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "dashboard_status_config_write_owner" ON public.dashboard_status_config;
CREATE POLICY "dashboard_status_config_write_owner"
  ON public.dashboard_status_config FOR ALL TO authenticated
  USING (public.is_owner_role(auth.uid()))
  WITH CHECK (public.is_owner_role(auth.uid()));

-- ============================================================================
-- 5) has_route_access(_auth_user uuid, _path text)
-- Visszaadja: true/false/NULL. NULL = nincs DB szabály → frontend fallback.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_route_access(_auth_user uuid, _path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_name AS (
    SELECT lower(r.name) AS name
    FROM public.users_profile up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.auth_user_id = _auth_user
    LIMIT 1
  ),
  match AS (
    SELECT rp.allowed
    FROM public.route_permissions rp, role_name rn
    WHERE rp.role_name = rn.name
      AND (_path = rp.route_prefix OR _path LIKE rp.route_prefix || '/%')
    ORDER BY length(rp.route_prefix) DESC
    LIMIT 1
  )
  SELECT allowed FROM match;
$$;

GRANT EXECUTE ON FUNCTION public.has_route_access(uuid, text) TO authenticated, service_role;

-- ============================================================================
-- 6) dashboard_pipeline_v — projektek státusz szerint + utolsó ajánlat értéke
-- Nem szűr status szerint, MINDEN előforduló status csoportban szerepel.
-- ============================================================================
DROP VIEW IF EXISTS public.dashboard_pipeline_v CASCADE;
CREATE VIEW public.dashboard_pipeline_v
WITH (security_invoker = on) AS
WITH last_quote AS (
  SELECT DISTINCT ON (q.project_id)
    q.project_id, q.total_amount
  FROM public.quotes q
  ORDER BY q.project_id, q.version DESC NULLS LAST, q.created_at DESC
)
SELECT
  COALESCE(p.status, '(nincs)')              AS status,
  COUNT(*)::int                              AS project_count,
  COALESCE(SUM(lq.total_amount), 0)::numeric AS total_value
FROM public.projects p
LEFT JOIN last_quote lq ON lq.project_id = p.id
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.dashboard_pipeline_v TO authenticated, service_role;

-- ============================================================================
-- 7) dashboard_revenue_monthly_v — utolsó 12 hónap, "won" status konfigból
-- Ha a config üres, nincs sor — a frontend ezt jelzi.
-- ============================================================================
DROP VIEW IF EXISTS public.dashboard_revenue_monthly_v CASCADE;
CREATE VIEW public.dashboard_revenue_monthly_v
WITH (security_invoker = on) AS
SELECT
  date_trunc('month', q.created_at)::date    AS month,
  COUNT(*)::int                               AS quote_count,
  COALESCE(SUM(q.total_amount), 0)::numeric   AS total_amount
FROM public.quotes q
WHERE q.status IN (
        SELECT status_value FROM public.dashboard_status_config WHERE kind = 'quote_won'
      )
  AND q.created_at >= (now() - interval '12 months')
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.dashboard_revenue_monthly_v TO authenticated, service_role;

-- ============================================================================
-- 8) dashboard_user_workload_v — CSAK tasks alapú humán workload
-- tasks.assigned_user → users_profile.id (a valós FK szerint).
-- ============================================================================
DROP VIEW IF EXISTS public.dashboard_user_workload_v CASCADE;
CREATE VIEW public.dashboard_user_workload_v
WITH (security_invoker = on) AS
WITH t AS (
  SELECT
    assigned_user                                                       AS profile_id,
    COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'done')::int         AS open_tasks,
    COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'done'
                     AND due_date < now())::int                          AS overdue_tasks,
    COUNT(*) FILTER (WHERE status = 'done')::int                         AS done_tasks
  FROM public.tasks
  WHERE assigned_user IS NOT NULL
  GROUP BY assigned_user
)
SELECT
  up.id                                    AS user_id,
  up.auth_user_id                          AS auth_user_id,
  COALESCE(up.full_name, up.email, '—')    AS user_name,
  up.email                                 AS email,
  COALESCE(t.open_tasks, 0)                AS open_tasks,
  COALESCE(t.overdue_tasks, 0)             AS overdue_tasks,
  COALESCE(t.done_tasks, 0)                AS done_tasks
FROM public.users_profile up
LEFT JOIN t ON t.profile_id = up.id
WHERE COALESCE(up.active, true) = true;

GRANT SELECT ON public.dashboard_user_workload_v TO authenticated, service_role;

-- ============================================================================
-- 9) dashboard_followup_heatmap_v — nap × típus
-- ============================================================================
DROP VIEW IF EXISTS public.dashboard_followup_heatmap_v CASCADE;
CREATE VIEW public.dashboard_followup_heatmap_v
WITH (security_invoker = on) AS
SELECT
  date_trunc('day', COALESCE(f.due_date, f.created_at))::date AS day,
  COALESCE(f.followup_type, '(nincs)')                         AS followup_type,
  COUNT(*) FILTER (WHERE COALESCE(f.completed, false) = false)::int AS open_count,
  COUNT(*) FILTER (WHERE COALESCE(f.completed, false) = true )::int AS done_count
FROM public.followups f
WHERE COALESCE(f.due_date, f.created_at) >= (now() - interval '90 days')
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

GRANT SELECT ON public.dashboard_followup_heatmap_v TO authenticated, service_role;

-- ============================================================================
-- 10) activity_timeline_v — globális idővonal, user normalizálva users_profile-ra
-- Forrás user mezők → users_profile.id leképezés:
--   tasks.assigned_user                  → közvetlen users_profile.id (FK)
--   quotes.created_by                    → közvetlen users_profile.id (FK)
--   project_notes.author_id              → közvetlen users_profile.id (FK)
--   project_documents.uploaded_by        → közvetlen users_profile.id (FK)
--   emails.owner_user_id  (auth.users.id)→ users_profile.auth_user_id JOIN
-- Ahol nincs humán FK (followups, meetings, phone_calls, leads, projects): NULL.
-- ============================================================================
DROP VIEW IF EXISTS public.activity_timeline_v CASCADE;
CREATE VIEW public.activity_timeline_v
WITH (security_invoker = on) AS
  SELECT
    'project_created'::text                  AS event_type,
    p.created_at                              AS event_date,
    COALESCE(p.title, '(névtelen projekt)')   AS title,
    'projects'::text                          AS reference_type,
    p.id                                      AS reference_id,
    p.company_id                              AS customer_id,
    NULL::uuid                                AS user_id
  FROM public.projects p

  UNION ALL
  SELECT 'lead', l.created_at, COALESCE(l.summary, 'Új lead'),
         'leads', l.id, l.company_id, NULL::uuid
  FROM public.leads l

  UNION ALL
  SELECT 'quote', q.created_at,
         CONCAT('Ajánlat v', COALESCE(q.version::text, '?'),
                CASE WHEN q.status IS NOT NULL THEN ' · ' || q.status ELSE '' END),
         'quotes', q.id, p.company_id, q.created_by
  FROM public.quotes q
  LEFT JOIN public.projects p ON p.id = q.project_id

  UNION ALL
  SELECT 'followup', COALESCE(f.due_date, f.created_at),
         COALESCE(f.followup_type, 'Follow-up'),
         'followups', f.id, f.company_id, NULL::uuid
  FROM public.followups f

  UNION ALL
  SELECT 'task', COALESCE(t.due_date, t.created_at),
         COALESCE(t.title, 'Feladat'),
         'tasks', t.id, p.company_id, t.assigned_user
  FROM public.tasks t
  LEFT JOIN public.projects p ON p.id = t.project_id

  UNION ALL
  SELECT 'call', c.created_at, COALESCE(c.summary, 'Telefonhívás'),
         'phone_calls', c.id, c.company_id, NULL::uuid
  FROM public.phone_calls c

  UNION ALL
  SELECT 'meeting', COALESCE(m.meeting_date, m.created_at),
         COALESCE(m.title, 'Találkozó'),
         'meetings', m.id, m.company_id, NULL::uuid
  FROM public.meetings m

  UNION ALL
  SELECT 'email',
         COALESCE(e.internal_date, e.created_at),
         COALESCE(e.subject, e.snippet, '(nincs tárgy)'),
         'emails', e.id, e.company_id, up.id
  FROM public.emails e
  LEFT JOIN public.users_profile up ON up.auth_user_id = e.owner_user_id

  UNION ALL
  SELECT 'note', n.created_at,
         LEFT(COALESCE(n.note, 'Jegyzet'), 80),
         'project_notes', n.id, p.company_id, n.author_id
  FROM public.project_notes n
  LEFT JOIN public.projects p ON p.id = n.project_id

  UNION ALL
  SELECT 'document', d.created_at, COALESCE(d.name, 'Dokumentum'),
         'project_documents', d.id, p.company_id, d.uploaded_by
  FROM public.project_documents d
  LEFT JOIN public.projects p ON p.id = d.project_id;

GRANT SELECT ON public.activity_timeline_v TO authenticated, service_role;

-- ============================================================================
-- 11) customer_360_v — customer header denormalizálva
-- won_revenue: dashboard_status_config('quote_won') konfigból, üres = 0.
-- active_projects: dashboard_status_config('project_active'), üres = 0.
-- companies.address NEM létezik → nem hivatkozunk rá.
-- ============================================================================
DROP VIEW IF EXISTS public.customer_360_v CASCADE;
CREATE VIEW public.customer_360_v
WITH (security_invoker = on) AS
WITH main_contact AS (
  SELECT DISTINCT ON (c.company_id)
    c.company_id,
    c.name  AS contact_name,
    c.email AS contact_email,
    c.phone AS contact_phone
  FROM public.contacts c
  WHERE c.company_id IS NOT NULL
  ORDER BY c.company_id, c.created_at ASC NULLS LAST
),
won_rev AS (
  SELECT p.company_id,
         COALESCE(SUM(q.total_amount), 0)::numeric AS won_revenue
  FROM public.projects p
  JOIN public.quotes   q ON q.project_id = p.id
  WHERE p.company_id IS NOT NULL
    AND q.status IN (SELECT status_value FROM public.dashboard_status_config WHERE kind = 'quote_won')
  GROUP BY p.company_id
),
proj_counts AS (
  SELECT
    p.company_id,
    COUNT(*)::int AS total_projects,
    COUNT(*) FILTER (
      WHERE p.status IN (SELECT status_value FROM public.dashboard_status_config WHERE kind = 'project_active')
    )::int AS active_projects
  FROM public.projects p
  WHERE p.company_id IS NOT NULL
  GROUP BY p.company_id
)
SELECT
  c.id                                       AS customer_id,
  c.name                                     AS name,
  c.company_type                             AS company_type,
  c.tax_number,
  c.website,
  c.notes,
  c.created_at,
  mc.contact_name,
  mc.contact_email,
  mc.contact_phone,
  COALESCE(pc.total_projects, 0)             AS total_projects,
  COALESCE(pc.active_projects, 0)            AS active_projects,
  COALESCE(k.open_quotes, 0)                 AS open_quotes,
  COALESCE(k.overdue_followups, 0)           AS overdue_followups,
  k.last_activity_at                          AS last_activity_at,
  COALESCE(wr.won_revenue, 0)                AS won_revenue
FROM public.companies c
LEFT JOIN public.customer_kpi_v k  ON k.customer_id = c.id
LEFT JOIN main_contact mc          ON mc.company_id = c.id
LEFT JOIN won_rev wr                ON wr.company_id = c.id
LEFT JOIN proj_counts pc            ON pc.company_id = c.id;

GRANT SELECT ON public.customer_360_v TO authenticated, service_role;

-- ============================================================================
-- 12) Indexek
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user      ON public.tasks(assigned_user);
CREATE INDEX IF NOT EXISTS idx_tasks_project            ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status             ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_followups_project_due    ON public.followups(project_id, due_date);
CREATE INDEX IF NOT EXISTS idx_followups_due            ON public.followups(due_date);
CREATE INDEX IF NOT EXISTS idx_quotes_status_created    ON public.quotes(status, created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_project_version   ON public.quotes(project_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_route_perm_role_route    ON public.route_permissions(role_name, route_prefix);
CREATE INDEX IF NOT EXISTS idx_dashboard_status_cfg_kind ON public.dashboard_status_config(kind);

-- ============================================================================
-- VÉGE — Sprint 3 séma kész.
-- A frontend a dashboard_status_config-ot tölti fel a Settings → Dashboard
-- felületen. Amíg üres: won_revenue=0, active_projects=0, revenue chart üres.
-- ============================================================================
