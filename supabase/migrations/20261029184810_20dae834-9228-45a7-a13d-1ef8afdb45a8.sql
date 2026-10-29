ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS gmail_auth_error text,
  ADD COLUMN IF NOT EXISTS gmail_auth_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS gmail_next_retry_at timestamptz;
GRANT SELECT (gmail_auth_error, gmail_auth_error_at, gmail_next_retry_at) ON public.users_profile TO authenticated;