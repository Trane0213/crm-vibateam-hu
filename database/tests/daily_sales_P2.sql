-- Isolated scratch only. No production.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE postgres SUPERUSER LOGIN;
CREATE TABLE public.ai_memory(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,subject_type text NOT NULL,subject_id uuid NOT NULL,
scope text NOT NULL,key text NOT NULL,value jsonb NOT NULL,source text,created_by uuid NOT NULL,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
UNIQUE(subject_type,subject_id,scope,key,created_by));
GRANT ALL ON ai_memory TO authenticated,service_role;
SET ROLE postgres;
\i database/ai_os_daily_sales_P2_2026-11-03.sql
DO $$
DECLARE u uuid:='00000000-0000-4000-8000-000000000001'; b jsonb; c jsonb; f jsonb;
BEGIN
 b:=ai_os_daily_sales_claim(u,'automatic');
 IF NOT (b->>'claimed')::boolean THEN RAISE EXCEPTION 'first claim'; END IF;
 c:=ai_os_daily_sales_claim(u,'automatic');
 IF (c->>'claimed')::boolean THEN RAISE EXCEPTION 'duplicate claim'; END IF;
 f:=ai_os_daily_sales_finish(u,b->>'cache_key',(b->>'execution_token')::uuid,'unknown','{}');
 c:=ai_os_daily_sales_claim(u,'automatic');
 IF (c->>'claimed')::boolean THEN RAISE EXCEPTION 'auto retry after failure'; END IF;
 c:=ai_os_daily_sales_claim(u,'manual');
 IF NOT (c->>'claimed')::boolean THEN RAISE EXCEPTION 'manual blocked'; END IF;
 BEGIN
  PERFORM ai_os_daily_sales_finish(u,b->>'cache_key',(b->>'execution_token')::uuid,'ready','{}');
  RAISE EXCEPTION 'old token accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='old token accepted' THEN RAISE; END IF; END;
 PERFORM ai_os_daily_sales_finish(u,c->>'cache_key',(c->>'execution_token')::uuid,'ready','{}');
 c:=ai_os_daily_sales_claim(u,'automatic');
 IF (c->>'claimed')::boolean THEN RAISE EXCEPTION 'reopen generated'; END IF;
 c:=ai_os_daily_sales_claim('00000000-0000-4000-8000-000000000002','automatic');
 IF NOT (c->>'claimed')::boolean THEN RAISE EXCEPTION 'users not isolated'; END IF;
 IF has_function_privilege('authenticated','public.ai_os_daily_sales_claim(uuid,text)','execute') THEN RAISE EXCEPTION 'client claim allowed'; END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  DELETE FROM ai_memory WHERE key LIKE 'system:daily-sales:%';
  RAISE EXCEPTION 'client deletion allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE ai_memory SET key='renamed' WHERE key LIKE 'system:daily-sales:%';
  RAISE EXCEPTION 'client rename allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 INSERT INTO ai_memory(subject_type,subject_id,scope,key,value,created_by) VALUES('user','00000000-0000-4000-8000-000000000001','private','ordinary','{}','00000000-0000-4000-8000-000000000001');
 BEGIN
  UPDATE ai_memory SET key='system:daily-sales:forged' WHERE key='ordinary';
  RAISE EXCEPTION 'forged key allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO ai_memory(subject_type,subject_id,scope,key,value,created_by) VALUES('user','00000000-0000-4000-8000-000000000001','private','system:daily-sales:forged','{}','00000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'client insertion allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'P2 SQL rules PASS' AS result;