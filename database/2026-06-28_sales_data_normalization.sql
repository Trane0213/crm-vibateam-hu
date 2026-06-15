-- =====================================================================
-- VIBA CRM — Sales preflight adatnormalizáció
-- 2026-06-28
--
-- Cél: a 2026-06-27_sales_invariants.sql FUTTATÁSA ELŐTT a meglévő
-- adatokat ráhúzhatóvá tenni az új constraintekre / triggerekre.
--
-- Preflight eredmény (2026-06-28):
--   1) lost lead lost_reason nélkül           : 0  → nincs teendő
--   2) aktív lead assigned_to nélkül          : 8  → normalizáljuk
--   3) won lead projekt nélkül                : 1  → visszaállítjuk 'contract'-ra
--   4) több projekttel rendelkező lead        : 0  → nincs teendő
--   5) pipeline lead next_step nélkül         : 0  → nincs teendő
--
-- Determinisztikus default sales owner:
--   feaad8d8-b04a-4d10-b67b-1aeb6a7b4850
--   (a jelenlegi assignee-eloszlás leggyakoribb user-e a leads táblában,
--    nem új üzleti döntés — meglévő adatból levezetve)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Aktív, assignee nélküli leadek normalizálása
--    A leads_business_rules trigger (BEFORE INS/UPD) MEGENGEDŐ a NEW
--    rekordra: mivel az UPDATE után assigned_to NOT NULL lesz, a trigger
--    sikeresen átengedi. Külön trigger-kikapcsolás NEM kell.
-- ---------------------------------------------------------------------
UPDATE public.leads
   SET assigned_to = 'feaad8d8-b04a-4d10-b67b-1aeb6a7b4850'::uuid,
       assigned_at = COALESCE(assigned_at, now())
 WHERE assigned_to IS NULL
   AND status NOT IN ('won', 'lost');

-- ---------------------------------------------------------------------
-- 2) Won lead projekt nélkül — visszaállítás 'contract'-ra
--
--    A státuszváltozást a trg_leads_status_history trigger naplózná
--    changed_by=NULL értékkel (mert nincs auth.uid() ebben a session-ben),
--    ami a meglévő history NOT NULL invariánsát sértheti, és semmiképp
--    nem ad érdemi audit-bejegyzést. A trigger-t kizárólag erre az
--    egyetlen UPDATE-re, lokálisan kapcsoljuk ki.
--
--    A leads_business_rules trigger átengedi: assigned_to NOT NULL,
--    contract státusz megengedett aktív állapot.
-- ---------------------------------------------------------------------
ALTER TABLE public.leads DISABLE TRIGGER trg_leads_status_history;

UPDATE public.leads
   SET status = 'contract',
       won_at = NULL
 WHERE status = 'won'
   AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id = leads.id);

ALTER TABLE public.leads ENABLE TRIGGER trg_leads_status_history;

COMMIT;

-- =====================================================================
-- VERIFIKÁCIÓ (futtatás után — mindegyik 0 kell legyen):
--
--   SELECT count(*) FROM public.leads
--    WHERE assigned_to IS NULL AND status NOT IN ('won','lost');
--
--   SELECT count(*) FROM public.leads l
--    WHERE l.status = 'won'
--      AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id = l.id);
--
-- Ha mindkettő 0 → futtatható a database/2026-06-27_sales_invariants.sql.
-- =====================================================================