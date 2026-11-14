-- AI chat-feltöltések szerepköri mappákban (tulajdonosi döntés 2026-11-14).
CREATE OR REPLACE FUNCTION public.ai_chat_folder_of(_auth_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _auth_user IS NULL THEN NULL
    WHEN public.is_owner_role(_auth_user) THEN 'owner'
    WHEN public.crm_role_of(_auth_user) = 'sales' THEN 'sales'
    WHEN public.crm_role_of(_auth_user) = 'marketing' THEN 'marketing'
    WHEN public.crm_role_of(_auth_user) IN ('project_manager', 'pm') THEN 'pm'
    ELSE NULL END
$$;
REVOKE EXECUTE ON FUNCTION public.ai_chat_folder_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_chat_folder_of(uuid) TO authenticated, service_role;

CREATE TABLE public.ai_chat_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder text NOT NULL CHECK (folder IN ('sales', 'marketing', 'pm', 'owner')),
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  uploader_name text,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
  file_url text NOT NULL CHECK (length(file_url) <= 1024),
  mime_type text CHECK (mime_type IS NULL OR length(mime_type) <= 200),
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  agent_id text CHECK (agent_id IS NULL OR agent_id IN ('crm', 'sales', 'pm', 'marketing', 'ads')),
  link_table text CHECK (link_table IS NULL OR link_table IN ('project_documents', 'company_documents', 'quote_documents')),
  link_document_id uuid,
  link_parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((link_table IS NULL) = (link_document_id IS NULL) AND (link_table IS NULL) = (link_parent_id IS NULL))
);
CREATE INDEX ai_chat_uploads_folder_created_idx ON public.ai_chat_uploads (folder, created_at DESC);
CREATE INDEX ai_chat_uploads_file_url_idx ON public.ai_chat_uploads (file_url);

GRANT SELECT, INSERT, DELETE ON public.ai_chat_uploads TO authenticated;
GRANT ALL ON public.ai_chat_uploads TO service_role;
ALTER TABLE public.ai_chat_uploads ENABLE ROW LEVEL SECURITY;

-- Feltöltő azonosítója és neve mindig a bejelentkezett felhasználóból, nem a kliensből.
CREATE OR REPLACE FUNCTION public.ai_chat_uploads_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.uploaded_by := auth.uid();
    NEW.uploader_name := (SELECT up.full_name FROM public.users_profile up WHERE up.auth_user_id = auth.uid() LIMIT 1);
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.ai_chat_uploads_stamp() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER ai_chat_uploads_stamp BEFORE INSERT ON public.ai_chat_uploads FOR EACH ROW EXECUTE FUNCTION public.ai_chat_uploads_stamp();

-- Olvasás: a saját szerepkör mappája; a Tulajdonos minden mappát lát.
CREATE POLICY ai_chat_uploads_select ON public.ai_chat_uploads FOR SELECT TO authenticated
  USING (public.is_owner_role(auth.uid()) OR folder = public.ai_chat_folder_of(auth.uid()));
-- Feltöltés: csak a saját szerepkör mappájába, a szerver által képzett saját útvonalon.
CREATE POLICY ai_chat_uploads_insert ON public.ai_chat_uploads FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND folder = public.ai_chat_folder_of(auth.uid())
    AND file_url LIKE ('ai-chat-uploads/' || folder || '/' || auth.uid()::text || '/%')
    AND file_url NOT LIKE '%..%'
  );
-- Törlés: a feltöltő (amíg ugyanabban a szerepkörben van) vagy a Tulajdonos.
CREATE POLICY ai_chat_uploads_delete ON public.ai_chat_uploads FOR DELETE TO authenticated
  USING (public.is_owner_role(auth.uid()) OR (uploaded_by = auth.uid() AND folder = public.ai_chat_folder_of(auth.uid())));