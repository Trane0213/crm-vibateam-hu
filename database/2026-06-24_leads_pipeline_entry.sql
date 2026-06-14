-- =====================================================================
-- Leads — pipeline-ba léptetés és lost_stage
--
-- Jóváhagyott terv: .lovable/plan.md (Sales előkészítő ↔ Pipeline)
--
-- A lead és a pipeline két különböző életszakasz. A marketing átadáskor
-- a lead bekerül a Sales előkészítő szakaszába (Leads Workspace), és csak
-- külön üzleti döntéssel kerül át a Pipeline-ba.
--
-- Új mezők:
--   - pipeline_entered_at : időbélyeg, mikor lett a leadből pipeline-ügy
--                           (NULL = még előkészítő szakaszban). EGYIRÁNYÚ:
--                           ha már be van állítva, nem nullázzuk vissza.
--   - lost_stage          : ha elveszett, melyik szakaszban
--                           ('pre_pipeline' | 'pipeline').
--
-- A meglévő lost_at, lost_reason mezők változatlanok.
-- Minden DDL idempotens.
-- =====================================================================

BEGIN;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_entered_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS lost_stage          text         NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lost_stage_chk;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_lost_stage_chk
  CHECK (lost_stage IS NULL OR lost_stage IN ('pre_pipeline','pipeline'));

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_entered_at
  ON public.leads(pipeline_entered_at);

-- Egyirányúság védelme: ha már be van állítva pipeline_entered_at,
-- ne lehessen visszanullázni egy sima UPDATE-tel.
CREATE OR REPLACE FUNCTION public.leads_pipeline_entry_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_leads_pipeline_entry_guard ON public.leads;
CREATE TRIGGER trg_leads_pipeline_entry_guard
  BEFORE UPDATE OF pipeline_entered_at ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_pipeline_entry_guard();

COMMIT;
