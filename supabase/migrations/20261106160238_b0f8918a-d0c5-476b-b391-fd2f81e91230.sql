drop function public.contact_set_marketing_suppression(uuid,text,uuid,boolean,text);
create function public.contact_set_marketing_suppression(p_user uuid,p_contact uuid,p_email text,p_revision uuid,p_blocked boolean,p_reference text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare k public.contacts;previous public.marketing_email_suppressions;saved public.marketing_email_suppressions;role_name text;addr text;
begin
if coalesce(auth.role(),'')<>'service_role' then raise exception 'Szerveroldali művelet';end if;
role_name:=public.crm_role_of(p_user);
if role_name is null or role_name not in ('owner','marketing') or(not p_blocked and role_name<>'owner') then raise exception 'Nincs tiltásmódosítási jogosultság';end if;
if p_blocked is null or length(btrim(p_reference))<5 or length(p_reference)>500 or p_reference is null then raise exception 'Igazoló hivatkozás szükséges';end if;
select * into k from public.contacts where id=p_contact for share;
addr:=lower(btrim(p_email));
if not found or lower(btrim(k.email)) is distinct from addr or addr is null or addr !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A kontakt címe megváltozott';end if;
perform pg_advisory_xact_lock(hashtextextended('marketing-email:'||addr,0));
select * into previous from public.marketing_email_suppressions where email_norm=addr for update;
if previous.revision is distinct from p_revision then raise exception 'A tiltás megváltozott; frissítsd';end if;
insert into public.marketing_email_suppressions(email_norm,blocked,reference,source_contact_id,changed_by) values(addr,p_blocked,btrim(p_reference),p_contact,p_user) on conflict(email_norm) do update set blocked=excluded.blocked,reference=excluded.reference,source_contact_id=excluded.source_contact_id,changed_by=excluded.changed_by,changed_at=clock_timestamp(),revision=gen_random_uuid() returning * into saved;
insert into public.activities(user_id,action,details) values(p_user,'marketing_suppression',jsonb_build_object('contact_id',p_contact,'blocked',p_blocked,'revision',saved.revision,'previous_revision',previous.revision));
return to_jsonb(saved);
end $$;
revoke all on function public.contact_set_marketing_suppression(uuid,uuid,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.contact_set_marketing_suppression(uuid,uuid,text,uuid,boolean,text) to service_role;