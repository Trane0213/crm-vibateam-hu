-- Run only in an isolated scratch PostgreSQL database, never production.
-- Fixture schema for the actual migration functions, no customer data.
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE public.leads(id uuid PRIMARY KEY);
CREATE TABLE public.quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid, project_id uuid, version int,
 is_current boolean, status text, title text, valid_until date, notes text,
 discount_percent numeric, tax_percent numeric, quote_kind text, scope_type text, scope_note text,
 contact_id uuid, responsible_user_id uuid, request_due_date date, offer_due_date date,
 manual_net_amount numeric, technical_scope text, exclusions text,
 group_id uuid, alternative_key text, alternative_label text, locked_at timestamptz, sent_at timestamptz,
 template_key text, template_version int, template_terms jsonb NOT NULL DEFAULT '{}', site_address text,
 created_at timestamptz DEFAULT now()
);
CREATE TABLE public.quote_items(quote_id uuid, name text, quantity numeric, unit text, unit_price numeric, section text, created_at timestamptz DEFAULT now());
CREATE TABLE public.quote_sends(quote_id uuid, status text, gmail_message_id text, sent_at timestamptz);
GRANT SELECT,INSERT,UPDATE ON public.quotes,public.leads,public.quote_items TO authenticated;
GRANT SELECT ON public.quote_sends TO authenticated;
\ir ../../supabase/migrations/V21_MIGRATION_FILE
DO $$
DECLARE a uuid; b uuid; n uuid; alt uuid; g uuid:=gen_random_uuid(); due timestamptz:='2026-11-03 14:36:47.233+00'; r record;
BEGIN
 INSERT INTO quotes(title,group_id,alternative_key,version,is_current,status,template_key,template_version,template_terms,site_address)
 VALUES ('TESZT A',g,'A',1,true,'draft','private',3,'{"payment":"A feltétel"}','A helyszín') RETURNING id INTO a;
 INSERT INTO quotes(title,group_id,alternative_key,version,is_current,status,template_key,template_version,template_terms,site_address)
 VALUES ('TESZT B',g,'B',1,true,'draft','b2b',7,'{"payment":"B feltétel"}','B helyszín') RETURNING id INTO b;
 n:=quote_new_version(a);
 SELECT * INTO r FROM quotes WHERE id=n;
 IF r.template_key<>'private' OR r.template_version<>3 OR r.template_terms<>'{"payment":"A feltétel"}'::jsonb OR r.site_address<>'A helyszín' THEN RAISE EXCEPTION 'FAIL source version template'; END IF;
 alt:=quote_new_alternative(a,'TESZT C');
 SELECT * INTO r FROM quotes WHERE id=alt;
 IF r.template_key<>'private' OR r.template_version<>3 OR r.template_terms<>'{"payment":"A feltétel"}'::jsonb OR r.site_address<>'A helyszín' THEN RAISE EXCEPTION 'FAIL source alternative template'; END IF;
 BEGIN PERFORM quote_lock_sent(n); RAISE EXCEPTION 'FAIL false lock accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE quotes SET sent_at=due,status='sent' WHERE id=n; RAISE EXCEPTION 'FAIL invented sent timestamp'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE quotes SET locked_at=due WHERE id=n; RAISE EXCEPTION 'FAIL direct lock accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO quote_sends VALUES(n,'failed','gmail-id',due);
 BEGIN PERFORM quote_lock_sent(n); RAISE EXCEPTION 'FAIL failed send accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO quote_sends VALUES(n,'sending','gmail-id',due);
 BEGIN PERFORM quote_lock_sent(n); RAISE EXCEPTION 'FAIL pending send accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO quote_sends VALUES(n,'sent',NULL,due);
 BEGIN PERFORM quote_lock_sent(n); RAISE EXCEPTION 'FAIL missing Gmail evidence'; EXCEPTION WHEN check_violation THEN NULL; END;
 INSERT INTO quote_sends VALUES(n,'sent','gmail-proof',due);
 PERFORM quote_lock_sent(n);
 SELECT * INTO r FROM quotes WHERE id=n;
 IF r.status<>'sent' OR r.sent_at<>due OR r.locked_at<>due THEN RAISE EXCEPTION 'FAIL successful send transition'; END IF;
 INSERT INTO quote_sends VALUES(alt,'recorded','gmail-link-proof',due);
 PERFORM quote_lock_sent(alt);
 IF (SELECT status FROM quotes WHERE id=alt)<>'sent' THEN RAISE EXCEPTION 'FAIL recorded Gmail transition'; END IF;
 -- Existing sent rows remain untouched by this migration/tested guard on unrelated updates.
 UPDATE quotes SET is_current=false WHERE id=n;
 IF (SELECT template_terms FROM quotes WHERE id=a)<>'{"payment":"A feltétel"}'::jsonb THEN RAISE EXCEPTION 'FAIL source mutated'; END IF;
 RAISE NOTICE 'PASS: exact version/alternative source (4 fields), false lock, forged timestamp, failed/pending/missing proof, sent/recorded proof, unchanged source';
END $$;
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN INSERT INTO quote_sends VALUES(gen_random_uuid(),'sent','fake',now()); RAISE EXCEPTION 'FAIL client forged send log'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;