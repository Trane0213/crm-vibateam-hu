-- 3. kör: kampánytervezet + szűk jogok. Csak email_campaigns és email_campaign_recipients.
alter table public.email_campaigns
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists prechecked_at timestamptz;
alter table public.email_campaigns alter column created_by set default auth.uid();
alter table public.email_campaigns alter column status set default 'draft';
update public.email_campaigns set status = 'draft' where status is null; -- 0 sor élesben
alter table public.email_campaigns alter column status set not null;
alter table public.email_campaigns drop constraint if exists email_campaigns_status_check;
alter table public.email_campaigns add constraint email_campaigns_status_check check (status in ('draft','prechecked','archived'));
alter table public.email_campaigns drop constraint if exists email_campaigns_name_len;
alter table public.email_campaigns add constraint email_campaigns_name_len check (char_length(btrim(name)) between 1 and 200 and (target_group is null or char_length(target_group) <= 500));

create or replace function public.email_campaigns_guard() returns trigger
language plpgsql security invoker set search_path = public as $$
declare svc boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if tg_op = 'INSERT' then
    if not svc then
      new.created_by := auth.uid();
      new.status := 'draft';
      new.prechecked_at := null;
    end if;
  else
    if new.created_by is distinct from old.created_by then raise exception 'created_by nem módosítható'; end if;
    if not svc then
      if new.prechecked_at is distinct from old.prechecked_at then raise exception 'ellenőrzési idő csak szerveren írható'; end if;
      if new.status = 'prechecked' and old.status <> 'prechecked' then raise exception 'prechecked csak szerveroldali ellenőrzéssel'; end if;
      -- tartalmi szerkesztés visszaveti tervezetbe
      if old.status = 'prechecked' and new.status = 'prechecked' and (new.name, new.target_group) is distinct from (old.name, old.target_group) then new.status := 'draft'; end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists email_campaigns_guard on public.email_campaigns;
create trigger email_campaigns_guard before insert or update on public.email_campaigns for each row execute function public.email_campaigns_guard();

create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  email_norm text,
  eligibility text not null check (eligibility in ('ready','contacted','replied','uncertain','invalid')),
  reasons jsonb not null default '[]'::jsonb,
  last_history_at timestamptz,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ecr_ready_requires_email check (eligibility <> 'ready' or email_norm ~ '^[^\s@<>(),;"]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  constraint ecr_unique_email unique (campaign_id, email_norm),
  constraint ecr_unique_contact unique (campaign_id, contact_id)
);
create index if not exists ecr_campaign_idx on public.email_campaign_recipients(campaign_id);

-- Legkisebb privilégium
revoke all on public.email_campaigns from anon;
revoke all on public.email_campaign_recipients from anon, authenticated;
revoke delete, truncate, references, trigger on public.email_campaigns from authenticated;
grant select, insert, update on public.email_campaigns to authenticated;
grant select on public.email_campaign_recipients to authenticated;
grant all on public.email_campaigns, public.email_campaign_recipients to service_role;

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;

drop policy if exists authenticated_full_access on public.email_campaigns;
drop policy if exists email_campaigns_select on public.email_campaigns;
drop policy if exists email_campaigns_insert on public.email_campaigns;
drop policy if exists email_campaigns_update on public.email_campaigns;
create policy email_campaigns_select on public.email_campaigns for select to authenticated
  using (public.crm_role_of(auth.uid()) = 'owner' or (public.crm_role_of(auth.uid()) = 'marketing' and created_by = auth.uid()));
create policy email_campaigns_insert on public.email_campaigns for insert to authenticated
  with check (public.crm_role_of(auth.uid()) in ('owner','marketing') and created_by = auth.uid() and status = 'draft');
create policy email_campaigns_update on public.email_campaigns for update to authenticated
  using (public.crm_role_of(auth.uid()) = 'owner' or (public.crm_role_of(auth.uid()) = 'marketing' and created_by = auth.uid()))
  with check (public.crm_role_of(auth.uid()) = 'owner' or (public.crm_role_of(auth.uid()) = 'marketing' and created_by = auth.uid()));

drop policy if exists email_campaign_recipients_select on public.email_campaign_recipients;
create policy email_campaign_recipients_select on public.email_campaign_recipients for select to authenticated
  using (exists (select 1 from public.email_campaigns c where c.id = campaign_id));
