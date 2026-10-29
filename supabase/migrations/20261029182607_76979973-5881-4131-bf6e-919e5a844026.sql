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

  IF v_caller IS NOT NULL THEN
    v_caller_role := public.crm_role_of(v_caller);
    IF NOT (public.is_owner_role(v_caller)
            OR (v_caller_role = 'sales' AND v_assigned = v_caller)) THEN
      RAISE EXCEPTION 'Nincs jogosultság a lead megnyeréséhez' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_entered IS NULL OR v_status <> 'contract' THEN
    RAISE EXCEPTION 'Csak szerződés fázisú pipeline lead nyerhető meg (jelenlegi: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

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