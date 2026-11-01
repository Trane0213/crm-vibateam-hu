DROP POLICY IF EXISTS authenticated_full_access ON public.quote_requests;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.quote_requests FROM anon, authenticated;