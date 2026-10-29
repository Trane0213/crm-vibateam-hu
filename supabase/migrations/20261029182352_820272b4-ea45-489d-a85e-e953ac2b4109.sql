ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_manager_user_id uuid;
CREATE INDEX IF NOT EXISTS idx_projects_pm ON public.projects(project_manager_user_id);

ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS assigned_to uuid;
CREATE INDEX IF NOT EXISTS idx_followups_assigned_to ON public.followups(assigned_to);

ALTER TABLE public.quotes ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.crm_role_of(_auth_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT lower(r.name) FROM public.users_profile up JOIN public.roles r ON r.id = up.role_id
  WHERE up.auth_user_id = _auth_user LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.crm_role_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_role_of(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.followups_assign_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.assigned_to IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT assigned_to INTO NEW.assigned_to FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  IF NEW.assigned_to IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT project_manager_user_id INTO NEW.assigned_to FROM public.projects WHERE id = NEW.project_id;
  END IF;
  IF NEW.assigned_to IS NULL THEN
    NEW.assigned_to := auth.uid();
  END IF;
  IF NEW.lead_id IS NULL AND NEW.project_id IS NULL AND NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'followups: lead_id, project_id vagy company_id kötelező' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_followups_assign_owner ON public.followups;
CREATE TRIGGER trg_followups_assign_owner BEFORE INSERT ON public.followups
  FOR EACH ROW EXECUTE FUNCTION public.followups_assign_owner();

CREATE OR REPLACE FUNCTION public.sales_mark_won_with_project(p_lead_id uuid, p_title text, p_start_date date, p_project_manager_user_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid; v_source text; v_summary text; v_won_at timestamptz;
  v_status text; v_assigned uuid; v_entered timestamptz; v_project_id uuid;
  v_caller uuid := auth.uid(); v_caller_role text; v_pm_role text;
BEGIN
  IF p_lead_id IS NULL                 THEN RAISE EXCEPTION 'p_lead_id required'; END IF;
  IF p_project_manager_user_id IS NULL THEN RAISE EXCEPTION 'p_project_manager_user_id required'; END IF;
  IF p_start_date IS NULL              THEN RAISE EXCEPTION 'p_start_date required'; END IF;

  SELECT company_id, source, summary, won_at, status, assigned_to, pipeline_entered_at
    INTO v_company_id, v_source, v_summary, v_won_at, v_status, v_assigned, v_entered
    FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found: %', p_lead_id; END IF;

  -- Jogosultság: owner/admin bárkinél, sales csak a saját leadjénél.
  -- Hívó nélküli (service role) futás csak szerveroldali, megbízható kódból jöhet.
  IF v_caller IS NOT NULL THEN
    v_caller_role := public.crm_role_of(v_caller);
    IF NOT (public.is_owner_role(v_caller)
            OR (v_caller_role = 'sales' AND v_assigned = v_caller)) THEN
      RAISE EXCEPTION 'Nincs jogosultság a lead megnyeréséhez' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Státuszfeltétel: csak pipeline-ba bekerült, ajánlat utáni fázisú lead nyerhető meg.
  IF v_entered IS NULL OR v_status NOT IN ('quote_sent','follow_up','contract') THEN
    RAISE EXCEPTION 'Csak ajánlat elküldve / utánkövetés / szerződés fázisú pipeline lead nyerhető meg (jelenlegi: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Projektvezető: létező owner / project_manager / sales felhasználó.
  v_pm_role := public.crm_role_of(p_project_manager_user_id);
  IF v_pm_role IS NULL OR v_pm_role NOT IN ('owner','tulajdonos','admin','superadmin','project_manager','sales') THEN
    RAISE EXCEPTION 'Érvénytelen projektvezető' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.projects WHERE lead_id = p_lead_id) THEN
    RAISE EXCEPTION 'A project already exists for lead %', p_lead_id;
  END IF;

  PERFORM set_config('app.allow_won_transition', '1', true);
  UPDATE public.leads SET status = 'won', won_at = COALESCE(v_won_at, now()) WHERE id = p_lead_id;
  PERFORM set_config('app.allow_won_transition', '', true);

  INSERT INTO public.projects(title, lead_id, company_id, start_date, project_manager_user_id, handoff_payload)
  VALUES (
    COALESCE(NULLIF(trim(p_title), ''), 'Új projekt'), p_lead_id, v_company_id, p_start_date, p_project_manager_user_id,
    jsonb_build_object('source', v_source, 'summary', v_summary, 'notes', p_notes,
      'project_manager_user_id', p_project_manager_user_id, 'created_via', 'sales_mark_won_with_project')
  ) RETURNING id INTO v_project_id;

  RETURN v_project_id;
END
$function$;
REVOKE EXECUTE ON FUNCTION public.sales_mark_won_with_project(uuid,text,date,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_mark_won_with_project(uuid,text,date,uuid,text) TO authenticated, service_role;

DROP POLICY IF EXISTS leads_select_pm ON public.leads;
CREATE POLICY leads_select_pm ON public.leads FOR SELECT TO authenticated
USING (
  public.crm_role_of(auth.uid()) IN ('pm','project_manager')
  AND EXISTS (SELECT 1 FROM public.projects p WHERE p.lead_id = leads.id)
);

DROP POLICY IF EXISTS projects_authenticated_access ON public.projects;
CREATE POLICY projects_read ON public.projects FOR SELECT TO authenticated
USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) IN ('project_manager','pm','sales','marketing'));
CREATE POLICY projects_write ON public.projects FOR ALL TO authenticated
USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) IN ('project_manager','pm','sales'))
WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) IN ('project_manager','pm','sales'));

DROP POLICY IF EXISTS authenticated_full_access ON public.followups;
CREATE POLICY followups_read ON public.followups FOR SELECT TO authenticated
USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) IN ('project_manager','pm','sales','marketing'));
CREATE POLICY followups_write ON public.followups FOR ALL TO authenticated
USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) IN ('project_manager','pm','sales'))
WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) IN ('project_manager','pm','sales'));