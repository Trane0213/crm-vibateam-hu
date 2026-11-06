-- Approved impact: four nullable receipt fields; no backfill, no new client grants/policies.
alter table public.quote_requests
 add column intake_company_id uuid references public.companies(id) on delete restrict,
 add column intake_contact_id uuid references public.contacts(id) on delete restrict,
 add column intake_by uuid,
 add column intake_at timestamptz,
 add constraint quote_request_intake_complete check (
   num_nonnulls(intake_company_id,intake_contact_id,intake_by,intake_at) in (0,4)
 );
grant select,update on public.quote_requests to service_role;
grant select,insert on public.companies,public.contacts,public.activities to service_role;

create function public.website_request_intake(p_request uuid,p_user uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r public.quote_requests%rowtype; e text; b text; person text; cname text;
 c uuid; k uuid; ids uuid[]; n integer; is_test boolean; lock_key text;
begin
 if auth.role() is distinct from 'service_role' or p_user is null or
    not coalesce(public.crm_role_of(p_user) in ('owner','marketing'),false) then
  raise exception 'Only authenticated owner or marketing intake' using errcode='42501';
 end if;
 select * into r from public.quote_requests where id=p_request for update;
 if not found then raise exception 'Inquiry not found'; end if;
 if r.intake_company_id is not null then
  if not exists(select 1 from public.contacts where id=r.intake_contact_id and company_id=r.intake_company_id)
    or not exists(select 1 from public.activities where user_id=r.intake_by and action='create'
      and details->>'entity_type'='quote_requests' and details->>'entity_id'=r.id::text
      and details->>'company_id'=r.intake_company_id::text and details->>'contact_id'=r.intake_contact_id::text
      and details->>'intake'='web_request_atomic') then raise exception 'Saved intake evidence inconsistent'; end if;
  return jsonb_build_object('kind','saved','company_id',r.intake_company_id,'contact_id',r.intake_contact_id,'by',r.intake_by,'at',r.intake_at);
 end if;
 e:=lower(nullif(btrim(r.email),''));
 if e is not null and e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then e:=null; end if;
 person:=nullif(btrim(r.name),''); b:=coalesce(nullif(btrim(r.company_name),''),person);
 is_test:=coalesce(r.name,'') ~* '(^|[^a-z0-9áéíóöőúüű])(teszt|test)([^a-z0-9áéíóöőúüű]|$)'
  or coalesce(r.email,'') ~* '(^|[^a-z0-9áéíóöőúüű])(teszt|test)([^a-z0-9áéíóöőúüű]|$)'
  or coalesce(r.message,'') ~* '(^|[^a-z0-9áéíóöőúüű])(teszt|test)([^a-z0-9áéíóöőúüű]|$)';
 cname:=case when is_test and b !~* '^TESZT' then 'TESZT – '||b else b end;
 -- Deterministic order coordinates all calls to this intake path, not other CRM writers.
 for lock_key in select distinct v from unnest(array['intake-email:'||e,'intake-name:'||lower(b),'intake-name:'||lower(cname)]) v where v is not null order by v loop
  perform pg_advisory_xact_lock(hashtextextended(lock_key,0));
 end loop;
 -- Older partial outcomes are review signals, never inferred receipts or repairs.
 if exists(select 1 from public.companies where strpos(coalesce(notes,''),'Weboldali ajánlatkérésből: '||r.id::text)>0)
  or exists(select 1 from public.activities where details->>'entity_type'='quote_requests' and details->>'entity_id'=r.id::text and action='create') then
  return jsonb_build_object('kind','ambiguous','reason','Korábbi felvételi nyom található — kézi ellenőrzés szükséges.');
 end if;
 if e is not null then
  select count(*),array_agg(distinct company_id) filter(where company_id is not null) into n,ids from public.contacts where lower(btrim(email))=e;
  if coalesce(cardinality(ids),0)=1 then return jsonb_build_object('kind','existing','company_id',ids[1]); end if;
  if n>0 then return jsonb_build_object('kind','ambiguous','reason','Az email több céghez vagy cég nélküli kontakthoz kapcsolódik — kézi ellenőrzés szükséges.'); end if;
 end if;
 if exists(select 1 from public.companies where lower(btrim(name)) in (lower(b),lower(cname))) then
  return jsonb_build_object('kind','ambiguous','reason','Azonos nevű cég már létezik — kézi ellenőrzés szükséges.');
 end if;
 if b is null or (e is null and person is null) then return jsonb_build_object('kind','blocked','reason','Nincs megfelelő név vagy kapcsolattartó adat.'); end if;
 insert into public.companies(name,notes) values(cname,'Weboldali ajánlatkérésből: '||r.id::text) returning id into c;
 insert into public.contacts(company_id,name,email,phone) values(c,coalesce(person,b),e,nullif(btrim(r.phone),'')) returning id into k;
 insert into public.activities(user_id,action,details) values(p_user,'create',jsonb_build_object('entity_type','quote_requests','entity_id',r.id,'company_id',c,'contact_id',k,'intake','web_request_atomic'));
 update public.quote_requests set intake_company_id=c,intake_contact_id=k,intake_by=p_user,intake_at=clock_timestamp() where id=r.id returning * into r;
 return jsonb_build_object('kind','saved','company_id',c,'contact_id',k,'by',p_user,'at',r.intake_at);
end $$;
revoke all on function public.website_request_intake(uuid,uuid) from public,anon,authenticated;
grant execute on function public.website_request_intake(uuid,uuid) to service_role;