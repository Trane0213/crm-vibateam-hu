-- =====================================================================
-- VIBA CRM — Sales backend invariánsok (egy futtatás, idempotens)
-- 2026-06-27  (javítva: 2026-06-28 — production-ready)
--
-- ELŐFELTÉTEL: a database/2026-06-28_sales_data_normalization.sql
-- LE KELL HOGY FUSSON ELŐSZÖR. Verifikáció:
--   SELECT count(*) FROM public.leads
--    WHERE assigned_to IS NULL AND status NOT IN ('won','lost');           -- 0
--   SELECT count(*) FROM public.leads l
--    WHERE l.status='won'
--      AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id=l.id); -- 0
--
-- Tartalom:
--   1) leads.lost_stage normalizálás → tényleges elveszett pipeline-státusz
--   2) Biimplikáció: status='lost' <=> lost_stage IS NOT NULL
--   3) Pipeline next_step kötelezőség (backend trigger)
--   4) Won → Project atomi védelem (RPC + guard trigger + projekt-trigger)
--   5) projects(lead_id) egyediség — egy won leadhez egy projekt
--   6) Won-orphan safety-net (a normalizáció már lekezelte)
--
-- Egyszer futtatható, többször is biztonságos (IF NOT EXISTS / DROP IF EXISTS).
-- =====================================================================

BEGIN;

-- =====================================================================
-- 0) Előfeltételek — lost_stage és pipeline_entered_at léteznek-e?
-- =====================================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_entered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lost_stage          text         NULL;

-- =====================================================================
-- 1) LOST_STAGE NORMALIZÁLÁS
--    Régi értékek: 'pre_pipeline' / 'pipeline'
--    Új értékek:   'contacted','quote_prep','quote_sent','follow_up','contract'
--
--    KRITIKUS sorrend: a régi leads_lost_stage_chk constraint csak
--    'pre_pipeline'/'pipeline' értékeket enged → előbb DROP, aztán UPDATE,
--    majd új CHECK. Egyébként az 1.a és 1.b UPDATE check_violation-be fut.
-- =====================================================================
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lost_stage_chk;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lost_stage_required;

-- 1.a) Régi durvább értékek mappelése (lossy, irányt tartó)
UPDATE public.leads SET lost_stage = 'contacted'  WHERE lost_stage = 'pre_pipeline';
UPDATE public.leads SET lost_stage = 'quote_prep' WHERE lost_stage = 'pipeline';
UPDATE public.leads SET lost_stage = 'contacted' WHERE lost_stage = 'new';

-- 1.b) Lost leadek backfillje a státuszhistóriából
UPDATE public.leads l
   SET lost_stage = COALESCE(
         (SELECT h.from_status
            FROM public.lead_status_history h
           WHERE h.lead_id = l.id
             AND h.to_status = 'lost'
             AND h.from_status IN ('contacted','quote_prep','quote_sent','follow_up','contract')
           ORDER BY h.changed_at DESC
           LIMIT 1),
         'quote_prep')
 WHERE l.status = 'lost'
   AND (l.lost_stage IS NULL
        OR l.lost_stage NOT IN ('contacted','quote_prep','quote_sent','follow_up','contract'));

-- A nem-lost soroknál a lost_stage MINDIG legyen NULL.
UPDATE public.leads SET lost_stage = NULL WHERE status <> 'lost' AND lost_stage IS NOT NULL;

-- 1.c) Új CHECK — whitelisted enum
ALTER TABLE public.leads
  ADD CONSTRAINT leads_lost_stage_chk
  CHECK (lost_stage IS NULL OR lost_stage IN (
    'contacted','quote_prep','quote_sent','follow_up','contract'
  ));

-- 1.d) Új CHECK — biimplikáció
ALTER TABLE public.leads
  ADD CONSTRAINT leads_lost_stage_required
  CHECK ((status = 'lost') = (lost_stage IS NOT NULL));

-- =====================================================================
-- 2) PIPELINE NEXT STEP KÖTELEZŐSÉG
--    Pipeline-fázisú leadnek (pipeline_entered_at IS NOT NULL ÉS
--    status IN quote_prep/quote_sent/follow_up/contract) mindig legyen
--    next_step_type ÉS next_step_due_at kitöltve.
--
--    Preflight: 0 sértő rekord → backfill nem szükséges.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.leads_pipeline_next_step_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.pipeline_entered_at IS NOT NULL
     AND NEW.status IN ('quote_prep','quote_sent','follow_up','contract')
     AND (NEW.next_step_type IS NULL OR NEW.next_step_due_at IS NULL) THEN
    RAISE EXCEPTION
      'Pipeline lead (status=%) requires next_step_type AND next_step_due_at',
      NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_leads_pipeline_next_step_required ON public.leads;
CREATE TRIGGER trg_leads_pipeline_next_step_required
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_pipeline_next_step_required();

-- =====================================================================
-- 3) WON → PROJECT ATOMI VÉDELEM
--
--    Invariáns: lead.status='won' csak úgy fordulhat elő, ha ugyanabban a
--    tranzakcióban projekt is létrejön. SECURITY DEFINER RPC: a leadet
--    won-ra állítja ÉS azonnal beszúrja a projektet egyetlen tx-en belül.
--    Guard trigger minden más won-átmenetet elutasít.
--
--    Az RPC tx-szintű flag-et állít (app.allow_won_transition='1'),
--    amelyet a trigger elfogad — más útvonal nem tudja beállítani.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.leads_won_requires_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_flag text;
BEGIN
  IF NEW.status = 'won'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won') THEN
    v_flag := current_setting('app.allow_won_transition', true);
    IF COALESCE(v_flag, '') <> '1' THEN
      RAISE EXCEPTION
        'leads.status=''won'' direct write forbidden — use sales_mark_won_with_project() RPC'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_leads_won_requires_project ON public.leads;
