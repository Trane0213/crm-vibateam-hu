-- Marketing: saját körben utánkövetés és feladat (additív; meglévő szabályok változatlanok)
create policy followups_marketing_own_insert on public.followups for insert to authenticated
with check (crm_role_of(auth.uid())='marketing' and assigned_to=auth.uid() and lead_id is null and project_id is null and quote_id is null and company_id is not null);
create policy followups_marketing_own_update on public.followups for update to authenticated
using (crm_role_of(auth.uid())='marketing' and assigned_to=auth.uid() and lead_id is null and project_id is null and quote_id is null)
with check (crm_role_of(auth.uid())='marketing' and assigned_to=auth.uid() and lead_id is null and project_id is null and quote_id is null and company_id is not null);
create policy tasks_marketing_own_insert on public.tasks for insert to authenticated
with check (crm_role_of(auth.uid())='marketing' and assigned_user=current_profile_id() and project_id is null);
create policy tasks_marketing_own_update on public.tasks for update to authenticated
using (crm_role_of(auth.uid())='marketing' and assigned_user=current_profile_id() and project_id is null)
with check (crm_role_of(auth.uid())='marketing' and assigned_user=current_profile_id() and project_id is null);