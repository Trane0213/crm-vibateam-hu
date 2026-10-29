CREATE SCHEMA IF NOT EXISTS private_backup;
REVOKE ALL ON SCHEMA private_backup FROM anon, authenticated, public;
CREATE TABLE IF NOT EXISTS private_backup.users_profile_20261029 AS SELECT * FROM public.users_profile;

-- users_profile
DROP POLICY IF EXISTS users_profile_auth ON public.users_profile;
REVOKE ALL ON public.users_profile FROM anon, authenticated;
GRANT SELECT (id, auth_user_id, email, full_name, phone, role_id, active, created_at, gmail_email, gmail_last_sync_at) ON public.users_profile TO authenticated;
GRANT INSERT (auth_user_id, email, full_name, active) ON public.users_profile TO authenticated;
GRANT UPDATE (full_name, phone, role_id, active, email) ON public.users_profile TO authenticated;
GRANT DELETE ON public.users_profile TO authenticated;
GRANT ALL ON public.users_profile TO service_role;

CREATE POLICY users_profile_select ON public.users_profile FOR SELECT TO authenticated USING (true);
CREATE POLICY users_profile_insert_self ON public.users_profile FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid() AND role_id IS NULL);
CREATE POLICY users_profile_update ON public.users_profile FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_owner_role(auth.uid()))
  WITH CHECK (auth_user_id = auth.uid() OR public.is_owner_role(auth.uid()));
CREATE POLICY users_profile_delete_owner ON public.users_profile FOR DELETE TO authenticated
  USING (public.is_owner_role(auth.uid()));

CREATE OR REPLACE FUNCTION public.users_profile_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_owner_role(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.role_id IS DISTINCT FROM OLD.role_id
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'Szerepkört, aktív állapotot és e-mailt csak tulajdonos módosíthat'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_users_profile_guard ON public.users_profile;
CREATE TRIGGER trg_users_profile_guard BEFORE UPDATE ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.users_profile_guard();

ALTER VIEW public.users_profile_lookup SET (security_invoker = on);
REVOKE ALL ON public.users_profile_lookup FROM anon, authenticated;
GRANT SELECT ON public.users_profile_lookup TO authenticated;

-- gmail_accounts (nem használt, régi tábla)
DROP POLICY IF EXISTS authenticated_full_access ON public.gmail_accounts;
REVOKE ALL ON public.gmail_accounts FROM anon, authenticated;
GRANT SELECT (id, user_id, gmail_email, connected_at, last_sync_at, is_active) ON public.gmail_accounts TO authenticated;
GRANT ALL ON public.gmail_accounts TO service_role;
CREATE POLICY gmail_accounts_own ON public.gmail_accounts FOR SELECT TO authenticated USING (user_id = auth.uid());

-- roles / permissions / role_permissions
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['roles','permissions','role_permissions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_auth', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_owner_role(auth.uid())) WITH CHECK (public.is_owner_role(auth.uid()))', t||'_write_owner', t);
  END LOOP; END $$;