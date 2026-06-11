-- ============================================================
-- VIBA CRM — Core státusz, cégtípus, projekt-kapcsolattartók
-- 2026-06-15. Idempotens, többször futtatható.
-- ============================================================

-- ------------------------------------------------------------
-- 1) PROJECTS.STATUS — VIBA életciklus
-- ------------------------------------------------------------
-- Régi → új mapping (csak ismert legacy értékekre):
UPDATE public.projects SET status = 'uj_megkereses'   WHERE status = 'lead';
UPDATE public.projects SET status = 'ajanlat_keszul'  WHERE status = 'quoting';
UPDATE public.projects SET status = 'utankovetes'     WHERE status = 'negotiation';
UPDATE public.projects SET status = 'megnyert'        WHERE status = 'won';
UPDATE public.projects SET status = 'kivitelezes'     WHERE status = 'in_progress';
UPDATE public.projects SET status = 'lezart'          WHERE status = 'completed';
UPDATE public.projects SET status = 'elvesztett'      WHERE status = 'lost';
UPDATE public.projects SET status = 'uj_megkereses'   WHERE status IS NULL;

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

-- ------------------------------------------------------------
-- 2) COMPANIES.COMPANY_TYPE — VIBA cégtípusok
-- ------------------------------------------------------------
-- Nincs auto-mapping (user döntés). Legacy 'potencialis' és 'alvallalkozo'
-- továbbra is megengedett, hogy a meglévő 2 sor ne bukjon a CHECK-en.
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_company_type_viba_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_company_type_viba_check
  CHECK (
    company_type IS NULL OR company_type IN (
      'generalkivitelezo','tarsashaz','kozos_kepviselo',
      'beruhazo','alvallalkozo','maganszemely',
      'potencialis'  -- legacy, kézzel átsorolásra vár
    )
  );

CREATE INDEX IF NOT EXISTS idx_companies_company_type ON public.companies(company_type);

-- ------------------------------------------------------------
-- 3) PROJECT_CONTACTS — projekt ↔ több kapcsolattartó (M:N)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  contact_id  uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  role        text,        -- 'muszaki' | 'donteshozo' | 'penzugy' | 'kozos_kepviselo' | 'projektvezeto' | egyéb
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

-- ------------------------------------------------------------
-- 4) EMAIL_THREADS.PROJECT_ID — biztosítjuk, hogy létezik
-- (az oszlop a korábbi migrációban már létrejöhetett; idempotens)
-- ------------------------------------------------------------
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_threads_project_id
  ON public.email_threads(project_id);
