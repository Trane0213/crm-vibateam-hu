-- Hardening: public.sales_module_meta RLS bekapcsolása.
-- A tábla egy modul-szintű kulcs/érték konfiguráció (pl. legacy_cutoff_ts).
-- A backend (SECURITY DEFINER fn-ek) bypass-szal olvassa, a frontend
-- jelenleg NEM olvassa közvetlenül. Olvasást authenticated szerepkörnek
-- engedünk (jövőbeni read-only használathoz), írást kizárólag service_role
-- végezhet (alap GRANT alapján; explicit policy nem szükséges, mert RLS
-- alatt policy hiánya = tiltás authenticated/anon számára).

ALTER TABLE public.sales_module_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_module_meta_select_auth ON public.sales_module_meta;
CREATE POLICY sales_module_meta_select_auth
  ON public.sales_module_meta
  FOR SELECT
  TO authenticated
  USING (true);

-- anon-nak nincs GRANT és nincs policy — duplán tiltva.
