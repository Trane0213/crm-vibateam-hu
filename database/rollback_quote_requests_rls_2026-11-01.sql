-- ROLLBACK: quote_requests RLS szigorítás (2026-11-01) visszavonása.
-- Mentés előtti állapot (pg_policies, 2026-11-01 20:15 UTC):
--   policyname=authenticated_full_access, cmd=ALL, roles={authenticated}, USING true, WITH CHECK true
-- FIGYELEM: a visszaállítás újranyitja a teljes CRUD-ot minden bejelentkezett felhasználónak.
-- Előtte anon és authenticated: SELECT, INSERT, UPDATE, DELETE, TRUNCATE (stb.) tábla-grant volt.
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.quote_requests TO anon, authenticated;
CREATE POLICY authenticated_full_access ON public.quote_requests
  AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
