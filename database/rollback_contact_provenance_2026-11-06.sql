-- Owner-approved safe stop; preserve columns, audit and invalidation guard.
REVOKE EXECUTE ON FUNCTION public.contact_set_provenance(uuid,jsonb,text,text,text,text) FROM authenticated;
-- No column removal or permission widening. Keep reads compatible with saved data.
-- Recovery after validation:
-- GRANT EXECUTE ON FUNCTION public.contact_set_provenance(uuid,jsonb,text,text,text,text) TO authenticated;