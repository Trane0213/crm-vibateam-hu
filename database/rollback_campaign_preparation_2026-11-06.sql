-- Disable the new preparation endpoint; preserve all saved copy, selections and guards.
revoke execute on function public.campaign_store_preparation(uuid,uuid,timestamptz,jsonb,boolean) from service_role,authenticated,anon,public;
-- Restore application to the prior non-send panel only after exporting new copy/selections.
-- Do not drop columns/rows or broaden policies. baseline.txt records the exact prior state.