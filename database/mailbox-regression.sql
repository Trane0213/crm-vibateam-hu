-- Read-only acceptance assertions against real mailboxes, under actual RLS.
-- No CRM rows, credentials, roles or Gmail messages are modified.
DO $$
DECLARE info_result jsonb; laci_result jsonb; ramon_result jsonb; all_result jsonb; own_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','99551050-d92f-4b57-9cf7-b641f1571429',true);
  PERFORM set_config('request.jwt.claims','{"sub":"99551050-d92f-4b57-9cf7-b641f1571429","role":"authenticated"}',true);
  SET LOCAL ROLE authenticated;
  info_result := public.crm_mailbox_page('info@vibateam.hu','all','',0);
  laci_result := public.crm_mailbox_page('pretor.laszlo@vibateam.hu','all','',0);
  ramon_result := public.crm_mailbox_page('ramon.dencsi@vibateam.hu','all','',0);
  all_result := public.crm_mailbox_page(NULL,'all','',0);
  IF (info_result->'counts'->>'messages')::integer <= 2000 THEN RAISE EXCEPTION 'Info history truncated'; END IF;
  IF (laci_result->'counts'->>'messages')::integer < 523 THEN RAISE EXCEPTION 'Laci history missing'; END IF;
  IF (laci_result->'counts'->>'all')::integer < 415 THEN RAISE EXCEPTION 'Laci threads missing'; END IF;
  IF (ramon_result->'counts'->>'all')::integer <> 44 THEN RAISE EXCEPTION 'Ramon thread count mismatch'; END IF;
  IF jsonb_array_length(info_result->'rows') <> 50 THEN RAISE EXCEPTION 'Server pagination failed'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(laci_result->'rows') r CROSS JOIN LATERAL jsonb_array_elements(r->'mailboxes') m WHERE m->>'email'<>'pretor.laszlo@vibateam.hu') THEN RAISE EXCEPTION 'Cross-mailbox leak'; END IF;
  IF (public.crm_mailbox_page('pretor.laszlo@vibateam.hu','all','this-search-cannot-match-20261030-mailbox-regression',0)->>'total')::integer<>0 THEN RAISE EXCEPTION 'Search not applied'; END IF;
  IF public.crm_mailbox_page('info@vibateam.hu','all','',1)->'rows'->0->>'thread_id'=info_result->'rows'->0->>'thread_id' THEN RAISE EXCEPTION 'Pagination repeats first row'; END IF;
  RAISE NOTICE 'Owner mailbox counts: info %, laci %, ramon %',info_result->'counts',laci_result->'counts',ramon_result->'counts';

  PERFORM set_config('request.jwt.claim.sub','c9831c35-d922-4217-8535-6c57f5a826e3',true);
  PERFORM set_config('request.jwt.claims','{"sub":"c9831c35-d922-4217-8535-6c57f5a826e3","role":"authenticated"}',true);
  own_result := public.crm_mailbox_page('pretor.laszlo@vibateam.hu','all','',0);
  IF own_result->'counts' <> laci_result->'counts' THEN RAISE EXCEPTION 'Laci RLS hides own history'; END IF;
  -- Laci currently has owner privileges; preserve that existing assignment.
  IF public.crm_role_of(auth.uid())<>'owner' THEN RAISE EXCEPTION 'Laci role changed'; END IF;
  PERFORM public.crm_mailbox_page('info@vibateam.hu','all','',0);

  PERFORM set_config('request.jwt.claim.sub','401cc133-10bd-494b-aa49-28ee14b3266e',true);
  PERFORM set_config('request.jwt.claims','{"sub":"401cc133-10bd-494b-aa49-28ee14b3266e","role":"authenticated"}',true);
  own_result := public.crm_mailbox_page('ramon.dencsi@vibateam.hu','all','',0);
  IF own_result->'counts' <> ramon_result->'counts' THEN RAISE EXCEPTION 'Ramon RLS hides own history'; END IF;
  BEGIN
    PERFORM public.crm_mailbox_page('pretor.laszlo@vibateam.hu','all','',0);
    RAISE EXCEPTION 'Ramon accessed Laci mailbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.crm_mailbox_page(NULL,'all','',0);
    RAISE EXCEPTION 'Ramon accessed all mailboxes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF jsonb_array_length(public.crm_mailboxes())<>1 THEN RAISE EXCEPTION 'Ramon sees another account'; END IF;
  RAISE NOTICE 'Mailbox isolation, staff RLS, full history, counts, search and pagination passed';
  RESET ROLE;
END $$;