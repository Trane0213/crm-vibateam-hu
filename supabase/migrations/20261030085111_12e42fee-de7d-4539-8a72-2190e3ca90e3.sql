CREATE OR REPLACE FUNCTION public.sync_profile_name_to_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NEW.auth_user_id IS NOT NULL THEN
    UPDATE auth.users
      SET raw_user_meta_data = coalesce(raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('full_name', coalesce(NEW.full_name,''))
      WHERE id = NEW.auth_user_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_profile_name_to_auth() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_profile_name_to_auth ON public.users_profile;
CREATE TRIGGER trg_sync_profile_name_to_auth AFTER INSERT OR UPDATE OF full_name, auth_user_id ON public.users_profile
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_name_to_auth();
UPDATE auth.users u SET raw_user_meta_data = coalesce(u.raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('full_name', p.full_name)
FROM public.users_profile p WHERE p.auth_user_id = u.id AND p.full_name IS NOT NULL;