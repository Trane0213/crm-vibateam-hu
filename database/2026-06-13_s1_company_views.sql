-- ============================================================
-- S1 — Backend-first refaktor, 1. lépés: read-only views
-- 2026-06-13. Additív. Nem nyúl egyetlen meglévő táblához sem.
-- Csak új VIEW objektumokat hoz létre `v_` prefixszel,
-- `security_invoker = on` → RLS a hívó user nevében dönt.
-- Idempotens: CREATE OR REPLACE + DROP VIEW IF EXISTS (csak view).
-- ============================================================

-- ------------------------------------------------------------
-- v_company_overview
-- Egy sor / company: alap mezők + kapcsolt count-ok + utolsó email.
-- A `companies.index` lista és a CRM surface map ezen fog menni.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_company_overview CASCADE;

CREATE VIEW public.v_company_overview
WITH (security_invoker = on) AS
SELECT
  c.id                                              AS company_id,
  c.name,
  c.company_type,
  c.website,
  c.domain,
  c.tax_number,
  c.city,
  c.created_at,
  c.updated_at,
  COALESCE(ct.contact_count,   0)                   AS contact_count,
  COALESCE(ld.lead_count,      0)                   AS lead_count,
  COALESCE(ld.active_lead_count, 0)                 AS active_lead_count,
  COALESCE(et.thread_count,    0)                   AS email_thread_count,
  et.last_email_at                                  AS last_email_at,
  COALESCE(pr.project_count,   0)                   AS project_count
FROM public.companies c
LEFT JOIN (
  SELECT company_id, COUNT(*)::int AS contact_count
  FROM public.contacts
  WHERE company_id IS NOT NULL
  GROUP BY company_id
) ct ON ct.company_id = c.id
LEFT JOIN (
  SELECT
    company_id,
    COUNT(*)::int                                                     AS lead_count,
    COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'closed')::int     AS active_lead_count
  FROM public.leads
  WHERE company_id IS NOT NULL
  GROUP BY company_id
) ld ON ld.company_id = c.id
LEFT JOIN (
  SELECT
    company_id,
    COUNT(*)::int           AS thread_count,
    MAX(last_message_at)    AS last_email_at
  FROM public.email_threads
  WHERE company_id IS NOT NULL
  GROUP BY company_id
) et ON et.company_id = c.id
LEFT JOIN (
  SELECT company_id, COUNT(*)::int AS project_count
  FROM public.projects
  WHERE company_id IS NOT NULL
  GROUP BY company_id
) pr ON pr.company_id = c.id;

GRANT SELECT ON public.v_company_overview TO authenticated;

-- ------------------------------------------------------------
-- v_lead_pipeline
-- Lead + cég neve + kapcsolattartó email egy sorban.
-- A /leads lista oldal és a marketing pipeline KPI használja.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_lead_pipeline CASCADE;

CREATE VIEW public.v_lead_pipeline
WITH (security_invoker = on) AS
SELECT
  l.id                AS lead_id,
  l.status,
  l.created_at,
  l.company_id,
  c.name              AS company_name,
  c.company_type      AS company_type,
  l.contact_id,
  ct.email            AS contact_email,
  ct.phone            AS contact_phone
FROM public.leads l
LEFT JOIN public.companies c ON c.id = l.company_id
LEFT JOIN public.contacts  ct ON ct.id = l.contact_id;

GRANT SELECT ON public.v_lead_pipeline TO authenticated;

-- ------------------------------------------------------------
-- v_email_thread_enriched
-- Email thread + matched cég név + matched kapcsolattartó email.
-- A /emails lista és a thread → company összerendelés UI használja.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_email_thread_enriched CASCADE;

CREATE VIEW public.v_email_thread_enriched
WITH (security_invoker = on) AS
SELECT
  t.id                  AS thread_id,
  t.last_message_at,
  t.company_id,
  c.name                AS company_name,
  t.contact_id,
  ct.email              AS contact_email,
  t.participants
FROM public.email_threads t
LEFT JOIN public.companies c ON c.id = t.company_id
LEFT JOIN public.contacts  ct ON ct.id = t.contact_id;

GRANT SELECT ON public.v_email_thread_enriched TO authenticated;

-- ============================================================
-- VÉGE. Semmilyen tábla nem módosult, semmilyen adat nem törölt.
-- Visszavonás (ha kell):
--   DROP VIEW IF EXISTS public.v_company_overview;
--   DROP VIEW IF EXISTS public.v_lead_pipeline;
--   DROP VIEW IF EXISTS public.v_email_thread_enriched;
-- ============================================================