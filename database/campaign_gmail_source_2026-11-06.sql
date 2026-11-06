-- Proposal only: additive source snapshot, no backfill, no RLS changes, no sending.
alter table public.email_campaigns
 add column message_html text,
 add column gmail_draft_source jsonb;

create function public.campaign_gmail_source_guard() returns trigger
language plpgsql set search_path=public as $$
declare privileged boolean := current_user in ('service_role','postgres'); changed boolean;
begin
 if tg_op='INSERT' then changed := new.message_html is not null or new.gmail_draft_source is not null;
 else
  changed := (new.message_html,new.gmail_draft_source) is distinct from (old.message_html,old.gmail_draft_source);
  if not privileged and old.gmail_draft_source is not null and
   (new.message_subject,new.message_body) is distinct from (old.message_subject,old.message_body) then
   raise exception 'Előbb válts külön megerősítéssel szöveges tervezetre';
  end if;
 end if;
 if changed and not privileged then raise exception 'Gmail-forrás csak védett szervermentéssel írható' using errcode='42501'; end if;
 if new.message_html is not null and length(new.message_html)>200000 then raise exception 'Túl hosszú HTML-forrás'; end if;
 if new.gmail_draft_source is not null then
  if jsonb_typeof(new.gmail_draft_source) is distinct from 'object'
   or not (new.gmail_draft_source ?& array['draft_id','message_id','mailbox','read_at','imported_by','sha256'])
   or nullif(new.gmail_draft_source->>'draft_id','') is null
   or nullif(new.gmail_draft_source->>'message_id','') is null
   or (new.gmail_draft_source->>'mailbox') not in ('info@vibateam.hu','ramon.dencsi@vibateam.hu','pretor.laszlo@vibateam.hu')
   or (new.gmail_draft_source->>'sha256') !~ '^[a-f0-9]{64}$'
   or (new.gmail_draft_source->>'imported_by') is null
   or (new.gmail_draft_source->>'read_at') is null
   or octet_length(new.gmail_draft_source::text)>2000 then raise exception 'Hiányos Gmail-forrás'; end if;
 end if;
 if tg_op='UPDATE' and changed then new.status:='draft';new.prechecked_at:=null; end if;
 return new;
end $$;
create trigger campaign_gmail_source_guard before insert or update on public.email_campaigns
for each row execute function public.campaign_gmail_source_guard();

-- Server proves live Gmail ownership, full MIME, content hash and user-RLS visibility first.
create function public.campaign_import_gmail_source(p_campaign uuid,p_user uuid,p_expected timestamptz,p_subject text,p_text text,p_html text,p_source jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.email_campaigns; r text;
begin
 if current_user is distinct from 'service_role' then raise exception 'Szerveroldali művelet' using errcode='42501';end if;
 r:=public.crm_role_of(p_user);
 select * into c from public.email_campaigns where id=p_campaign for update;
 if not found or r is null or r not in ('owner','marketing') or c.status='archived'
  or (r='marketing' and c.created_by is distinct from p_user) then raise exception 'Nincs kampányjogosultság';end if;
 if p_expected is null or c.updated_at is distinct from p_expected then raise exception 'A kampány megváltozott' using errcode='40001';end if;
 if p_source is null or (p_source->>'imported_by') is distinct from p_user::text
  or nullif(btrim(p_subject),'') is null or length(p_subject)>500
  or length(p_text)>20000 or length(p_html)>200000
  or (nullif(btrim(p_text),'') is null and nullif(btrim(p_html),'') is null) then raise exception 'Hiányos piszkozat';end if;
 if not exists(select 1 from public.users_profile where auth_user_id=p_user and active is true
  and lower(gmail_email)=p_source->>'mailbox' and nullif(gmail_auth_error,'') is null) then raise exception 'Nincs aktív saját postafiók';end if;
 update public.email_campaigns set message_subject=p_subject,message_body=p_text,message_html=p_html,
  gmail_draft_source=p_source,status='draft',prechecked_at=null where id=p_campaign;
 insert into public.activities(user_id,action,details) values(p_user,'campaign_gmail_source_import',
  jsonb_build_object('campaign_id',p_campaign,'source',p_source,'previous_source',c.gmail_draft_source,'previous_revision',c.updated_at));
 return jsonb_build_object('campaign_id',p_campaign,'source',p_source);
end $$;
revoke all on function public.campaign_import_gmail_source(uuid,uuid,timestamptz,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.campaign_import_gmail_source(uuid,uuid,timestamptz,text,text,text,jsonb) to service_role;
-- Existing email_campaigns/activities grants and RLS are retained; no new public tables.