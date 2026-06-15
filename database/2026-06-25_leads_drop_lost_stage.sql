-- =====================================================================
-- Leads — lost_stage mező eltávolítása
--
-- Üzleti döntés (jóváhagyott): a lost_stage mezőnek jelenleg nincs
-- valódi fogyasztója (nincs riport, dashboard, szűrés). Ne tartsunk
-- fenn mezőt jövőbeli feltételezések miatt. Ha később valóban kell,
-- visszahozzuk egy új migrációval.
--
-- A lost_at, lost_reason, lost_note mezők változatlanok.
-- =====================================================================

BEGIN;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lost_stage_chk;
ALTER TABLE public.leads DROP COLUMN     IF EXISTS lost_stage;

COMMIT;