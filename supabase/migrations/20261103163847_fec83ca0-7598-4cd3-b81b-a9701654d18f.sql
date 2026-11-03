CREATE OR REPLACE FUNCTION public.ai_os_daily_sales_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (TG_OP<>'INSERT' AND OLD.key LIKE 'system:daily-sales:%') OR (TG_OP<>'DELETE' AND NEW.key LIKE 'system:daily-sales:%') THEN
  IF current_user NOT IN ('postgres','service_role') THEN RAISE EXCEPTION 'Reserved daily cache' USING ERRCODE='42501'; END IF;
  IF TG_OP<>'DELETE' AND (NEW.scope<>'private' OR NEW.subject_type<>'user' OR NEW.subject_id IS DISTINCT FROM NEW.created_by) THEN RAISE EXCEPTION 'Invalid daily cache ownership'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_os_daily_sales_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ai_memory FOR EACH ROW EXECUTE FUNCTION public.ai_os_daily_sales_guard();
CREATE OR REPLACE FUNCTION public.ai_os_daily_sales_read(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
 SELECT value INTO v FROM ai_memory WHERE subject_type='user' AND subject_id=p_user AND scope='private' AND created_by=p_user AND key='system:daily-sales:'||to_char(clock_timestamp() AT TIME ZONE 'Europe/Budapest','YYYY-MM-DD');
 RETURN coalesce(v,jsonb_build_object('status','empty'));
END $$;
CREATE OR REPLACE FUNCTION public.ai_os_daily_sales_claim(p_user uuid,p_intent text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; v jsonb; active jsonb; t uuid:=gen_random_uuid();
BEGIN
 IF p_user IS NULL OR p_intent IS NULL OR p_intent NOT IN ('automatic','manual') THEN RAISE EXCEPTION 'Invalid daily request'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('daily-sales:'||p_user::text,0));
 k:='system:daily-sales:'||to_char(clock_timestamp() AT TIME ZONE 'Europe/Budapest','YYYY-MM-DD');
 SELECT value INTO active FROM ai_memory WHERE subject_type='user' AND subject_id=p_user AND scope='private' AND created_by=p_user AND key LIKE 'system:daily-sales:%' AND value->>'status'='running' AND (value->>'lease_until')::timestamptz>clock_timestamp() ORDER BY updated_at DESC LIMIT 1;
 IF active IS NOT NULL THEN RETURN jsonb_build_object('claimed',false,'state',active); END IF;
 SELECT value INTO v FROM ai_memory WHERE subject_type='user' AND subject_id=p_user AND scope='private' AND created_by=p_user AND key=k;
 IF p_intent='automatic' AND (coalesce((v->>'auto_used')::boolean,false) OR v->>'status'='ready') THEN
  IF v->>'status'='running' THEN v:=v||jsonb_build_object('status','unknown'); END IF;
  RETURN jsonb_build_object('claimed',false,'state',v);
 END IF;
 v:=coalesce(v,'{}'::jsonb)||jsonb_build_object('status','running','auto_used',coalesce((v->>'auto_used')::boolean,false) OR p_intent='automatic','execution_token',t,'started_at',clock_timestamp(),'lease_until',clock_timestamp()+interval '5 minutes','error',null);
 INSERT INTO ai_memory(subject_type,subject_id,scope,key,value,source,created_by) VALUES('user',p_user,'private',k,v,'system:daily-sales',p_user)
 ON CONFLICT(subject_type,subject_id,scope,key,created_by) DO UPDATE SET value=excluded.value;
 RETURN jsonb_build_object('claimed',true,'cache_key',k,'execution_token',t,'state',v);
END $$;
CREATE OR REPLACE FUNCTION public.ai_os_daily_sales_finish(p_user uuid,p_key text,p_execution_token uuid,p_status text,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb;
BEGIN
 IF p_status IS NULL OR p_status NOT IN ('ready','failed','unknown') OR p_key NOT LIKE 'system:daily-sales:%' OR p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>24000 THEN RAISE EXCEPTION 'Invalid daily result'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('daily-sales:'||p_user::text,0));
 SELECT value INTO v FROM ai_memory WHERE subject_type='user' AND subject_id=p_user AND scope='private' AND created_by=p_user AND key=p_key FOR UPDATE;
 IF v IS NULL OR v->>'status'<>'running' OR v->>'execution_token' IS DISTINCT FROM p_execution_token::text THEN RAISE EXCEPTION 'Invalid daily execution'; END IF;
 v:=v||jsonb_build_object('status',p_status,'finished_at',clock_timestamp(),'result',p_result);
 UPDATE ai_memory SET value=v WHERE subject_type='user' AND subject_id=p_user AND scope='private' AND created_by=p_user AND key=p_key;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.ai_os_daily_sales_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_os_daily_sales_read(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_os_daily_sales_claim(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.ai_os_daily_sales_finish(uuid,text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_os_daily_sales_read(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_os_daily_sales_claim(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_os_daily_sales_finish(uuid,text,uuid,text,jsonb) TO service_role;