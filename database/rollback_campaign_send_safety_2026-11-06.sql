-- Keep suppression and send evidence; stop new dispatch and editing endpoints.
revoke execute on function public.campaign_test_claim(uuid,uuid,timestamptz,text,text) from service_role;
revoke execute on function public.contact_set_marketing_suppression(uuid,text,uuid,boolean,text) from authenticated;
-- Retain finish endpoint to reconcile already claimed outcomes; no retries.