alter table public.companies add column marketing_blocked boolean, add column marketing_block_reason text, add column marketing_block_changed_by uuid, add column marketing_block_changed_at timestamptz, add column marketing_block_revision uuid;
create function public.company_marketing_block_guard() returns trigger language plpgsql set search_path=public as $$
declare changed boolean;
begin
 if tg_op='INSERT' then changed := new.marketing_blocked is not null or new.marketing_block_reason is not null or new.marketing_block_changed_by is not null or new.marketing_block_changed_at is not null or new.marketing_block_revision is not null;
 else changed := (new.marketing_blocked,new.marketing_block_reason,new.marketing_block_changed_by,new.marketing_block_changed_at,new.marketing_block_revision) is distinct from (old.marketing_blocked,old.marketing_block_reason,old.marketing_block_changed_by,old.marketing_block_changed_at,old.marketing_block_revision); end if;
 if not changed then return new; end if;
 if tg_op='INSERT' or current_setting('app.company_marketing_block_write',true) is distinct from '1' or auth.uid() is null or not coalesce(public.is_owner_role(auth.uid()) or public.crm_role_of(auth.uid())='marketing',false) then raise exception 'Marketingtiltás csak a védett mentési művelettel írható' using errcode='42501'; end if;
 if new.marketing_blocked is null or length(btrim(coalesce(new.marketing_block_reason,'')))<5 or length(new.marketing_block_reason)>500 then raise exception 'Kötelező 5–500 karakteres indok'; end if;
 if old.marketing_blocked is true and new.marketing_blocked is false and not public.is_owner_role(auth.uid()) then raise exception 'Csak tulajdonos oldhatja fel a cégtiltást' using errcode='42501'; end if;
 new.marketing_block_changed_by:=auth.uid(); new.marketing_block_changed_at:=clock_timestamp(); new.marketing_block_revision:=gen_random_uuid(); return new;
end $$;
create trigger company_marketing_block_guard before insert or update on public.companies for each row execute function public.company_marketing_block_guard();
create function public.company_marketing_block_audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.marketing_blocked,new.marketing_block_reason,new.marketing_block_revision) is not distinct from (old.marketing_blocked,old.marketing_block_reason,old.marketing_block_revision) then return new; end if;
 insert into public.activities(user_id,action,details) values(new.marketing_block_changed_by,'company_marketing_block',jsonb_build_object('company_id',new.id,'before',jsonb_build_object('blocked',old.marketing_blocked,'reason',old.marketing_block_reason,'revision',old.marketing_block_revision),'after',jsonb_build_object('blocked',new.marketing_blocked,'reason',new.marketing_block_reason,'revision',new.marketing_block_revision),'changed_at',new.marketing_block_changed_at)); return new;
end $$;
create trigger company_marketing_block_audit after update on public.companies for each row execute function public.company_marketing_block_audit();
create function public.company_set_marketing_block(p_company uuid,p_blocked boolean,p_reason text,p_expected_revision uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.companies;
begin
 if auth.uid() is null or not coalesce(public.is_owner_role(auth.uid()) or public.crm_role_of(auth.uid())='marketing',false) then raise exception 'Nincs marketingjogosultság' using errcode='42501'; end if;
 if p_blocked is null or length(btrim(coalesce(p_reason,'')))<5 or length(p_reason)>500 then raise exception 'Kötelező 5–500 karakteres indok'; end if;
 select * into c from public.companies where id=p_company for update;
 if not found then raise exception 'A cég nem elérhető' using errcode='42501'; end if;
 if c.marketing_block_revision is distinct from p_expected_revision then raise exception 'A tiltás megváltozott; frissítsd az adatlapot' using errcode='40001'; end if;
 if p_blocked=false and not public.is_owner_role(auth.uid()) then raise exception 'Csak tulajdonos oldhatja fel a cégtiltást' using errcode='42501'; end if;
 perform set_config('app.company_marketing_block_write','1',true);
 update public.companies set marketing_blocked=p_blocked,marketing_block_reason=btrim(p_reason) where id=p_company returning * into c;
 perform set_config('app.company_marketing_block_write','',true);
 if c.marketing_blocked is distinct from p_blocked then raise exception 'A mentés nem igazolt'; end if;
 return jsonb_build_object('company_id',c.id,'blocked',c.marketing_blocked,'reason',c.marketing_block_reason,'changed_by',c.marketing_block_changed_by,'changed_at',c.marketing_block_changed_at,'revision',c.marketing_block_revision);
end $$;
revoke all on function public.company_marketing_block_guard() from public,anon,authenticated;
revoke all on function public.company_marketing_block_audit() from public,anon,authenticated;
revoke all on function public.company_set_marketing_block(uuid,boolean,text,uuid) from public,anon;
grant execute on function public.company_set_marketing_block(uuid,boolean,text,uuid) to authenticated;