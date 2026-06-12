-- ============================================================================
-- VIBA CRM — Sprint 3 / Customer 360 + Dashboard + Activity + Permissions
-- 2026-06-20. Idempotens, additív. Csak ÚJ view-k, ÚJ tábla, ÚJ function.
-- Meglévő táblákat NEM módosít, csak olvas.
-- ============================================================================

-- ============================================================================
-- 1) dashboard_pipeline_v
-- Projekt státusz pipeline összesítés.
-- Mezők: status, project_count, total_value (utolsó ajánlat alapján projektenként).
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
  COALESCE(p.status, 'uj_megkereses')   AS status,
  COUNT(*)::int                          AS project_count,
  COALESCE(SUM(lq.total_amount), 0)::numeric AS total_value
FROM public.projects p
LEFT JOIN last_quote lq ON lq.project_id = p.id
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.dashboard_pipeline_v TO authenticated;
GRANT SELECT ON public.dashboard_pipeline_v TO service_role;

-- ============================================================================
-- 2) dashboard_revenue_monthly_v
-- Hónaponkénti elfogadott (won) ajánlat összérték — utolsó 12 hónap.
-- ============================================================================
DROP VIEW IF EXISTS public.dashboard_revenue_monthly_v CASCADE;
CREATE VIEW public.dashboard_revenue_monthly_v
WITH (security_invoker = on) AS
SELECT
  date_trunc('month', q.created_at)::date AS month,
  COUNT(*)::int                            AS quote_count,
  COALESCE(SUM(q.total_amount), 0)::numeric AS total_amount
FROM public.quotes q
WHERE q.status = 'won'
  AND q.created_at >= (now() - interval '12 months')
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.dashboard_revenue_monthly_v TO authenticated;
GRANT SELECT ON public.dashboard_revenue_monthly_v TO service_role;

-- ============================================================================
-- 3) dashboard_user_workload_v
-- Felelős → nyitott taskok / followupok / aktív projektek.
-- FONTOS: tasks.assigned_user → auth.users.id, ezért users_profile-ra
-- auth_user_id-n keresztül joinolunk.
-- ============================================================================
DROP VIEW IF EXISTS public.dashboard_user_workload_v CASCADE;
CREATE VIEW public.dashboard_user_workload_v
WITH (security_invoker = on) AS
WITH t AS (
  SELECT assigned_user AS auth_user_id, COUNT(*)::int AS open_tasks
  FROM public.tasks
  WHERE status IS DISTINCT FROM 'done' AND assigned_user IS NOT NULL
  GROUP BY assigned_user
),
f AS (
  SELECT assigned_to AS auth_user_id, COUNT(*)::int AS open_followups
  FROM public.followups
  WHERE COALESCE(completed, false) = false AND assigned_to IS NOT NULL
  GROUP BY assigned_to
),
p AS (
  SELECT assigned_user AS auth_user_id, COUNT(*)::int AS active_projects
  FROM public.projects
  WHERE status IN ('uj_megkereses','felmeres','ajanlat_keszul','ajanlat_kikuldve','utankovetes','kivitelezes')
    AND assigned_user IS NOT NULL
  GROUP BY assigned_user
)
SELECT
  up.id                                    AS user_id,
  up.auth_user_id                          AS auth_user_id,
  COALESCE(up.full_name, up.email, '—')    AS user_name,
  up.email                                 AS email,
  COALESCE(t.open_tasks, 0)                AS open_tasks,
  COALESCE(f.open_followups, 0)            AS open_followups,
  COALESCE(p.active_projects, 0)           AS active_projects
FROM public.users_profile up
LEFT JOIN t ON t.auth_user_id = up.auth_user_id
LEFT JOIN f ON f.auth_user_id = up.auth_user_id
LEFT JOIN p ON p.auth_user_id = up.auth_user_id
WHERE COALESCE(up.active, true) = true;

GRANT SELECT ON public.dashboard_user_workload_v TO authenticated;
GRANT SELECT ON public.dashboard_user_workload_v TO service_role;

-- ============================================================================
-- 4) activity_timeline_v
-- Globális idővonal minden CRM modulból. Ugyanazok az események mint
-- customer_activity_v, de customer szűkítés nélkül, és user_id-vel annotálva
-- (amennyiben a forrás táblában elérhető).
-- Oszlopok:
--   event_type, event_date, title, reference_type, reference_id,
--   customer_id (lehet NULL), user_id (lehet NULL)
-- ============================================================================
DROP VIEW IF EXISTS public.activity_timeline_v CASCADE;
CREATE VIEW public.activity_timeline_v
WITH (security_invoker = on) AS
  SELECT
    'project_created'::text AS event_type,
    p.created_at            AS event_date,
    COALESCE(p.title, '(névtelen projekt)') AS title,
    'projects'::text        AS reference_type,
    p.id                    AS reference_id,
    p.company_id            AS customer_id,
    p.assigned_user         AS user_id
  FROM public.projects p

  UNION ALL
  SELECT 'lead', l.created_at, COALESCE(l.summary, 'Új lead'),
         'leads', l.id, l.company_id, NULL::uuid
  FROM public.leads l

  UNION ALL
  SELECT 'quote', q.created_at,
         CONCAT('Ajánlat v', COALESCE(q.version::text, '?'),
                CASE WHEN q.status IS NOT NULL THEN ' · ' || q.status ELSE '' END),
         'quotes', q.id, p.company_id, NULL::uuid
  FROM public.quotes q
  JOIN public.projects p ON p.id = q.project_id

  UNION ALL
  SELECT 'followup', COALESCE(f.due_date, f.created_at),
         COALESCE(f.followup_type, 'Follow-up'),
         'followups', f.id, p.company_id, f.assigned_to
  FROM public.followups f
  LEFT JOIN public.projects p ON p.id = f.project_id

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
  SELECT 'email', COALESCE(t.last_message_at, t.created_at),
         COALESCE(t.subject, '(nincs tárgy)'),
         'email_threads', t.id, t.company_id, NULL::uuid
  FROM public.email_threads t

  UNION ALL
  SELECT 'note', n.created_at,
         LEFT(COALESCE(n.note, 'Jegyzet'), 80),
         'project_notes', n.id, p.company_id, NULL::uuid
  FROM public.project_notes n
  LEFT JOIN public.projects p ON p.id = n.project_id

  UNION ALL
  SELECT 'document', d.created_at, COALESCE(d.name, 'Dokumentum'),
         'project_documents', d.id, p.company_id, NULL::uuid
  FROM public.project_documents d
  LEFT JOIN public.projects p ON p.id = d.project_id;

