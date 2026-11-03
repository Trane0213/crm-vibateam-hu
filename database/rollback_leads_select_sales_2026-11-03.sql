-- ROLLBACK: public.leads "leads_select_sales" visszaállítása a 2026-11-03-i szigorítás előtti definícióra.
-- Csak ezt az egy policyt érinti; a többi (admin/marketing/pm SELECT, INSERT, UPDATE, DELETE) változatlan.
-- Mentett eredeti definíció (pg_policies, 2026-11-03 12:50 UTC):
--   FOR SELECT TO authenticated USING (
--     EXISTS (SELECT 1 FROM users_profile up JOIN roles r ON r.id = up.role_id
--             WHERE up.auth_user_id = auth.uid() AND lower(r.name) = 'sales')
--     AND (assigned_to = auth.uid() OR assigned_to IS NULL OR status = 'new'))
BEGIN;
DROP POLICY IF EXISTS leads_select_sales ON public.leads;
CREATE POLICY leads_select_sales ON public.leads FOR SELECT TO authenticated USING (
  (EXISTS (SELECT 1 FROM public.users_profile up JOIN public.roles r ON r.id = up.role_id
           WHERE up.auth_user_id = auth.uid() AND lower(r.name) = 'sales'))
  AND ((assigned_to = auth.uid()) OR (assigned_to IS NULL) OR (status = 'new'::text))
);
COMMIT;
