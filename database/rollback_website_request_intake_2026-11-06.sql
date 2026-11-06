-- Disable writes, retain all receipts, rows and audit. UI must disable creation, never restore legacy inserts.
revoke execute on function public.website_request_intake(uuid,uuid) from service_role;