GRANT SELECT ON public.activity_timeline_v TO authenticated;
GRANT SELECT ON public.activity_timeline_v TO service_role;

-- ============================================================================
-- 5) customer_360_v
-- Customer fejléchez denormalizált sor (cégadat + KPI + main contact).
-- ============================================================================
DROP VIEW IF EXISTS public.customer_360_v CASCADE;
CREATE VIEW public.customer_360_v
WITH (security_invoker = on) AS
WITH main_contact AS (
  SELECT DISTINCT ON (c.company_id)
    c.company_id, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone
  FROM public.contacts c
  WHERE c.company_id IS NOT NULL
  ORDER BY c.company_id, c.created_at ASC
),
rev AS (
  SELECT p.company_id, COALESCE(SUM(q.total_amount), 0)::numeric AS won_revenue
  FROM public.projects p
  JOIN public.quotes q ON q.project_id = p.id
  WHERE q.status = 'won' AND p.company_id IS NOT NULL
  GROUP BY p.company_id
)
SELECT
  c.id                                       AS customer_id,
  c.name                                     AS name,
  c.company_type                             AS company_type,
  c.tax_number, c.address, c.website, c.notes,
  c.created_at,
  mc.contact_name, mc.contact_email, mc.contact_phone,
  COALESCE(k.total_projects, 0)              AS total_projects,
  COALESCE(k.active_projects, 0)             AS active_projects,
  COALESCE(k.open_quotes, 0)                 AS open_quotes,
  COALESCE(k.overdue_followups, 0)           AS overdue_followups,
  k.last_activity_at                          AS last_activity_at,
  COALESCE(rev.won_revenue, 0)               AS won_revenue
FROM public.companies c
LEFT JOIN public.customer_kpi_v k ON k.customer_id = c.id
LEFT JOIN main_contact mc          ON mc.company_id = c.id
LEFT JOIN rev                       ON rev.company_id = c.id;

GRANT SELECT ON public.customer_360_v TO authenticated;
GRANT SELECT ON public.customer_360_v TO service_role;

-- ============================================================================
-- 6) route_permissions tábla — szerkeszthető route × role engedélyek
-- A frontend fallback-ként a kódba égetett ROUTE_ACCESS-t használja, így a
-- tábla létezése NEM kötelező a működéshez, de ha kitöltött, felülírja.
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

GRANT SELECT ON public.route_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.route_permissions TO authenticated;
GRANT ALL ON public.route_permissions TO service_role;

ALTER TABLE public.route_permissions ENABLE ROW LEVEL SECURITY;

-- Olvasás: minden authenticated user (a saját menüjét tudnia kell).
DROP POLICY IF EXISTS "route_permissions_select_all" ON public.route_permissions;
CREATE POLICY "route_permissions_select_all"
  ON public.route_permissions FOR SELECT
  TO authenticated USING (true);

-- Írás: csak owner role (users_profile.roles.name = 'owner').
DROP POLICY IF EXISTS "route_permissions_write_owner" ON public.route_permissions;
CREATE POLICY "route_permissions_write_owner"
  ON public.route_permissions FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users_profile up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.auth_user_id = auth.uid()
      AND lower(r.name) IN ('owner','tulajdonos','admin','superadmin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users_profile up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.auth_user_id = auth.uid()
      AND lower(r.name) IN ('owner','tulajdonos','admin','superadmin')
  ));

-- ============================================================================
-- 7) has_route_access(_user uuid, _path text) — SECURITY DEFINER
-- Visszaadja, hogy egy adott auth user szerepköre engedi-e az adott útvonalat.
-- Ha a route_permissions tábla NEM tartalmaz illeszkedő prefixet, NULL-t ad
-- vissza, és a frontend a kódba égetett default-ra esik vissza.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.has_route_access(_user uuid, _path text)
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
    WHERE up.auth_user_id = _user
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

GRANT EXECUTE ON FUNCTION public.has_route_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_route_access(uuid, text) TO service_role;

-- ============================================================================
-- 8) Támogató indexek
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user      ON public.tasks(assigned_user);
CREATE INDEX IF NOT EXISTS idx_followups_assigned_to    ON public.followups(assigned_to);
CREATE INDEX IF NOT EXISTS idx_projects_assigned_user   ON public.projects(assigned_user);
CREATE INDEX IF NOT EXISTS idx_quotes_status_created    ON public.quotes(status, created_at);
CREATE INDEX IF NOT EXISTS idx_route_perm_role_route    ON public.route_permissions(role_name, route_prefix);