-- VIBA CRM – 1/B jogosultsági javítás VISSZAÁLLÍTÁSA
-- A 2026-10-30-i 1/B migráció előtti PONTOS szabályállapotot állítja vissza
-- (pg_policies exportból generálva, 12 tábla). Adatot nem érint.
-- Futtatás: Supabase SQL Editorban egyben.
BEGIN;

-- 1) Az 1/B által létrehozott szabályok eldobása
DROP POLICY IF EXISTS companies_select ON public.companies;
DROP POLICY IF EXISTS companies_insert ON public.companies;
DROP POLICY IF EXISTS companies_update ON public.companies;
DROP POLICY IF EXISTS companies_delete_owner ON public.companies;
DROP POLICY IF EXISTS contacts_select ON public.contacts;
DROP POLICY IF EXISTS contacts_insert ON public.contacts;
DROP POLICY IF EXISTS contacts_update ON public.contacts;
DROP POLICY IF EXISTS contacts_delete_owner ON public.contacts;
DROP POLICY IF EXISTS phone_calls_select ON public.phone_calls;
DROP POLICY IF EXISTS phone_calls_insert ON public.phone_calls;
DROP POLICY IF EXISTS phone_calls_update ON public.phone_calls;
DROP POLICY IF EXISTS phone_calls_delete_owner ON public.phone_calls;
DROP POLICY IF EXISTS meetings_select ON public.meetings;
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
DROP POLICY IF EXISTS meetings_update ON public.meetings;
DROP POLICY IF EXISTS meetings_delete_owner ON public.meetings;
DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_owner ON public.tasks;
DROP POLICY IF EXISTS project_notes_select ON public.project_notes;
DROP POLICY IF EXISTS project_notes_insert ON public.project_notes;
DROP POLICY IF EXISTS project_notes_update ON public.project_notes;
DROP POLICY IF EXISTS project_notes_delete ON public.project_notes;
DROP POLICY IF EXISTS project_documents_select ON public.project_documents;
DROP POLICY IF EXISTS project_documents_insert ON public.project_documents;
DROP POLICY IF EXISTS project_documents_update ON public.project_documents;
DROP POLICY IF EXISTS project_documents_delete ON public.project_documents;
DROP POLICY IF EXISTS company_documents_select ON public.company_documents;
DROP POLICY IF EXISTS company_documents_insert ON public.company_documents;
DROP POLICY IF EXISTS company_documents_update ON public.company_documents;
DROP POLICY IF EXISTS company_documents_delete ON public.company_documents;
DROP POLICY IF EXISTS project_contacts_select ON public.project_contacts;
DROP POLICY IF EXISTS project_contacts_insert ON public.project_contacts;
DROP POLICY IF EXISTS project_contacts_update ON public.project_contacts;
DROP POLICY IF EXISTS project_contacts_delete ON public.project_contacts;
DROP POLICY IF EXISTS email_threads_insert_admin ON public.email_threads;
DROP POLICY IF EXISTS email_threads_update_per_user ON public.email_threads;
DROP POLICY IF EXISTS email_threads_delete_admin ON public.email_threads;
DROP POLICY IF EXISTS emails_insert_admin ON public.emails;
DROP POLICY IF EXISTS emails_update_per_user ON public.emails;
DROP POLICY IF EXISTS emails_delete_admin ON public.emails;

-- 2) Eredeti szabályok (2026-10-30 11:05 UTC állapot)
CREATE POLICY authenticated_full_access ON public.companies AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.company_documents AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY contacts_authenticated_access ON public.contacts AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY email_attachments_write_authenticated ON public.email_attachments AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY email_threads_write_per_user ON public.email_threads AS PERMISSIVE FOR ALL TO authenticated USING (can_access_email_thread(id, auth.uid())) WITH CHECK (true);
CREATE POLICY emails_write_per_user ON public.emails AS PERMISSIVE FOR ALL TO authenticated USING ((is_email_admin(auth.uid()) OR ((thread_id IS NOT NULL) AND can_access_email_thread(thread_id, auth.uid())))) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.meetings AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.phone_calls AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.project_contacts AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY project_contacts_select_authenticated ON public.project_contacts AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY project_contacts_write_authenticated ON public.project_contacts AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.project_documents AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_full_access ON public.project_notes AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tasks_authenticated_access ON public.tasks AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Változatlanul megmaradó (nem kell újra létrehozni):
--   email_attachments_select_per_user, email_threads_select_per_user, emails_select_per_user

COMMIT;
