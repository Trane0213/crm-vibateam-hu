CREATE OR REPLACE FUNCTION public.leads_won_is_terminal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status = 'won' AND NEW.status IS DISTINCT FROM 'won' THEN
    RAISE EXCEPTION 'Megnyert lead státusza nem módosítható' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.leads_won_is_terminal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_leads_won_is_terminal ON public.leads;
CREATE TRIGGER trg_leads_won_is_terminal BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_won_is_terminal();