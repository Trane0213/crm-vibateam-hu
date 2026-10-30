-- ISOLATED DATABASE ONLY. Never execute fixture writes against production.
-- Load crm_record_search and crm_lookup_normalize migrations before this test.
BEGIN;
CREATE TABLE public.companies(id uuid PRIMARY KEY,name text,tax_number text,website text,visible_to uuid);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_visibility ON public.companies TO authenticated USING (visible_to IS NULL OR visible_to=auth.uid());
INSERT INTO public.companies
SELECT ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
CASE WHEN i=5000 THEN 'Amper Studio' WHEN i=4999 THEN 'Árvíztűrő Tükörfúrógép' ELSE 'TESZT Cég '||lpad(i::text,4,'0') END,
NULL,NULL,CASE WHEN i=4998 THEN '11111111-1111-4111-8111-111111111111'::uuid END
FROM generate_series(1,5000) i;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$ DECLARE page jsonb; n integer:=0; i integer; ids uuid[]:=ARRAY[]::uuid[]; BEGIN
IF public.crm_lookup_normalize('ÁÉÍÓÖŐÚÜŰ')<>'aeiooouuu' THEN RAISE EXCEPTION 'Accent normalization'; END IF;
IF public.crm_record_search('companies','aMpEr')->'rows'->0->>'label'<>'Amper Studio' THEN RAISE EXCEPTION '5000th partial search'; END IF;
IF public.crm_record_search('companies','arvizturo tukorfurogep')->'rows'->0->>'label'<>'Árvíztűrő Tükörfúrógép' THEN RAISE EXCEPTION 'Accented partial search'; END IF;
FOR i IN 0..249 LOOP
page:=public.crm_record_search('companies','',i);
IF jsonb_array_length(page->'rows')<>20 THEN RAISE EXCEPTION 'Page size at %',i; END IF;
IF (page->>'hasMore')::boolean IS DISTINCT FROM (i<249) THEN RAISE EXCEPTION 'HasMore at %',i; END IF;
ids:=ids||ARRAY(SELECT (r->>'value')::uuid FROM jsonb_array_elements(page->'rows') r);
n:=n+jsonb_array_length(page->'rows');
END LOOP;
IF n<>5000 OR (SELECT count(DISTINCT id) FROM unnest(ids) id)<>5000 THEN RAISE EXCEPTION 'Incomplete/duplicate pagination'; END IF;
IF jsonb_array_length(public.crm_record_search('companies','',250)->'rows')<>0 THEN RAISE EXCEPTION 'Past last page'; END IF;
IF public.crm_record_search('companies','no match',0,'00000000-0000-4000-8000-000000005000')->'rows'->0->>'label'<>'Amper Studio' THEN RAISE EXCEPTION 'Selected id independent of search'; END IF;
PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
IF jsonb_array_length(public.crm_record_search('companies','',0,'00000000-0000-4000-8000-000000004998')->'rows')<>0 THEN RAISE EXCEPTION 'Hidden RLS row leaked'; END IF;
RAISE NOTICE 'PASS: 5000 rows, 250 pages, partial/case/accent search, selected id and isolated RLS';
END $$;
RESET ROLE;
ROLLBACK;