-- Impact: existing service-only intake RPC, one conservative decision guard.
-- No schema, privileges, stored receipt or existing business rows change.
-- Same-company multiple linked contacts remain an existing-company match.
DO $guard$
DECLARE definition text; old_rule text := 'if coalesce(cardinality(ids),0)=1 then';
BEGIN
 definition := pg_get_functiondef('public.website_request_intake(uuid,uuid)'::regprocedure);
 IF strpos(definition,old_rule)=0 THEN RAISE EXCEPTION 'Intake definition changed; review required'; END IF;
 definition := replace(definition,old_rule,
  'if coalesce(cardinality(ids),0)=1 and not exists(select 1 from public.contacts where lower(btrim(email))=e and company_id is null) then');
 EXECUTE definition;
END $guard$;