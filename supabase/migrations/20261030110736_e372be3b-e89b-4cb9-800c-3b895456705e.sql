-- 1/B: kritikus jogosultsági javítások (12 tábla). Csak szabályok változnak, adat nem.
DROP POLICY IF EXISTS authenticated_full_access ON public.companies;
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY companies_insert ON public.companies FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing'])) WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY companies_delete_owner ON public.companies FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()));

DROP POLICY IF EXISTS contacts_authenticated_access ON public.contacts;
CREATE POLICY contacts_select ON public.contacts FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY contacts_insert ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY contacts_update ON public.contacts FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing'])) WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY contacts_delete_owner ON public.contacts FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()));

DROP POLICY IF EXISTS authenticated_full_access ON public.phone_calls;
CREATE POLICY phone_calls_select ON public.phone_calls FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY phone_calls_insert ON public.phone_calls FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY phone_calls_update ON public.phone_calls FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing'])) WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY phone_calls_delete_owner ON public.phone_calls FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()));

DROP POLICY IF EXISTS authenticated_full_access ON public.meetings;
CREATE POLICY meetings_select ON public.meetings FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY meetings_insert ON public.meetings FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']));
CREATE POLICY meetings_update ON public.meetings FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales'])) WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']));
CREATE POLICY meetings_delete_owner ON public.meetings FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()));

DROP POLICY IF EXISTS tasks_authenticated_access ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']));
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales'])) WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']));
CREATE POLICY tasks_delete_owner ON public.tasks FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()));

DROP POLICY IF EXISTS authenticated_full_access ON public.project_notes;
CREATE POLICY project_notes_select ON public.project_notes FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY project_notes_insert ON public.project_notes FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']) AND author_id = public.current_profile_id()));
CREATE POLICY project_notes_update ON public.project_notes FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']) AND author_id = public.current_profile_id())) WITH CHECK (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']) AND author_id = public.current_profile_id()));
CREATE POLICY project_notes_delete ON public.project_notes FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']) AND author_id = public.current_profile_id()));

DROP POLICY IF EXISTS authenticated_full_access ON public.project_documents;
CREATE POLICY project_documents_select ON public.project_documents FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY project_documents_insert ON public.project_documents FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']) AND uploaded_by = public.current_profile_id()));
CREATE POLICY project_documents_update ON public.project_documents FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']) AND uploaded_by = public.current_profile_id())) WITH CHECK (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']) AND uploaded_by = public.current_profile_id()));
CREATE POLICY project_documents_delete ON public.project_documents FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']) AND uploaded_by = public.current_profile_id()));

DROP POLICY IF EXISTS authenticated_full_access ON public.company_documents;
CREATE POLICY company_documents_select ON public.company_documents FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY company_documents_insert ON public.company_documents FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']) AND uploaded_by = public.current_profile_id()));
CREATE POLICY company_documents_update ON public.company_documents FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']) AND uploaded_by = public.current_profile_id())) WITH CHECK (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']) AND uploaded_by = public.current_profile_id()));
CREATE POLICY company_documents_delete ON public.company_documents FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()) OR (public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']) AND uploaded_by = public.current_profile_id()));

DROP POLICY IF EXISTS authenticated_full_access ON public.project_contacts;
DROP POLICY IF EXISTS project_contacts_select_authenticated ON public.project_contacts;
DROP POLICY IF EXISTS project_contacts_write_authenticated ON public.project_contacts;
CREATE POLICY project_contacts_select ON public.project_contacts FOR SELECT TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales','marketing']));
CREATE POLICY project_contacts_insert ON public.project_contacts FOR INSERT TO authenticated WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']));
CREATE POLICY project_contacts_update ON public.project_contacts FOR UPDATE TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales'])) WITH CHECK (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']));
CREATE POLICY project_contacts_delete ON public.project_contacts FOR DELETE TO authenticated USING (public.is_owner_role(auth.uid()) OR public.crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','pm','sales']));

DROP POLICY IF EXISTS email_threads_write_per_user ON public.email_threads;
CREATE POLICY email_threads_insert_admin ON public.email_threads FOR INSERT TO authenticated WITH CHECK (public.is_email_admin(auth.uid()));
CREATE POLICY email_threads_update_per_user ON public.email_threads FOR UPDATE TO authenticated USING (public.can_access_email_thread(id, auth.uid())) WITH CHECK (public.can_access_email_thread(id, auth.uid()));
CREATE POLICY email_threads_delete_admin ON public.email_threads FOR DELETE TO authenticated USING (public.is_email_admin(auth.uid()));

DROP POLICY IF EXISTS emails_write_per_user ON public.emails;
CREATE POLICY emails_insert_admin ON public.emails FOR INSERT TO authenticated WITH CHECK (public.is_email_admin(auth.uid()));
CREATE POLICY emails_update_per_user ON public.emails FOR UPDATE TO authenticated USING (public.is_email_admin(auth.uid()) OR (thread_id IS NOT NULL AND public.can_access_email_thread(thread_id, auth.uid()))) WITH CHECK (public.is_email_admin(auth.uid()) OR (thread_id IS NOT NULL AND public.can_access_email_thread(thread_id, auth.uid())));
CREATE POLICY emails_delete_admin ON public.emails FOR DELETE TO authenticated USING (public.is_email_admin(auth.uid()));

DROP POLICY IF EXISTS email_attachments_write_authenticated ON public.email_attachments;