-- Safe suspension: preserve every row and do not restore ambiguous auto-linking.
REVOKE EXECUTE ON FUNCTION public.website_request_intake(uuid,uuid) FROM service_role;
-- Restore execution only after the guarded function is verified through a new approved migration.