-- Hardening: minden public SECURITY DEFINER függvény EXECUTE jogát
-- visszavonjuk az anon szerepkörtől. Supabase alapból GRANT EXECUTE-ot ad
-- anon-nak minden public function-re, így a sima REVOKE FROM PUBLIC nem
-- elég. Kritikus: sales_mark_won_with_project anon JWT-vel hívható lenne.
--
-- Trigger függvényeknek (leads_*, projects_*) nem kell EXECUTE jog senkinek
-- a triggeren kívül — anon-tól is biztonságos visszavonni.
-- Az authenticated/service_role grant-ek érintetlenül maradnak ahol kell.

BEGIN;

-- 1) Sales RPC — csak authenticated + service_role hívhatja
REVOKE EXECUTE ON FUNCTION public.sales_mark_won_with_project(uuid, text, date, uuid, text) FROM anon, PUBLIC;

-- 2) RLS helper függvények — RLS policy hívja, kliens nem; anon-tól tiltjuk
REVOKE EXECUTE ON FUNCTION public.is_owner_role(uuid)                FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_email_admin(uuid)               FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_email_thread(uuid,uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_route_access(uuid,text)        FROM anon, PUBLIC;

-- 3) Trigger függvények — egyik szerepkörnek sem kell EXECUTE
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.leads_business_rules()',
    'public.leads_pipeline_entry_guard()',
    'public.leads_pipeline_next_step_required()',
    'public.leads_status_history_write()',
    'public.leads_won_requires_project()',
    'public.projects_lead_handoff_guard()',
    'public.projects_protect_won_lead()'
  ]
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', v_fn);
    EXCEPTION WHEN undefined_function THEN
      -- ha nem létezik (még), átlépjük
      NULL;
    END;
  END LOOP;
END
$$;

COMMIT;

-- Ellenőrzés:
--   SELECT proname, proacl FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('sales_mark_won_with_project','is_owner_role',
--                      'is_email_admin','can_access_email_thread',
--                      'has_route_access');
--   -- A proacl-ben NE legyen 'anon=X/...' bejegyzés.