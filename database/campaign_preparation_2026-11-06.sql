-- Additive preparation only. No rows are changed, no sending capability.
alter table public.email_campaigns add column message_subject text, add column message_body text;
alter table public.email_campaign_recipients add column selected boolean;

create or replace function public.email_campaigns_guard() returns trigger language plpgsql set search_path=public as $$
declare svc boolean := coalesce(auth.role(),'')='service_role';
begin
 if length(new.message_subject)>500 or length(new.message_body)>20000 then raise exception 'Túl hosszú kampányüzenet'; end if;
 if tg_op='INSERT' then
  if not svc then new.created_by:=auth.uid();new.status:='draft';new.prechecked_at:=null;end if;
 else
  if new.created_by is distinct from old.created_by then raise exception 'created_by nem módosítható';end if;
  if not svc then
   if new.prechecked_at is distinct from old.prechecked_at then raise exception 'ellenőrzési idő csak szerveren írható';end if;
   if new.status='prechecked' and old.status<>'prechecked' then raise exception 'prechecked csak szerveroldali ellenőrzéssel';end if;
  end if;
  if new.status='prechecked' and (new.name,new.target_group,new.message_subject,new.message_body) is distinct from (old.name,old.target_group,old.message_subject,old.message_body) then new.status:='draft';end if;
 end if;
 new.updated_at:=clock_timestamp();return new;
end $$;

-- Privileged snapshot writer: caller role/scope proved again inside the transaction.
create function public.campaign_store_preparation(p_campaign uuid,p_user uuid,p_expected timestamptz,p_rows jsonb,p_complete boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.email_campaigns; r jsonb; k public.contacts; role_name text; n integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Szerveroldali művelet';end if;
 role_name:=public.crm_role_of(p_user);
 select * into c from public.email_campaigns where id=p_campaign for update;
 if not found or c.status='archived' or role_name not in ('owner','marketing') or role_name is null
   or (role_name='marketing' and c.created_by is distinct from p_user) then raise exception 'Nincs kampányjogosultság';end if;
 if p_expected is null or c.updated_at is distinct from p_expected then raise exception 'A kampány megváltozott; nyisd újra';end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>20000 then raise exception 'Hibás címzettlista';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select * into k from public.contacts where id=(r->>'contact_id')::uuid for share;
  if not found or k.company_id is distinct from (r->>'company_id')::uuid
    or nullif(lower(btrim(k.email)),'') is distinct from nullif(r->>'email_norm','') then raise exception 'A kontakt megváltozott; új ellenőrzés szükséges';end if;
  if r->>'eligibility' not in ('ready','contacted','replied','uncertain','invalid') or r->>'eligibility' is null then raise exception 'Hibás minősítés';end if;
 end loop;
 delete from public.email_campaign_recipients where campaign_id=p_campaign;
 insert into public.email_campaign_recipients(campaign_id,contact_id,email_norm,eligibility,reasons,last_history_at,selected)
 select p_campaign,(item.value->>'contact_id')::uuid,nullif(item.value->>'email_norm',''),item.value->>'eligibility',item.value->'reasons',(item.value->>'last_history_at')::timestamptz,(item.value->>'selected')::boolean from jsonb_array_elements(p_rows) as item(value);
 get diagnostics n=row_count;
 update public.email_campaigns set status=case when p_complete then 'prechecked' else 'draft' end,
 prechecked_at=case when p_complete then clock_timestamp() else null end where id=p_campaign returning * into c;
 return jsonb_build_object('stored',n,'status',c.status,'updated_at',c.updated_at);
end $$;
revoke all on function public.campaign_store_preparation(uuid,uuid,timestamptz,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.campaign_store_preparation(uuid,uuid,timestamptz,jsonb,boolean) to service_role;