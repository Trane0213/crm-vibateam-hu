-- =====================================================================
-- Sales modul v1 — backend specifikáció szerinti első migráció
-- Jóváhagyott terv: .lovable/plan.md (Sales modul – Végleges backend specifikáció)
--
-- Tartalmaz:
--   1) leads: új oszlopok (assigned_to, assigned_at, next_step_*, lost_*,
--      won_at, lost_at)
--   2) leads: status CHECK constraint (8 érték). source: NINCS CHECK.
--   3) Adat-backfill (qualified -> quote_prep, converted -> won, won_at,
--      lost_at, assigned_at)
--   4) lead_status_history tábla + trigger
--   5) leads_business_rules trigger (assigned_to + lost_reason kötelezőség,
--      legacy grandfathering)
--   6) quotes: lead_id, version, is_current (előkészítés a több ajánlatra)
--   7) projects: lead_id, handoff_payload, handoff_at + handoff trigger
--   8) Indexek
--   9) View-k: v_lead_activity, v_sales_user_load, v_lead_due_buckets
--  10) RLS politikák (leads, lead_status_history) + GRANT-ok
--
-- Nem tartalmaz:
--   - Frontend változást
--   - quotes / projects UI módosítást
--   - Push/email értesítés implementációt
--
-- Biztonság: minden DDL idempotens (IF NOT EXISTS / DROP ... IF EXISTS).
-- A migráció többször is lefuttatható káros mellékhatás nélkül.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Legacy cutoff timestamp — grandfathering határa.
--    A trigger ezt használja annak eldöntésére, hogy egy sor "régi"-e.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_module_meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);

INSERT INTO public.sales_module_meta(key, value)
VALUES ('legacy_cutoff_ts', now()::text)
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON public.sales_module_meta TO authenticated;
GRANT ALL    ON public.sales_module_meta TO service_role;

-- ---------------------------------------------------------------------
-- 1) leads — új oszlopok
-- ---------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at       timestamptz,
  ADD COLUMN IF NOT EXISTS next_step_type    text,
  ADD COLUMN IF NOT EXISTS next_step_due_at  timestamptz,
  ADD COLUMN IF NOT EXISTS next_step_note    text,
  ADD COLUMN IF NOT EXISTS lost_reason       text,
  ADD COLUMN IF NOT EXISTS lost_note         text,
  ADD COLUMN IF NOT EXISTS won_at            timestamptz,
  ADD COLUMN IF NOT EXISTS lost_at           timestamptz;

-- next_step_type whitelist (CHECK), source MARAD CHECK NÉLKÜL.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_next_step_type_chk;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_next_step_type_chk
  CHECK (next_step_type IS NULL OR next_step_type IN (
    'phone','email','meeting','site_visit','doc_request',
    'quote_send','follow_up','other'
  ));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lost_reason_chk;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_lost_reason_chk
  CHECK (lost_reason IS NULL OR lost_reason IN (
    'price','chose_competitor','no_response','project_cancelled',
    'deadline_issue','bad_fit','other'
  ));

-- ---------------------------------------------------------------------
-- 2) Backfill — meglévő státuszok migrálása az új enumra
--    qualified  -> quote_prep
--    converted  -> won
--    Régen meglévő won/lost sorokon a won_at / lost_at kitöltése.
--    Megjegyzés: a leads táblában nincs updated_at oszlop, ezért a
--    won_at / lost_at fallback csak created_at-re megy.
-- ---------------------------------------------------------------------
UPDATE public.leads SET status = 'quote_prep' WHERE status = 'qualified';
UPDATE public.leads SET status = 'won'        WHERE status = 'converted';

UPDATE public.leads
   SET won_at = COALESCE(won_at, created_at)
 WHERE status = 'won' AND won_at IS NULL;

UPDATE public.leads
   SET lost_at = COALESCE(lost_at, created_at)
 WHERE status = 'lost' AND lost_at IS NULL;

