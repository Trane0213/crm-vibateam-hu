-- ============================================================
-- VIBA CRM — Pipeline stabilizáció (egy futtatás, idempotens)
-- 2026-06-26
--
-- Összevont migráció, ami a Pipeline-folyamat backend-oldali
-- hibáit javítja. Futtasd a Supabase SQL Editorban egyszer.
--
-- Tartalom:
--   1) leads pipeline_entered_at / lost_stage oszlopok + guard trigger
--      (a 2026-06-24_leads_pipeline_entry.sql újrajátszása)
--   2) projects.status CHECK + projects.status default + indexek
--      + project_contacts tábla (2026-06-15_viba_core_status.sql részei)
--   3) activities tábla: helyes FK (auth.users), tiszta RLS policy,
--      Data API GRANT-ok — hogy a Pipeline aktivitásnapló írni tudjon.
-- ============================================================

BEGIN;

-- =============================================================
-- 1) LEADS — pipeline belépés és lost_stage
-- =============================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_entered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lost_stage          text         NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lost_stage_chk;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_lost_stage_chk
  CHECK (lost_stage IS NULL OR lost_stage IN ('pre_pipeline','pipeline'));

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_entered_at
  ON public.leads(pipeline_entered_at);

CREATE OR REPLACE FUNCTION public.leads_pipeline_entry_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.pipeline_entered_at IS NOT NULL
     AND NEW.pipeline_entered_at IS DISTINCT FROM OLD.pipeline_entered_at THEN
    RAISE EXCEPTION
      'leads.pipeline_entered_at is one-way; cannot be changed once set'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_leads_pipeline_entry_guard ON public.leads;
CREATE TRIGGER trg_leads_pipeline_entry_guard
  BEFORE UPDATE OF pipeline_entered_at ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_pipeline_entry_guard();

-- =============================================================
-- 2) PROJECTS.STATUS — VIBA életciklus, CHECK + default
-- =============================================================
UPDATE public.projects SET status = 'uj_megkereses'   WHERE status = 'lead';
UPDATE public.projects SET status = 'ajanlat_keszul'  WHERE status = 'quoting';
UPDATE public.projects SET status = 'utankovetes'     WHERE status = 'negotiation';
UPDATE public.projects SET status = 'megnyert'        WHERE status = 'won';
UPDATE public.projects SET status = 'kivitelezes'     WHERE status = 'in_progress';
UPDATE public.projects SET status = 'lezart'          WHERE status = 'completed';
UPDATE public.projects SET status = 'elvesztett'      WHERE status = 'lost';
UPDATE public.projects SET status = 'uj_megkereses'   WHERE status IS NULL;
-- Bármilyen egyéb, nem várt érték → 'uj_megkereses', hogy a CHECK ne bukjon.
UPDATE public.projects SET status = 'uj_megkereses'
 WHERE status NOT IN ('uj_megkereses','felmeres','ajanlat_keszul','ajanlat_kikuldve',
                      'utankovetes','megnyert','elvesztett','kivitelezes','lezart');

ALTER TABLE public.projects
  ALTER COLUMN status SET DEFAULT 'uj_megkereses';

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_viba_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_viba_check
  CHECK (status IN (
    'uj_megkereses','felmeres','ajanlat_keszul','ajanlat_kikuldve',
    'utankovetes','megnyert','elvesztett','kivitelezes','lezart'
  ));

CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- project_contacts (idempotens)
CREATE TABLE IF NOT EXISTS public.project_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contact_id  uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  role        text,
  is_primary  boolean NOT NULL DEFAULT false,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_contacts_project_contact_role
  ON public.project_contacts(project_id, contact_id, COALESCE(role,''));
CREATE INDEX IF NOT EXISTS idx_project_contacts_project ON public.project_contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_contact ON public.project_contacts(contact_id);

ALTER TABLE public.project_contacts DROP CONSTRAINT IF EXISTS project_contacts_role_check;
ALTER TABLE public.project_contacts
  ADD CONSTRAINT project_contacts_role_check
  CHECK (role IS NULL OR role IN (
    'muszaki','donteshozo','penzugy','kozos_kepviselo','projektvezeto','egyeb'
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_contacts TO authenticated;
GRANT ALL ON public.project_contacts TO service_role;
ALTER TABLE public.project_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_contacts_select_authenticated" ON public.project_contacts;
CREATE POLICY "project_contacts_select_authenticated"
  ON public.project_contacts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "project_contacts_write_authenticated" ON public.project_contacts;
CREATE POLICY "project_contacts_write_authenticated"
  ON public.project_contacts FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- =============================================================
-- 3) ACTIVITIES — FK fix + RLS + GRANT
--
-- Az `activities` user_id FK eddig a users_profile-ra mutatott,
-- ezért a frontend `logActivity` (auth.uid()) FK-hibával hallgatott.
-- Átirányítjuk az auth.users-re, és a Data API jogosultságokat
-- kézzel kiosztjuk. Az INSERT policy: a saját user_id-vel írható
-- (vagy NULL-lal — pl. cron / service utak).
-- =============================================================
DO $$
DECLARE c text;
BEGIN
  -- Bármely meglévő FK az activities.user_id oszlopra → eldobás
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.activities'::regclass
       AND contype  = 'f'
       AND conkey   = ARRAY[
             (SELECT attnum FROM pg_attribute
               WHERE attrelid = 'public.activities'::regclass
                 AND attname  = 'user_id')
           ]
  LOOP
    EXECUTE format('ALTER TABLE public.activities DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

GRANT SELECT, INSERT ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Régi, esetleg nem-passzoló policy-k takarítása
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'activities'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.activities', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "activities_select_authenticated"
  ON public.activities FOR SELECT TO authenticated USING (true);

CREATE POLICY "activities_insert_self_or_null"
  ON public.activities FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

COMMIT;

-- ============================================================
-- VÉGE. Ellenőrzés:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='leads'
--      and column_name in ('pipeline_entered_at','lost_stage');
--   select conname from pg_constraint
--    where conrelid='public.projects'::regclass and conname like '%status%';
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='activities';
-- ============================================================
