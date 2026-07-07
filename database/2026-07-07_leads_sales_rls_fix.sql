-- ============================================================================
-- VIBA CRM — leads.RLS javítás (sales szerepkör self-assign trap)
-- ----------------------------------------------------------------------------
-- Előzmény:
--   A 2026-06-23_sales_module_v1.sql `leads_update_sales` policy-ja:
--     USING      : assigned_to = auth.uid() OR assigned_to IS NULL
--     WITH CHECK : assigned_to = auth.uid()
--   Következmény: ha sales user egy `assigned_to IS NULL` lead-en frissít
--   bármit (státusz, jegyzet) anélkül hogy explicit magára állítaná az
--   assigned_to mezőt, az UPDATE átmegy a USING szűrésen, de a WITH CHECK
--   RLS hibával elutasítja ("new row violates row-level security policy").
--
-- Javítás:
--   BEFORE UPDATE trigger, amely sales user hívásakor automatikusan
--   magához claim-eli az unassigned lead-et. Így a WITH CHECK teljesül,
--   a frontendet nem kell módosítani. A trigger SECURITY DEFINER, mert
--   olvasnia kell a users_profile / roles táblákat auth.uid() alapján.
--
-- Idempotens: DROP IF EXISTS + CREATE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.leads_sales_autoclaim_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_sales boolean;
BEGIN
  -- Csak akkor claim-elünk, ha az új sor még mindig unassigned.
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- auth.uid() NULL lehet service_role hívásnál — ilyenkor ne piszkáljuk.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users_profile up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.auth_user_id = auth.uid()
      AND lower(r.name) = 'sales'
  ) INTO v_is_sales;

  IF v_is_sales THEN
    NEW.assigned_to := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_sales_autoclaim_on_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leads_sales_autoclaim_on_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.leads_sales_autoclaim_on_update() TO service_role;

DROP TRIGGER IF EXISTS trg_leads_sales_autoclaim ON public.leads;
CREATE TRIGGER trg_leads_sales_autoclaim
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_sales_autoclaim_on_update();

-- ----------------------------------------------------------------------------
-- Verifikáció (kézzel futtatható):
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.leads'::regclass
--      AND tgname  = 'trg_leads_sales_autoclaim';
-- ----------------------------------------------------------------------------