CREATE TRIGGER trg_leads_won_requires_project
  BEFORE INSERT OR UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_won_requires_project();

-- 3.b) Egy won leadhez maximum egy projekt (preflight: 0 duplikáció).
DROP INDEX IF EXISTS uq_projects_lead_id;
CREATE UNIQUE INDEX uq_projects_lead_id
  ON public.projects(lead_id)
  WHERE lead_id IS NOT NULL;

-- 3.c) Projekt-trigger: won lead utolsó projektjét tilos törölni / lecsatolni.
CREATE OR REPLACE FUNCTION public.projects_protect_won_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_status text;
  v_remaining int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.lead_id IS NOT NULL THEN
      SELECT status INTO v_status FROM public.leads WHERE id = OLD.lead_id;
      IF v_status = 'won' THEN
        SELECT count(*) INTO v_remaining FROM public.projects
          WHERE lead_id = OLD.lead_id AND id <> OLD.id;
        IF v_remaining = 0 THEN
          RAISE EXCEPTION
            'Cannot delete the only project of a won lead (lead=%)', OLD.lead_id
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.lead_id IS NOT NULL
     AND NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
    SELECT status INTO v_status FROM public.leads WHERE id = OLD.lead_id;
    IF v_status = 'won' THEN
      SELECT count(*) INTO v_remaining FROM public.projects
        WHERE lead_id = OLD.lead_id AND id <> OLD.id;
      IF v_remaining = 0 THEN
        RAISE EXCEPTION
          'Cannot detach the only project of a won lead (lead=%)', OLD.lead_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_projects_protect_won_lead ON public.projects;
CREATE TRIGGER trg_projects_protect_won_lead
  BEFORE DELETE OR UPDATE OF lead_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_protect_won_lead();

-- =====================================================================
-- 3.d) Az ATOMI RPC — won + project egyetlen tranzakcióban
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sales_mark_won_with_project(
  p_lead_id                 uuid,
  p_title                   text,
  p_start_date              date,
  p_project_manager_user_id uuid,
  p_notes                   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company_id uuid;
  v_source     text;
  v_summary    text;
  v_won_at     timestamptz;
  v_project_id uuid;
BEGIN
  IF p_lead_id IS NULL                 THEN RAISE EXCEPTION 'p_lead_id required'; END IF;
  IF p_project_manager_user_id IS NULL THEN RAISE EXCEPTION 'p_project_manager_user_id required'; END IF;
  IF p_start_date IS NULL              THEN RAISE EXCEPTION 'p_start_date required'; END IF;

  -- Tranzakció-szintű flag: a won-guard trigger ezzel engedi át az UPDATE-et.
  PERFORM set_config('app.allow_won_transition', '1', true);

  SELECT company_id, source, summary, won_at
    INTO v_company_id, v_source, v_summary, v_won_at
    FROM public.leads
   WHERE id = p_lead_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.projects WHERE lead_id = p_lead_id) THEN
    RAISE EXCEPTION 'A project already exists for lead %', p_lead_id;
  END IF;

  UPDATE public.leads
     SET status = 'won',
         won_at = COALESCE(v_won_at, now())
   WHERE id = p_lead_id;

  -- A projects_lead_handoff_guard megköveteli, hogy ekkor a lead már 'won' legyen.
  INSERT INTO public.projects(
    title, lead_id, company_id, start_date, handoff_payload
  ) VALUES (
    COALESCE(NULLIF(trim(p_title), ''), 'Új projekt'),
    p_lead_id,
    v_company_id,
    p_start_date,
    jsonb_build_object(
      'source',                   v_source,
      'summary',                  v_summary,
      'notes',                    p_notes,
      'project_manager_user_id',  p_project_manager_user_id,
      'created_via',              'sales_mark_won_with_project'
    )
  )
  RETURNING id INTO v_project_id;

  RETURN v_project_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.sales_mark_won_with_project(uuid, text, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sales_mark_won_with_project(uuid, text, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_mark_won_with_project(uuid, text, date, uuid, text) TO service_role;

-- =====================================================================
-- 4) WON-ORPHAN SAFETY-NET
--    A 2026-06-28 normalizáció ezt már lekezelte; itt csak biztonsági
--    háló (üres halmazon nincs hatása). Ha találna, a status_history
--    triggert lokálisan kikapcsoljuk — NULL changed_by nem írható auditba.
-- =====================================================================
DO $bf$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.leads l
   WHERE l.status = 'won'
     AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id = l.id);

  IF v_count > 0 THEN
    EXECUTE 'ALTER TABLE public.leads DISABLE TRIGGER trg_leads_status_history';
    UPDATE public.leads
       SET status = 'contract', won_at = NULL
     WHERE status = 'won'
       AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id = leads.id);
    EXECUTE 'ALTER TABLE public.leads ENABLE TRIGGER trg_leads_status_history';
  END IF;
END
$bf$;

COMMIT;

-- =====================================================================
-- ELLENŐRZÉS (futtatás után):
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='public.leads'::regclass
--      AND conname IN ('leads_lost_stage_chk','leads_lost_stage_required');
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid='public.leads'::regclass
--      AND tgname IN ('trg_leads_won_requires_project',
--                     'trg_leads_pipeline_next_step_required');
--   SELECT proname FROM pg_proc WHERE proname='sales_mark_won_with_project';
--
-- Negatív tesztek (mindkettő hibát kell dobjon):
--   UPDATE public.leads SET status='won' WHERE id='<bármi>';
--   UPDATE public.leads SET next_step_type=NULL
--    WHERE status='quote_prep' AND pipeline_entered_at IS NOT NULL;
-- =====================================================================