DO $$
DECLARE before_leads jsonb; before_other jsonb; removed integer;
BEGIN
  LOCK TABLE public.followups IN SHARE ROW EXCLUSIVE MODE;
  SELECT jsonb_agg(to_jsonb(l) ORDER BY id) INTO before_leads FROM public.leads l;
  SELECT jsonb_agg(to_jsonb(f) ORDER BY id) INTO before_other FROM public.followups f WHERE id NOT IN ('0d733570-433b-4b24-b6c3-950366a8b8b0','a910add0-f66d-4335-87eb-0b20d74770de','346b65f3-6e19-4ad3-9d9b-d4e5eb21911a');
  IF (SELECT count(*) FROM public.followups WHERE
    (id='0d733570-433b-4b24-b6c3-950366a8b8b0' AND lead_id='e1d4afb6-3ba6-4ea6-b04e-4ef1a0b045b0' AND company_id='342a4576-4a1b-561e-985b-302d98a71b9a' AND followup_type='meeting' AND due_date='2026-11-04T12:00:00Z' AND created_at='2026-10-30T11:23:22.848063Z' AND result='Találkozó Felmérésre' AND assigned_to='99551050-d92f-4b57-9cf7-b641f1571429' AND completed AND project_id IS NULL AND quote_id IS NULL AND assigned_agent_id IS NULL)
    OR (id='a910add0-f66d-4335-87eb-0b20d74770de' AND lead_id='e1d4afb6-3ba6-4ea6-b04e-4ef1a0b045b0' AND company_id='342a4576-4a1b-561e-985b-302d98a71b9a' AND followup_type='meeting' AND due_date='2026-11-04T12:00:00Z' AND created_at='2026-10-30T14:17:19.021604Z' AND result='Bejárás VBF JEGYZŐKÖNYV' AND assigned_to='99551050-d92f-4b57-9cf7-b641f1571429' AND completed AND project_id IS NULL AND quote_id IS NULL AND assigned_agent_id IS NULL)
    OR (id='346b65f3-6e19-4ad3-9d9b-d4e5eb21911a' AND lead_id='8e70667a-d30c-425d-81f6-962bafb7a896' AND company_id='e127c582-5b86-4281-88c8-038ceef007b2' AND followup_type='call' AND due_date='2026-11-05T10:20:00Z' AND created_at='2026-11-03T10:20:51.899747Z' AND result IS NULL AND assigned_to='401cc133-10bd-494b-aa49-28ee14b3266e' AND completed AND project_id IS NULL AND quote_id IS NULL AND assigned_agent_id IS NULL)) <> 3 THEN RAISE EXCEPTION 'Approved activity snapshot mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.followup_events WHERE followup_id IN ('0d733570-433b-4b24-b6c3-950366a8b8b0','a910add0-f66d-4335-87eb-0b20d74770de','346b65f3-6e19-4ad3-9d9b-d4e5eb21911a')) THEN RAISE EXCEPTION 'Unexpected linked events'; END IF;
  DELETE FROM public.followups WHERE id IN ('0d733570-433b-4b24-b6c3-950366a8b8b0','a910add0-f66d-4335-87eb-0b20d74770de','346b65f3-6e19-4ad3-9d9b-d4e5eb21911a');
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 3 THEN RAISE EXCEPTION 'Expected exactly three deleted rows'; END IF;
  IF before_leads IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.leads l) THEN RAISE EXCEPTION 'Lead data changed'; END IF;
  IF before_other IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.followups f) THEN RAISE EXCEPTION 'Other activities changed'; END IF;
END $$;