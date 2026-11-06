-- Freeze new imports; preserve source snapshots, HTML, original copy and audit.
revoke execute on function public.campaign_import_gmail_source(uuid,uuid,timestamptz,text,text,text,jsonb) from service_role;
-- Keep guard and nullable fields. Never restore a legacy plain-text sender on HTML campaigns.