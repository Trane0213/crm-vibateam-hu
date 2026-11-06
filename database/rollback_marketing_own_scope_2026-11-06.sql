-- Visszaállítás: marketing saját körű utánkövetés/feladat írási jog megszüntetése
drop policy if exists followups_marketing_own_insert on public.followups;
drop policy if exists followups_marketing_own_update on public.followups;
drop policy if exists tasks_marketing_own_insert on public.tasks;
drop policy if exists tasks_marketing_own_update on public.tasks;
