-- ============================================================================
-- VIBA CRM — Sprint 2 / RLS audit + Tasks "Felelős" diagnosztika
-- READ-ONLY. Csak SELECT. Nem hoz létre, nem módosít, nem töröl semmit.
-- Futtasd a Supabase SQL Editorban (authenticated szerepkörrel).
-- ============================================================================

-- 1) Minden public-séma RLS állapota
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY rowsecurity DESC, tablename;

-- 2) Minden RLS policy a public sémán (parancs, szerep, USING/WITH CHECK)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual          AS using_expression,
  with_check    AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- 3) Adat API jogosultságok (GRANT-ek) public séma tábláira
SELECT
  table_name,
  grantee,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon','authenticated','service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;

-- ----------------------------------------------------------------------------
-- TASK-001 – Tasks "Felelős" diagnosztika
-- ----------------------------------------------------------------------------

-- 4) users_profile policy-k konkrétan
SELECT policyname, cmd, roles, qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users_profile'
ORDER BY cmd, policyname;

-- 5) Hány users_profile sor látható a *jelenleg bejelentkezett* user szemszögéből?
--    Ha 1 jön vissza miközben több létezik → strict per-user RLS → lookup üres.
SELECT count(*) AS visible_profiles FROM public.users_profile;

-- 6) Tasks felelős kitöltöttség
SELECT
  count(*)                                          AS total_tasks,
  count(assigned_user)                              AS with_assignee,
  count(*) FILTER (WHERE assigned_user IS NULL)     AS without_assignee
FROM public.tasks;

-- 7) Profil-rekordok ahol nincs érvényes role_id (H5 előfeltétele)
SELECT up.id, up.email, up.full_name, up.role_id
FROM public.users_profile up
LEFT JOIN public.roles r ON r.id = up.role_id
WHERE up.role_id IS NULL OR r.id IS NULL
ORDER BY up.email;

-- 8) Effektív szerepkör eloszlás (role_id alapján)
SELECT COALESCE(r.name, '(nincs role_id)') AS role_name, count(*) AS users
FROM public.users_profile up
LEFT JOIN public.roles r ON r.id = up.role_id
GROUP BY r.name
ORDER BY users DESC;