UPDATE public.leads
   SET assigned_at = COALESCE(assigned_at, created_at)
 WHERE assigned_to IS NOT NULL AND assigned_at IS NULL;

-- ---------------------------------------------------------------------
-- 3) leads.status — szigorú CHECK
--    Először NOT VALID, majd VALIDATE — a backfill után már minden sor jó.
-- ---------------------------------------------------------------------
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_chk;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_chk
  CHECK (status IN (
    'new','contacted','quote_prep','quote_sent',
    'follow_up','contract','won','lost'
  )) NOT VALID;
ALTER TABLE public.leads VALIDATE CONSTRAINT leads_status_chk;

-- ---------------------------------------------------------------------
-- 4) lead_status_history tábla
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead
  ON public.lead_status_history(lead_id, changed_at DESC);

GRANT SELECT ON public.lead_status_history TO authenticated;
GRANT ALL    ON public.lead_status_history TO service_role;

-- RLS: csak SELECT engedélyezett szerepkör alapján, INSERT/UPDATE/DELETE tilos
-- (csak trigger ír, SECURITY DEFINER fn-en keresztül).
ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_status_history_select ON public.lead_status_history;
CREATE POLICY lead_status_history_select
  ON public.lead_status_history
  FOR SELECT TO authenticated
  USING (
    public.is_owner_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) IN ('marketing','sales','crm','pm')
    )
  );

-- ---------------------------------------------------------------------
-- 5) Triggerek — leads
-- ---------------------------------------------------------------------

-- 5/a) Üzleti szabályok: assigned_to, lost_reason, won_at/lost_at, assigned_at
CREATE OR REPLACE FUNCTION public.leads_business_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff timestamptz;
  is_legacy boolean;
BEGIN
  -- legacy határ (string -> timestamptz, hibás érték esetén távoli múlt)
  SELECT value::timestamptz INTO cutoff
    FROM public.sales_module_meta WHERE key = 'legacy_cutoff_ts';
  IF cutoff IS NULL THEN
    cutoff := 'epoch'::timestamptz;
  END IF;

  is_legacy := (TG_OP = 'UPDATE'
                AND OLD.created_at IS NOT NULL
                AND OLD.created_at < cutoff
                AND NEW.status IS NOT DISTINCT FROM OLD.status
                AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to);

  -- assigned_to kötelező, ha a lead nyitott — kivéve legacy érintetlen UPDATE
  IF NEW.status NOT IN ('won','lost') AND NEW.assigned_to IS NULL THEN
    IF NOT is_legacy
       AND NOT (NEW.status = 'new'
                AND COALESCE(NEW.source, '') IN ('web_form','email_inbound')) THEN
      RAISE EXCEPTION
        'leads.assigned_to is required for open leads (status=%, source=%)',
        NEW.status, NEW.source
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- lost_reason kötelező lost-nál
  IF NEW.status = 'lost' AND COALESCE(NEW.lost_reason, '') = '' THEN
    RAISE EXCEPTION 'leads.lost_reason is required when status=lost'
      USING ERRCODE = 'check_violation';
  END IF;

  -- assigned_at karbantartás
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
     AND NEW.assigned_at IS NULL THEN
    NEW.assigned_at := now();
  END IF;

  -- won_at / lost_at karbantartás
  IF NEW.status = 'won'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won')
     AND NEW.won_at IS NULL THEN
    NEW.won_at := now();
  END IF;

  IF NEW.status = 'lost'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'lost')
     AND NEW.lost_at IS NULL THEN
    NEW.lost_at := now();
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_leads_business_rules ON public.leads;
CREATE TRIGGER trg_leads_business_rules
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_business_rules();

