alter table public.email_campaigns add column target_company_ids uuid[];
create function public.campaign_target_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then if new.target_company_ids is not null then raise exception 'Célcég csak védett művelettel adható hozzá'; end if;
 elsif new.target_company_ids is distinct from old.target_company_ids then
  if current_setting('app.campaign_target_write',true) is distinct from '1' or auth.uid() is null or public.crm_role_of(auth.uid()) not in ('owner','marketing') then raise exception 'Nincs célcég-mentési jogosultság' using errcode='42501'; end if;
 end if; return new;
end $$;
create trigger campaign_target_guard before insert or update on public.email_campaigns for each row execute function public.campaign_target_guard();
create function public.campaign_add_target_company(p_campaign uuid,p_company uuid,p_expected timestamptz) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.email_campaigns; role_name text;
begin
 role_name:=public.crm_role_of(auth.uid());
 if auth.uid() is null or role_name is null or role_name not in ('owner','marketing') then raise exception 'Nincs kampányjogosultság' using errcode='42501'; end if;
 select * into c from public.email_campaigns where id=p_campaign for update;
 if not found or c.status='archived' or (role_name='marketing' and c.created_by is distinct from auth.uid()) then raise exception 'A kampány nem szerkeszthető'; end if;
 if not exists(select 1 from public.companies where id=p_company) then raise exception 'A cég nem elérhető'; end if;
 if p_company=any(coalesce(c.target_company_ids,array[]::uuid[])) then return jsonb_build_object('campaign_id',c.id,'company_id',p_company,'already_saved',true); end if;
 if p_expected is null or c.updated_at is distinct from p_expected then raise exception 'A kampány megváltozott; nyisd újra' using errcode='40001'; end if;
 if cardinality(coalesce(c.target_company_ids,array[]::uuid[]))>=2000 then raise exception 'Legfeljebb 2000 célcég választható'; end if;
 perform set_config('app.campaign_target_write','1',true);
 update public.email_campaigns set target_company_ids=array_append(coalesce(target_company_ids,array[]::uuid[]),p_company),status='draft' where id=p_campaign;
 perform set_config('app.campaign_target_write','',true);
 insert into public.activities(user_id,action,details) values(auth.uid(),'campaign_target_company',jsonb_build_object('campaign_id',p_campaign,'company_id',p_company,'before',c.target_company_ids,'after',array_append(coalesce(c.target_company_ids,array[]::uuid[]),p_company)));
 return jsonb_build_object('campaign_id',p_campaign,'company_id',p_company,'already_saved',false);
end $$;
revoke all on function public.campaign_target_guard() from public,anon,authenticated;
revoke all on function public.campaign_add_target_company(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.campaign_add_target_company(uuid,uuid,timestamptz) to authenticated;