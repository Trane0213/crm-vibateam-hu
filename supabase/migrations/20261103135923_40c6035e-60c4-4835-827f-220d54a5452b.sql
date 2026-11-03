CREATE OR REPLACE FUNCTION public.quotes_responsible_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); g uuid;
BEGIN
  IF uid IS NULL OR is_owner_role(uid) THEN
    IF TG_OP = 'INSERT' AND NEW.responsible_user_id IS NULL THEN
      SELECT responsible_user_id INTO g FROM quotes WHERE group_id = NEW.group_id AND responsible_user_id IS NOT NULL ORDER BY created_at LIMIT 1;
      NEW.responsible_user_id := COALESCE(g, uid);
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT responsible_user_id INTO g FROM quotes WHERE group_id = NEW.group_id AND responsible_user_id IS NOT NULL ORDER BY created_at LIMIT 1;
    NEW.responsible_user_id := COALESCE(g, uid);
  ELSIF NEW.responsible_user_id IS DISTINCT FROM OLD.responsible_user_id THEN
    RAISE EXCEPTION 'Az ajánlat felelősét csak tulajdonos adhatja át' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.quotes_responsible_guard() FROM public, anon, authenticated;
CREATE TRIGGER quotes_responsible_guard BEFORE INSERT OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.quotes_responsible_guard();

UPDATE public.quotes q SET responsible_user_id = up.auth_user_id
FROM public.users_profile up WHERE up.id = q.created_by AND q.responsible_user_id IS NULL AND q.locked_at IS NULL;