-- Safe stop: preserve populated columns and audit. Do NOT drop columns or revert
-- blindly to legacy notes: post-migration states may exist only in columns.
-- Run only after owner approval; blocks new dedicated writes without widening RLS.
REVOKE EXECUTE ON FUNCTION public.company_set_marketing_status(uuid,text,jsonb,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.company_set_marketing_status(uuid,text,jsonb,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.company_marketing_from_sent(uuid,uuid,uuid) FROM service_role;
-- Keep both protection and audit triggers installed. Restore application reads
-- to a version that still prefers structured state; existing notes are unchanged.
-- Recovery, after validation:
-- GRANT EXECUTE ON FUNCTION public.company_set_marketing_status(uuid,text,jsonb,uuid,text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.company_marketing_from_sent(uuid,uuid,uuid) TO service_role;