-- 5/b) Status history feltöltése
CREATE OR REPLACE FUNCTION public.leads_status_history_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_status_history(lead_id, from_status, to_status, changed_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.lead_status_history(lead_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_leads_status_history ON public.leads;
CREATE TRIGGER trg_leads_status_history
  AFTER INSERT OR UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_status_history_write();

-- ---------------------------------------------------------------------
-- 6) quotes — előkészítés a több ajánlatra
-- ---------------------------------------------------------------------
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS lead_id    uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version    integer,
  ADD COLUMN IF NOT EXISTS is_current boolean;

UPDATE public.quotes SET version    = 1    WHERE version IS NULL;
UPDATE public.quotes SET is_current = true WHERE is_current IS NULL;

ALTER TABLE public.quotes ALTER COLUMN version    SET DEFAULT 1;
ALTER TABLE public.quotes ALTER COLUMN is_current SET DEFAULT true;
ALTER TABLE public.quotes ALTER COLUMN version    SET NOT NULL;
ALTER TABLE public.quotes ALTER COLUMN is_current SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_lead_version
  ON public.quotes(lead_id, version DESC);

-- Max 1 "current" verzió leadenként
CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_lead_current
  ON public.quotes(lead_id)
  WHERE is_current AND lead_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 7) projects — lead handoff
-- ---------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_payload jsonb,
  ADD COLUMN IF NOT EXISTS handoff_at      timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_lead ON public.projects(lead_id);

CREATE OR REPLACE FUNCTION public.projects_lead_handoff_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_status text;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO lead_status FROM public.leads WHERE id = NEW.lead_id;
  IF lead_status IS DISTINCT FROM 'won' THEN
    RAISE EXCEPTION
      'projects.lead_id may only reference leads with status=won (lead status=%)',
      lead_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.handoff_at IS NULL THEN
    NEW.handoff_at := now();
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_projects_lead_handoff ON public.projects;
CREATE TRIGGER trg_projects_lead_handoff
  BEFORE INSERT OR UPDATE OF lead_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_lead_handoff_guard();

-- ---------------------------------------------------------------------
-- 8) Indexek
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_assigned_status
  ON public.leads(assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_leads_open_next_due
  ON public.leads(next_step_due_at)
  WHERE status NOT IN ('won','lost');

CREATE INDEX IF NOT EXISTS idx_leads_status_created
  ON public.leads(status, created_at DESC);

-- ---------------------------------------------------------------------
-- 9) View-k
-- ---------------------------------------------------------------------

-- 9/a) v_lead_activity — utolsó aktivitás források szerint
CREATE OR REPLACE VIEW public.v_lead_activity
WITH (security_invoker = true) AS
SELECT
  l.id AS lead_id,
  (SELECT MAX(e.created_at) FROM public.emails e   WHERE e.lead_id = l.id) AS last_email_at,
  (SELECT MAX(f.created_at) FROM public.followups f WHERE f.lead_id = l.id
      AND f.followup_type = 'call')                                       AS last_call_at,
  (SELECT MAX(f.created_at) FROM public.followups f WHERE f.lead_id = l.id) AS last_followup_at,
  (SELECT MAX(h.changed_at) FROM public.lead_status_history h WHERE h.lead_id = l.id) AS last_status_change_at,
  GREATEST(
    COALESCE((SELECT MAX(e.created_at) FROM public.emails e   WHERE e.lead_id = l.id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(f.created_at) FROM public.followups f WHERE f.lead_id = l.id), 'epoch'::timestamptz),
    COALESCE((SELECT MAX(h.changed_at) FROM public.lead_status_history h WHERE h.lead_id = l.id), 'epoch'::timestamptz),
    COALESCE(l.created_at, 'epoch'::timestamptz)
  ) AS last_activity_at
FROM public.leads l;

GRANT SELECT ON public.v_lead_activity TO authenticated;
GRANT SELECT ON public.v_lead_activity TO service_role;

-- 9/b) v_sales_user_load — sales user-ek + aktív lead darab
CREATE OR REPLACE VIEW public.v_sales_user_load
WITH (security_invoker = true) AS
SELECT
  up.auth_user_id                                  AS user_id,
  COALESCE(up.full_name, up.email, '')             AS full_name,
  up.email                                         AS email,
  COALESCE(cnt.active_lead_count, 0)               AS active_lead_count
