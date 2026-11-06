-- No backfill, no customer sending activation, no scheduler.
create table public.marketing_email_suppressions(
 email_norm text primary key, blocked boolean not null, reference text not null,
 source_contact_id uuid not null, changed_by uuid not null, changed_at timestamptz not null default clock_timestamp(),
 revision uuid not null default gen_random_uuid()
);
grant select on public.marketing_email_suppressions to authenticated;
grant all on public.marketing_email_suppressions to service_role;
alter table public.marketing_email_suppressions enable row level security;
create policy suppression_marketing_read on public.marketing_email_suppressions for select to authenticated using(public.crm_role_of(auth.uid()) in ('owner','marketing'));

create function public.contact_set_marketing_suppression(p_contact uuid,p_email text,p_revision uuid,p_blocked boolean,p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare k public.contacts; previous public.marketing_email_suppressions; saved public.marketing_email_suppressions; role_name text; addr text;
begin
 role_name:=public.crm_role_of(auth.uid());
 if role_name is null or role_name not in ('owner','marketing') or (not p_blocked and role_name<>'owner') then raise exception 'Nincs tiltásmódosítási jogosultság';end if;
 if p_blocked is null or length(btrim(p_reference))<5 or length(p_reference)>500 or p_reference is null then raise exception 'Igazoló hivatkozás szükséges';end if;
 select * into k from public.contacts where id=p_contact for share;
 addr:=lower(btrim(p_email));
 if not found or lower(btrim(k.email)) is distinct from addr or addr is null or addr !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A kontakt címe megváltozott';end if;
 perform pg_advisory_xact_lock(hashtextextended('marketing-email:'||addr,0));
 select * into previous from public.marketing_email_suppressions where email_norm=addr for update;
 if previous.revision is distinct from p_revision then raise exception 'A tiltás megváltozott; frissítsd';end if;
 insert into public.marketing_email_suppressions(email_norm,blocked,reference,source_contact_id,changed_by)
 values(addr,p_blocked,btrim(p_reference),p_contact,auth.uid())
 on conflict(email_norm) do update set blocked=excluded.blocked,reference=excluded.reference,source_contact_id=excluded.source_contact_id,changed_by=excluded.changed_by,changed_at=clock_timestamp(),revision=gen_random_uuid() returning * into saved;
 insert into public.activities(user_id,action,details) values(auth.uid(),'marketing_suppression',jsonb_build_object('contact_id',p_contact,'blocked',p_blocked,'revision',saved.revision,'previous_revision',previous.revision));
 return to_jsonb(saved);
end $$;
revoke all on function public.contact_set_marketing_suppression(uuid,text,uuid,boolean,text) from public,anon;
grant execute on function public.contact_set_marketing_suppression(uuid,text,uuid,boolean,text) to authenticated;

create table public.campaign_send_audit(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.email_campaigns(id),
 campaign_revision timestamptz not null,user_id uuid not null,mailbox text not null,recipient text not null,
 budapest_day date not null,claimed_at timestamptz not null default clock_timestamp(),
 status text not null default 'uncertain',gmail_message_id text,email_id uuid,finished_at timestamptz,
 unique(campaign_id,campaign_revision,mailbox,recipient),
 constraint campaign_test_only check(recipient in ('viktor.csotai@gmail.com','info@vibateam.hu')),
 constraint campaign_evidence_status check(status in ('uncertain','verified'))
);
grant select on public.campaign_send_audit to authenticated;
grant all on public.campaign_send_audit to service_role;
alter table public.campaign_send_audit enable row level security;
create policy campaign_send_read on public.campaign_send_audit for select to authenticated using(public.crm_role_of(auth.uid())='owner' or(public.crm_role_of(auth.uid())='marketing' and user_id=auth.uid() and exists(select 1 from public.email_campaigns c where c.id=campaign_id and c.created_by=auth.uid())));

create function public.campaign_test_claim(p_campaign uuid,p_user uuid,p_revision timestamptz,p_mailbox text,p_recipient text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c public.email_campaigns; r text; sender text; n integer; result uuid; d date;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Szerveroldali művelet';end if;
 r:=public.crm_role_of(p_user);
 select * into c from public.email_campaigns where id=p_campaign for share;
 if not found or r is null or r not in ('owner','marketing') or(r='marketing' and c.created_by is distinct from p_user) or c.status='archived' then raise exception 'Nincs kampányjogosultság';end if;
 if c.updated_at is distinct from p_revision or p_revision is null or nullif(btrim(c.message_subject),'') is null or nullif(btrim(c.message_body),'') is null then raise exception 'Elavult vagy üres kampányüzenet';end if;
 sender:=lower(btrim(p_mailbox));
 if p_recipient is null or p_recipient not in ('viktor.csotai@gmail.com','info@vibateam.hu') then raise exception 'Csak engedélyezett TESZT-cím';end if;
 if sender is null or sender not in ('info@vibateam.hu','ramon.dencsi@vibateam.hu','pretor.laszlo@vibateam.hu') or not exists(select 1 from public.users_profile where auth_user_id=p_user and active and lower(gmail_email)=sender and nullif(gmail_auth_error,'') is null) then raise exception 'Nincs aktív saját céges postafiók';end if;
 perform pg_advisory_xact_lock(hashtextextended('marketing-email:'||p_recipient,0));
 if exists(select 1 from public.marketing_email_suppressions where email_norm=p_recipient and blocked) then raise exception 'Marketingküldés tiltott';end if;
 perform pg_advisory_xact_lock(hashtextextended('campaign-mailbox:'||sender,0));
 d:=(clock_timestamp() at time zone 'Europe/Budapest')::date;
 select count(*) into n from public.campaign_send_audit where mailbox=sender and budapest_day=d;
 if n>=40 then raise exception 'A napi 40 kampánylevél keret elfogyott';end if;
 insert into public.campaign_send_audit(campaign_id,campaign_revision,user_id,mailbox,recipient,budapest_day) values(p_campaign,p_revision,p_user,sender,p_recipient,d) returning id into result;
 return result;
end $$;
revoke all on function public.campaign_test_claim(uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.campaign_test_claim(uuid,uuid,timestamptz,text,text) to service_role;

create function public.campaign_test_finish(p_id uuid,p_user uuid,p_gmail text,p_email uuid,p_verified boolean)
returns text language plpgsql security invoker set search_path=public as $$
declare a public.campaign_send_audit; valid boolean;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Szerveroldali művelet';end if;
 select * into a from public.campaign_send_audit where id=p_id and user_id=p_user for update;
 if not found or a.finished_at is not null then raise exception 'A küldési eredmény már lezárt';end if;
 valid:=coalesce(p_verified,false) and exists(select 1 from public.emails e where e.id=p_email and e.owner_user_id=p_user and e.gmail_message_id=p_gmail and lower(e.from_email)=a.mailbox and e.to_emails=array[a.recipient] and coalesce(cardinality(e.cc_emails),0)=0 and coalesce(cardinality(e.bcc_emails),0)=0 and e.gmail_label_ids @> array['SENT'] and not e.gmail_label_ids && array['DRAFT','SPAM','TRASH']);
 update public.campaign_send_audit set status=case when valid then 'verified' else 'uncertain' end,gmail_message_id=p_gmail,email_id=p_email,finished_at=clock_timestamp() where id=p_id;
 return case when valid then 'verified' else 'uncertain' end;
end $$;
revoke all on function public.campaign_test_finish(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.campaign_test_finish(uuid,uuid,text,uuid,boolean) to service_role;