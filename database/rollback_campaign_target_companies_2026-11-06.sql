-- Freeze target-company writes; preserve saved membership and audit.
revoke execute on function public.campaign_add_target_company(uuid,uuid,timestamptz) from authenticated;