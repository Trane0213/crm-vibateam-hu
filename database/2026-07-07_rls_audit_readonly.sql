-- ============================================================================
-- VIBA CRM — RLS audit (READ-ONLY)
-- Marketing / Sales / PM szerepekhez tartozó policy-k és GRANT-ek átnézése.
-- Nem módosít semmit. Futtasd a Supabase SQL Editorban.
-- ============================================================================

-- 1) Érintett táblák RLS állapota
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('leads','quotes','quote_items','projects','tasks',
                    'followups','followup_events','project_documents',
                    'companies','contacts','emails')
ORDER BY tablename;

-- 2) Az érintett táblák összes policy-ja (cmd, roles, USING, WITH CHECK)
SELECT tablename, policyname, cmd, roles,
       qual        AS using_expression,
       with_check  AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads','quotes','quote_items','projects','tasks',
                    'followups','followup_events','project_documents')
ORDER BY tablename, cmd, policyname;

-- 3) Data-API GRANT-ek ellenőrzése (anon/authenticated/service_role)
SELECT table_name, grantee,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon','authenticated','service_role')
  AND table_name IN ('leads','quotes','quote_items','projects','tasks',
                     'followups','followup_events','project_documents')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- 4) Szerepkör-eloszlás
SELECT COALESCE(r.name,'(nincs)') AS role_name, count(*) AS users
FROM public.users_profile up
LEFT JOIN public.roles r ON r.id = up.role_id
GROUP BY r.name ORDER BY users DESC;

-- 5) Diagnózis: van-e RLS policy quotes / quote_items / projects táblán?
--    Ha csak `authenticated_full_access` szerepel — a modell nem szerepkör-szigorú,
--    de sales/marketing/pm nem fut RLS hibába. Ha egyáltalán nincs policy és
--    RLS engedélyezve van → minden UPDATE/INSERT elutasítva.
SELECT tablename, count(*) AS policy_count
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('quotes','quote_items','projects')
GROUP BY tablename;