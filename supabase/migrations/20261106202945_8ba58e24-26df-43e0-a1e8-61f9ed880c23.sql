DROP FUNCTION public.issue_report_verdict(uuid,text,text);
CREATE FUNCTION public.issue_report_verdict(_id uuid, _user uuid, _verdict text, _feedback text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.issue_reports;
BEGIN
 IF _user IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
 IF _verdict NOT IN ('resolved','not_resolved') OR length(coalesce(_feedback,'')) > 1000 THEN RAISE EXCEPTION 'Invalid verdict' USING ERRCODE = '22023'; END IF;
 SELECT * INTO r FROM public.issue_reports WHERE id = _id FOR UPDATE;
 IF NOT FOUND OR r.reporter_id <> _user THEN RAISE EXCEPTION 'Not found' USING ERRCODE = '42501'; END IF;
 IF r.status <> 'checking' THEN RAISE EXCEPTION 'Report is not awaiting verification' USING ERRCODE = '55000'; END IF;
 UPDATE public.issue_reports SET reporter_verdict = _verdict, reporter_feedback = coalesce(_feedback,''), reporter_verdict_at = clock_timestamp(),
   status = CASE WHEN _verdict = 'resolved' THEN 'closed' ELSE 'investigating' END WHERE id = _id;
END $$;
REVOKE ALL ON FUNCTION public.issue_report_verdict(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_report_verdict(uuid,uuid,text,text) TO service_role;