FROM public.users_profile up
JOIN public.roles r ON r.id = up.role_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS active_lead_count
    FROM public.leads l
   WHERE l.assigned_to = up.auth_user_id
     AND l.status NOT IN ('won','lost')
) cnt ON true
WHERE lower(r.name) = 'sales'
  AND up.auth_user_id IS NOT NULL;

GRANT SELECT ON public.v_sales_user_load TO authenticated;
GRANT SELECT ON public.v_sales_user_load TO service_role;

-- 9/c) v_lead_due_buckets — dashboard "mai/lejárt/holnap/később"
CREATE OR REPLACE VIEW public.v_lead_due_buckets
WITH (security_invoker = true) AS
SELECT
  l.id          AS lead_id,
  l.assigned_to,
  l.next_step_due_at,
  CASE
    WHEN l.next_step_due_at IS NULL                                   THEN 'missing'
    WHEN l.next_step_due_at <  date_trunc('day', now())               THEN 'overdue'
    WHEN l.next_step_due_at <  date_trunc('day', now()) + interval '1 day'
                                                                      THEN 'today'
    WHEN l.next_step_due_at <  date_trunc('day', now()) + interval '2 day'
                                                                      THEN 'tomorrow'
    ELSE 'later'
  END AS bucket
FROM public.leads l
WHERE l.status NOT IN ('won','lost');

GRANT SELECT ON public.v_lead_due_buckets TO authenticated;
GRANT SELECT ON public.v_lead_due_buckets TO service_role;

-- ---------------------------------------------------------------------
-- 10) RLS politikák — leads
--     A meglévő "authenticated_full_access" (2026-06-13_s1_3_rls_on.sql)
--     helyett szerepkör-szigorú modell.
-- ---------------------------------------------------------------------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_full_access ON public.leads;
DROP POLICY IF EXISTS leads_select_admin        ON public.leads;
DROP POLICY IF EXISTS leads_select_marketing    ON public.leads;
DROP POLICY IF EXISTS leads_select_sales        ON public.leads;
DROP POLICY IF EXISTS leads_select_pm           ON public.leads;
DROP POLICY IF EXISTS leads_insert_authz        ON public.leads;
DROP POLICY IF EXISTS leads_update_admin        ON public.leads;
DROP POLICY IF EXISTS leads_update_marketing    ON public.leads;
DROP POLICY IF EXISTS leads_update_sales        ON public.leads;
DROP POLICY IF EXISTS leads_delete_admin        ON public.leads;

CREATE POLICY leads_select_admin
  ON public.leads FOR SELECT TO authenticated
  USING (public.is_owner_role(auth.uid()));

CREATE POLICY leads_select_marketing
  ON public.leads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) = 'marketing'
    )
  );

CREATE POLICY leads_select_sales
  ON public.leads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) = 'sales'
    )
    AND (assigned_to = auth.uid() OR assigned_to IS NULL OR status = 'new')
  );

CREATE POLICY leads_select_pm
  ON public.leads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) = 'pm'
    )
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id = leads.id)
  );

CREATE POLICY leads_insert_authz
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner_role(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) IN ('marketing','sales','crm')
    )
  );

CREATE POLICY leads_update_admin
  ON public.leads FOR UPDATE TO authenticated
  USING (public.is_owner_role(auth.uid()))
  WITH CHECK (public.is_owner_role(auth.uid()));

CREATE POLICY leads_update_marketing
  ON public.leads FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) = 'marketing'
    )
    AND status = 'new'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) = 'marketing'
    )
  );

CREATE POLICY leads_update_sales
  ON public.leads FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) = 'sales'
    )
    AND (assigned_to = auth.uid() OR assigned_to IS NULL)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile up
      JOIN public.roles r ON r.id = up.role_id
      WHERE up.auth_user_id = auth.uid()
        AND lower(r.name) = 'sales'
    )
    AND assigned_to = auth.uid()
  );

CREATE POLICY leads_delete_admin
  ON public.leads FOR DELETE TO authenticated
  USING (public.is_owner_role(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

COMMIT;