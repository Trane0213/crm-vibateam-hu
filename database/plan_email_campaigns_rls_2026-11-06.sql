-- TERV — NEM ALKALMAZVA (2026-11-06). Csak tulajdonosi jóváhagyás + hatáselemzés után futtatható.
-- Cél: az email_campaigns "authenticated_full_access" (ALL, true/true) szabályának szűkítése,
-- és minimális tartós címzett-modell a meglévő táblák mellé (nincs második CRM).
-- Jelenleg 0 kampányrekord van, így adatvesztés nincs; rollback a fájl végén.

begin;

-- 1) Minimális mezők a meglévő táblán
alter table public.email_campaigns
  add column if not exists created_by uuid references auth.users(id) default auth.uid(),
  add column if not exists updated_at timestamptz not null default now();
alter table public.email_campaigns drop constraint if exists email_campaigns_status_check;
alter table public.email_campaigns add constraint email_campaigns_status_check
  check (status in ('draft','prechecked','approved','archived'));  -- 'sending/sent' csak szerveroldali küldő útvonal bevezetésekor

-- 2) Címzettek: csak meglévő kontaktra mutat; az előellenőrzés eredményét a szerver írja
create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id),
  email_norm text not null,
  eligibility text not null check (eligibility in ('ready','contacted','replied','uncertain','invalid')),
  reasons jsonb not null default '[]',
  checked_at timestamptz not null default now(),
  owner_override_by uuid references auth.users(id),   -- bizonytalan cím csak tulajdonosi felülbírálással
  created_at timestamptz not null default now(),
  unique (campaign_id, email_norm)                      -- kampányon belüli duplikáció tiltva
);
grant select on public.email_campaign_recipients to authenticated;
grant all on public.email_campaign_recipients to service_role;
alter table public.email_campaign_recipients enable row level security;

-- 3) Szűkített jogok: Owner mindent lát; Marketing csak a saját kampányait; senki más semmit.
drop policy if exists authenticated_full_access on public.email_campaigns;
create policy email_campaigns_select on public.email_campaigns for select to authenticated
  using (public.is_owner_role(auth.uid()) or (public.crm_role_of(auth.uid()) = 'marketing' and created_by = auth.uid()));
create policy email_campaigns_insert on public.email_campaigns for insert to authenticated
  with check (public.crm_role_of(auth.uid()) in ('owner','marketing') and created_by = auth.uid() and status = 'draft');
create policy email_campaigns_update on public.email_campaigns for update to authenticated
  using (public.is_owner_role(auth.uid()) or (public.crm_role_of(auth.uid()) = 'marketing' and created_by = auth.uid() and status in ('draft','prechecked')))
  with check (public.is_owner_role(auth.uid()) or (created_by = auth.uid() and status in ('draft','prechecked')));  -- 'approved' csak Owner
create policy email_campaigns_delete on public.email_campaigns for delete to authenticated
  using (public.is_owner_role(auth.uid()) or (created_by = auth.uid() and status = 'draft'));

-- Címzettek: olvasás a kampány láthatóságával; írás KIZÁRÓLAG szerveroldalon (service_role, előellenőrzés után)
create policy email_campaign_recipients_select on public.email_campaign_recipients for select to authenticated
  using (exists (select 1 from public.email_campaigns c where c.id = campaign_id));

commit;

-- Küldés: kizárólag a meglévő /api/gmail/send útvonalon, szerveroldali újraellenőrzéssel
-- (eligibility='ready' vagy owner_override_by nem null, kampány 'approved', idempotencia kulcs).

-- ROLLBACK
-- begin;
-- drop table if exists public.email_campaign_recipients;
-- drop policy if exists email_campaigns_select on public.email_campaigns;
-- drop policy if exists email_campaigns_insert on public.email_campaigns;
-- drop policy if exists email_campaigns_update on public.email_campaigns;
-- drop policy if exists email_campaigns_delete on public.email_campaigns;
-- alter table public.email_campaigns drop constraint if exists email_campaigns_status_check;
-- alter table public.email_campaigns drop column if exists created_by, drop column if exists updated_at;
-- create policy authenticated_full_access on public.email_campaigns for all to public using (true) with check (true);
-- commit;
