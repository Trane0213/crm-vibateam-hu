DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_workers','attendance_projects','attendance_entries','attendance_period_adjustments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update_authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert_authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete_owner', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) = ''project_manager'') WITH CHECK (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) = ''project_manager'')', t||'_update_owner_pm', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_owner_role(auth.uid()))', t||'_delete_owner', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['attendance_workers','attendance_projects','attendance_period_adjustments'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) = ''project_manager'')', t||'_write_owner_pm', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['quotes','quote_items'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON public.%I', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) IN (''project_manager'',''sales'')) WITH CHECK (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) IN (''project_manager'',''sales''))', t||'_write', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS attendance_entries_insert_own ON public.attendance_entries;
CREATE POLICY attendance_entries_insert_own ON public.attendance_entries FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) = 'project_manager'));