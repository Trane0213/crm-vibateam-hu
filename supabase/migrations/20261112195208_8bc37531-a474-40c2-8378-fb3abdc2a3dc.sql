-- Replace always-true access rules with real role checks.
-- Staff = signed-in user who has a CRM role on their users_profile row.

-- 1) Reference/config tables: readable by CRM staff only
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('sales_module_meta','sales_module_meta_select_auth'),
    ('role_permissions','role_permissions_select'),
    ('roles','roles_select'),
    ('permissions','permissions_select'),
    ('route_permissions','route_permissions_select_all'),
    ('dashboard_status_config','dashboard_status_config_select_all'),
    ('agent_role_access','agent_role_access_select_all'),
    ('activities','activities_select_authenticated'),
    ('kg_node_kinds','kg_node_kinds_select_auth'),
    ('kg_publishers','kg_publishers_select_auth'),
    ('kg_relations','kg_relations_select_auth'),
    ('kg_nodes','kg_nodes_select_auth'),
    ('kg_edges','kg_edges_select_auth'),
    ('kg_edge_history','kg_edge_history_select_auth'),
    ('website_ai_jobs','website_ai_jobs_select_auth'),
    ('website_crawl_runs','website_crawl_runs_select_auth'),
    ('website_entities','website_entities_select_auth'),
    ('website_media','website_media_select_auth'),
    ('website_media_entities','website_media_entities_select_auth'),
    ('website_page_blocks_cta','website_blocks_cta_select_auth'),
    ('website_page_blocks_faq','website_blocks_faq_select_auth'),
    ('website_page_blocks_features','website_blocks_features_select_auth'),
    ('website_page_blocks_hero','website_blocks_hero_select_auth'),
    ('website_page_blocks_text','website_blocks_text_select_auth'),
    ('website_page_changes','website_page_changes_select_auth'),
    ('website_page_entities','website_page_entities_select_auth'),
    ('website_page_summaries','website_page_summaries_select_auth'),
    ('website_page_versions','website_page_versions_select_auth'),
    ('website_pages','website_pages_select_auth'),
    ('website_sources','website_sources_select_auth')
  ) AS t(tbl, pol)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.pol, r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT public.crm_role_of(auth.uid())) IS NOT NULL)',
      r.tbl || '_select_staff', r.tbl);
  END LOOP;
END $$;

-- 2) User profiles: own row, or any CRM staff member (needed for assignee names)
DROP POLICY IF EXISTS users_profile_select ON public.users_profile;
CREATE POLICY users_profile_select_self_or_staff ON public.users_profile
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR (SELECT public.crm_role_of(auth.uid())) IS NOT NULL);

-- 3) Attendance / wage data: owner and project managers only (matches the /attendance page access)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_entries','attendance_workers','attendance_projects','attendance_period_adjustments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read_authenticated', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR (SELECT public.crm_role_of(auth.uid())) = ''project_manager'')',
      t || '_read_owner_pm', t);
  END LOOP;
END $$;

-- 4) Legacy / settings tables that had full open access: owner only.
--    App code reads settings through the server admin client after its own role check.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_activity','agent_memories','agent_permissions','agent_tasks','agents',
    'contact_messages','email_drafts','email_messages','followup_events','google_ads_keywords',
    'google_ads_recommendations','knowledge_chunks','knowledge_documents','project_status_history',
    'references','reminders','settings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_owner_role(auth.uid())) WITH CHECK (public.is_owner_role(auth.uid()))',
      t || '_owner_all', t);
  END LOOP;
END $$;