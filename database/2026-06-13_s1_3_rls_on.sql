-- S1.3 — RLS bekapcsolása a négy korábban nyitott táblán.
-- Első körben `authenticated_full_access` policy: minden bejelentkezett
-- felhasználó olvashat/írhat. Finomabb jogosultsági modell később (D-sprintek).

-- ── leads ─────────────────────────────────────────────────────────────────
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON public.leads;
CREATE POLICY authenticated_full_access ON public.leads
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- ── followups ─────────────────────────────────────────────────────────────
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON public.followups;
CREATE POLICY authenticated_full_access ON public.followups
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followups TO authenticated;
GRANT ALL ON public.followups TO service_role;

-- ── followup_events ───────────────────────────────────────────────────────
ALTER TABLE public.followup_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON public.followup_events;
CREATE POLICY authenticated_full_access ON public.followup_events
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_events TO authenticated;
GRANT ALL ON public.followup_events TO service_role;

-- ── project_documents ─────────────────────────────────────────────────────
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON public.project_documents;
CREATE POLICY authenticated_full_access ON public.project_documents
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;
GRANT ALL ON public.project_documents TO service_role;