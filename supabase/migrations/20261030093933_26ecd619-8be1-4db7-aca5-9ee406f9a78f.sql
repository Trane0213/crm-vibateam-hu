CREATE OR REPLACE FUNCTION public.crm_lookup_normalize(p_text text) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=public AS $$ SELECT translate(lower(p_text),'áéíóöőúüű','aeiooouuu') $$;
REVOKE ALL ON FUNCTION public.crm_lookup_normalize(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_lookup_normalize(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.crm_record_search(p_source text,p_search text DEFAULT '',p_page integer DEFAULT 0,p_id uuid DEFAULT NULL,p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE source_sql text; filter_sql text:=''; result jsonb; k text; v jsonb; permitted text[];
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bejelentkezés szükséges' USING ERRCODE='42501'; END IF;
IF p_page<0 OR p_page>100000 OR length(coalesce(p_search,''))>200 OR jsonb_typeof(p_filters)<>'object' THEN RAISE EXCEPTION 'Érvénytelen keresés'; END IF;
CASE p_source
WHEN 'companies' THEN source_sql:='SELECT c.id, c.name label, concat_ws('' · '',c.tax_number,c.website) detail, jsonb_build_object(''name'',c.name) fields FROM public.companies c'; permitted:=ARRAY[]::text[];
WHEN 'contacts' THEN source_sql:='SELECT c.id,c.name label,concat_ws('' · '',co.name,c.email) detail,jsonb_build_object(''company_id'',c.company_id,''name'',c.name) fields FROM public.contacts c LEFT JOIN public.companies co ON co.id=c.company_id'; permitted:=ARRAY['company_id'];
WHEN 'projects' THEN source_sql:='SELECT p.id,p.title label,concat_ws('' · '',c.name,p.address) detail,jsonb_build_object(''company_id'',p.company_id,''title'',p.title) fields FROM public.projects p LEFT JOIN public.companies c ON c.id=p.company_id'; permitted:=ARRAY['company_id'];
WHEN 'leads' THEN source_sql:='SELECT l.id,coalesce(nullif(l.summary,''''),c.name,''Érdeklődő'') label,concat_ws('' · '',c.name,ct.name) detail,jsonb_build_object(''company_id'',l.company_id,''summary'',l.summary) fields FROM public.leads l LEFT JOIN public.companies c ON c.id=l.company_id LEFT JOIN public.contacts ct ON ct.id=l.contact_id'; permitted:=ARRAY['company_id'];
WHEN 'quotes' THEN source_sql:='SELECT q.id,coalesce(nullif(q.title,''''),''Ajánlat'')||'' · v''||q.version label,concat_ws('' · '',c.name,p.title) detail,jsonb_build_object(''project_id'',q.project_id,''lead_id'',q.lead_id,''version'',q.version,''status'',q.status,''title'',q.title,''total_amount'',q.total_amount,''created_at'',q.created_at) fields FROM public.quotes q LEFT JOIN public.projects p ON p.id=q.project_id LEFT JOIN public.leads l ON l.id=q.lead_id LEFT JOIN public.companies c ON c.id=coalesce(p.company_id,l.company_id)'; permitted:=ARRAY['project_id','lead_id'];
WHEN 'users_profile' THEN source_sql:='SELECT p.id,coalesce(p.full_name,p.email) label,p.email detail,jsonb_build_object(''full_name'',p.full_name,''active'',p.active,''role_id'',p.role_id,''auth_user_id'',p.auth_user_id) fields FROM public.users_profile p'; permitted:=ARRAY['active','role_id'];
WHEN 'users_profile_lookup' THEN source_sql:='SELECT p.id,coalesce(p.full_name,p.email) label,p.email detail,jsonb_build_object(''full_name'',p.full_name,''active'',p.active,''role_id'',p.role_id,''auth_user_id'',p.auth_user_id) fields FROM public.users_profile_lookup p'; permitted:=ARRAY['active','role_id'];
WHEN 'auth_users' THEN source_sql:='SELECT p.auth_user_id id,coalesce(p.full_name,p.email) label,p.email detail,jsonb_build_object(''full_name'',p.full_name,''active'',p.active,''role_id'',p.role_id) fields FROM public.users_profile p WHERE p.auth_user_id IS NOT NULL'; permitted:=ARRAY['active','role_id'];
WHEN 'v_sales_user_load' THEN source_sql:='SELECT p.user_id id,p.full_name label,p.email detail,jsonb_build_object(''active_lead_count'',p.active_lead_count) fields FROM public.v_sales_user_load p'; permitted:=ARRAY[]::text[];
WHEN 'attendance_workers' THEN source_sql:='SELECT w.id,w.full_name label,''''::text detail,jsonb_build_object(''is_active'',w.is_active,''full_name'',w.full_name) fields FROM public.attendance_workers w'; permitted:=ARRAY['is_active'];
WHEN 'attendance_projects' THEN source_sql:='SELECT p.id,p.name label,''''::text detail,jsonb_build_object(''is_active'',p.is_active,''name'',p.name) fields FROM public.attendance_projects p'; permitted:=ARRAY['is_active'];
WHEN 'email_threads' THEN source_sql:='SELECT t.id,coalesce(t.subject,''(Nincs tárgy)'') label,concat_ws('' · '',c.name,t.last_message_at::text) detail,jsonb_build_object(''project_id'',t.project_id,''company_id'',t.company_id) fields FROM public.email_threads t LEFT JOIN public.companies c ON c.id=t.company_id'; permitted:=ARRAY['project_id','company_id'];
ELSE RAISE EXCEPTION 'Nem támogatott rekordtípus'; END CASE;
FOR k,v IN SELECT * FROM jsonb_each(p_filters) LOOP
IF NOT k=ANY(permitted) OR jsonb_typeof(v) NOT IN ('string','boolean','null','array') THEN RAISE EXCEPTION 'Érvénytelen szűrő'; END IF;
IF jsonb_typeof(v)='array' THEN filter_sql:=filter_sql||format(' AND fields->>%L IN (SELECT jsonb_array_elements_text(%L::jsonb))',k,v::text);
ELSIF v='null'::jsonb THEN filter_sql:=filter_sql||format(' AND (fields->>%L) IS NULL',k);
ELSE filter_sql:=filter_sql||format(' AND fields->>%L=%L',k,v#>>'{}'); END IF;
END LOOP;
EXECUTE 'WITH records AS ('||source_sql||'), matching AS (SELECT * FROM records WHERE ($1 IS NULL OR id=$1) AND ($1 IS NOT NULL OR position(public.crm_lookup_normalize($2) IN public.crm_lookup_normalize(concat_ws('' '',label,detail,id::text)))>0)'||filter_sql||'), page AS (SELECT * FROM matching ORDER BY public.crm_lookup_normalize(label),id LIMIT 21 OFFSET $3*20) SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(jsonb_build_object(''value'',id,''label'',label,''detail'',detail,''fields'',fields) ORDER BY public.crm_lookup_normalize(label),id) FROM (SELECT * FROM page LIMIT 20) r),''[]''::jsonb),''hasMore'',(SELECT count(*)>20 FROM page))' INTO result USING p_id,coalesce(p_search,''),p_page;
RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_record_search(text,text,integer,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_record_search(text,text,integer,uuid,jsonb) TO authenticated,service_role;