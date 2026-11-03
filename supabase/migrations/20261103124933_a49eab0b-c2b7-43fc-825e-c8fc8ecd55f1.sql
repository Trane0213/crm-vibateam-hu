DROP POLICY IF EXISTS leads_select_sales ON public.leads;
CREATE POLICY leads_select_sales ON public.leads FOR SELECT TO authenticated USING (
  (EXISTS (SELECT 1 FROM public.users_profile up JOIN public.roles r ON r.id = up.role_id
           WHERE up.auth_user_id = auth.uid() AND lower(r.name) = 'sales'))
  AND assigned_to = auth.uid()
);