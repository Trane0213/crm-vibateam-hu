DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.crm_record_search(text,text,integer,uuid,jsonb)'::regprocedure) INTO definition;
definition := replace(definition, $old$jsonb_build_object(''is_active'',w.is_active,''full_name'',w.full_name)$old$, $new$jsonb_build_object(''is_active'',w.is_active,''full_name'',w.full_name,''daily_rate'',w.daily_rate)$new$);
IF position($needle$''daily_rate'',w.daily_rate$needle$ in definition)=0 THEN RAISE EXCEPTION 'Worker daily rate projection missing'; END IF;
EXECUTE definition;
END $$;