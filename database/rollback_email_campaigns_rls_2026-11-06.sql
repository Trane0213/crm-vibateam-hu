-- Visszaállítás a 2026-11-06-i kampány-RLS migráció előtti állapotra (akkor 0 kampányrekord volt).
-- FIGYELEM: a címzett-tábla törlése a tárolt ellenőrzési eredményeket is törli.
begin;
drop table if exists public.email_campaign_recipients;
drop trigger if exists email_campaigns_guard on public.email_campaigns;
drop function if exists public.email_campaigns_guard();
drop policy if exists email_campaigns_select on public.email_campaigns;
drop policy if exists email_campaigns_insert on public.email_campaigns;
drop policy if exists email_campaigns_update on public.email_campaigns;
alter table public.email_campaigns drop constraint if exists email_campaigns_status_check;
alter table public.email_campaigns drop constraint if exists email_campaigns_name_len;
alter table public.email_campaigns alter column status drop not null;
alter table public.email_campaigns drop column if exists created_by, drop column if exists updated_at, drop column if exists prechecked_at;
grant select, insert, update, delete on public.email_campaigns to authenticated, anon;
create policy authenticated_full_access on public.email_campaigns for all to authenticated using (true) with check (true);
commit;
