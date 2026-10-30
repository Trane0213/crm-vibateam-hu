DO $$ DECLARE definition text; BEGIN
SELECT pg_get_functiondef('public.crm_record_search(text,text,integer,uuid,jsonb)'::regprocedure) INTO definition;
definition := replace(definition, 'jsonb_build_object(''is_active'',w.is_active,''full_name'',w.full_name)', 'jsonb_build_object(''is_active'',w.is_active,''full_name'',w.full_name,''daily_rate'',w.daily_rate)');
definition := replace(definition, 'concat_ws('''' · '''',c.name,t.last_message_at::text)', 'concat_ws('''' · '''',c.name,array_to_string(t.participants,'''' , ''''),t.last_message_at::text)');
EXECUTE definition;
END $$;