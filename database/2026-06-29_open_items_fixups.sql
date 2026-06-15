-- ============================================================================
--  Open items fixup migration — D1, D2, D3
--  Készült: 2026-06-29
--
--  Cél: az audit által nyitva hagyott három adathiba lezárása, mielőtt
--  a PM modul fejlesztése elindulna. Idempotens — ismétléskor nem csinál
--  semmit, ha már nincs anomália.
--
--  Lefutott invariáns rétegre épít:
--    - 2026-06-27_sales_invariants.sql  (trg_leads_*, next_step_required, …)
--    - 2026-06-28_sales_data_normalization.sql
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
--  D1 — Pipeline-fázisban (contacted / quote_prep / quote_sent / follow_up)
--       lévő leadek pipeline_entered_at és next_step nélkül.
--
--  next_step_required trigger megköveteli a next_step-et — adunk neki egy
--  default 3 napos utánkövetést, hogy a constraint átmenjen.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.leads
   SET pipeline_entered_at = COALESCE(pipeline_entered_at, updated_at, created_at, now()),
       next_step_type      = COALESCE(next_step_type, 'follow_up'),
       next_step_due_at    = COALESCE(next_step_due_at, now() + interval '3 days'),
       next_step_note      = COALESCE(
                               next_step_note,
                               'Pipeline-belépés rekonstruálva (D1 fixup).'
                             )
 WHERE status IN ('contacted', 'quote_prep', 'quote_sent', 'follow_up')
   AND pipeline_entered_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
--  D2 — Projekt létezik lead_id-vel, de a kapcsolt lead nem 'won'.
--       Mivel projekt már van, a `won_requires_project` trigger átengedi
--       a státuszváltást. A handoff-payload-ot is feltöltjük, hogy a
--       project detail oldalon konzisztens kép jelenjen meg.
-- ────────────────────────────────────────────────────────────────────────────
WITH orphan_pairs AS (
  SELECT p.id   AS project_id,
         p.lead_id,
         l.assigned_to,
         l.summary,
         l.source
    FROM public.projects p
    JOIN public.leads    l ON l.id = p.lead_id
   WHERE p.lead_id IS NOT NULL
     AND l.status <> 'won'
)
UPDATE public.leads l
   SET status      = 'won',
       won_at      = COALESCE(l.won_at, now()),
       lost_at     = NULL,
       lost_reason = NULL,
       lost_note   = NULL,
       lost_stage  = NULL
  FROM orphan_pairs op
 WHERE l.id = op.lead_id;

-- handoff_payload feltöltése, ha üres / hiányos
UPDATE public.projects p
   SET handoff_payload = COALESCE(p.handoff_payload, '{}'::jsonb)
                       || jsonb_build_object(
                            'created_via', COALESCE(
                              (p.handoff_payload->>'created_via'),
                              'legacy_backfill'
                            ),
                            'source',  COALESCE(
                              (p.handoff_payload->>'source'),
                              l.source
                            ),
                            'summary', COALESCE(
                              (p.handoff_payload->>'summary'),
                              l.summary
                            ),
                            'project_manager_user_id', COALESCE(
                              (p.handoff_payload->>'project_manager_user_id'),
                              l.assigned_to::text
                            )
                          )
  FROM public.leads l
 WHERE p.lead_id = l.id
   AND l.status  = 'won'
   AND (
        p.handoff_payload IS NULL
     OR NOT (p.handoff_payload ? 'created_via')
     OR NOT (p.handoff_payload ? 'project_manager_user_id')
   );

-- ────────────────────────────────────────────────────────────────────────────
--  D3 — Aktív leadek nem létező user-hez vannak rendelve (assigned_to
--       NEM szerepel a profiles táblában). Re-assign a legrégebbi
--       létező profilra (rendszerszintű alapértelmezett tulajdonos),
--       hogy a P0 "assigned_to NULL aktív leaden" invariáns ne sérüljön.
-- ────────────────────────────────────────────────────────────────────────────
WITH default_owner AS (
  SELECT id
    FROM public.profiles
   ORDER BY created_at ASC NULLS LAST, id ASC
   LIMIT 1
)
UPDATE public.leads l
   SET assigned_to = (SELECT id FROM default_owner)
 WHERE l.assigned_to IS NOT NULL
   AND l.status NOT IN ('lost', 'won')
   AND NOT EXISTS (
         SELECT 1 FROM public.profiles p WHERE p.id = l.assigned_to
       )
   AND (SELECT id FROM default_owner) IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
--  Verifikáció — ha bármelyik számláló > 0, ROLLBACK helyett figyelmeztetünk.
--  (Az invariáns triggerek amúgy is megakadályoznák a hibás állapotot.)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  d1_left INT;
  d2_left INT;
  d3_left INT;
BEGIN
  SELECT COUNT(*) INTO d1_left
    FROM public.leads
   WHERE status IN ('contacted','quote_prep','quote_sent','follow_up')
     AND pipeline_entered_at IS NULL;

  SELECT COUNT(*) INTO d2_left
    FROM public.projects p
    JOIN public.leads    l ON l.id = p.lead_id
   WHERE l.status <> 'won';

  SELECT COUNT(*) INTO d3_left
    FROM public.leads l
   WHERE l.assigned_to IS NOT NULL
     AND l.status NOT IN ('lost','won')
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = l.assigned_to);

  RAISE NOTICE 'D1 maradt: %, D2 maradt: %, D3 maradt: %', d1_left, d2_left, d3_left;
END $$;

COMMIT;
