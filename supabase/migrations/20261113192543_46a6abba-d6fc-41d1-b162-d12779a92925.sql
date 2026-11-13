-- AI OS 2.0 / 1. részegység: közös tudásbázis forrás-, verzió- és jogosultságkezelés.
-- Rollback: DROP FUNCTION public.knowledge_search(text,integer,integer); DROP FUNCTION public.knowledge_source_visible(text,uuid);
--   DROP POLICY knowledge_documents_select_source ON public.knowledge_documents; DROP POLICY knowledge_chunks_select_source ON public.knowledge_chunks;
--   ALTER TABLE ... DROP COLUMN (az alábbi új oszlopok); CREATE POLICY knowledge_documents_owner_all/knowledge_chunks_owner_all (ALL, is_owner_role(auth.uid())).

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS source_table text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS quote_id uuid,
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS email_id uuid,
  ADD COLUMN IF NOT EXISTS content_sha256 text,
  ADD COLUMN IF NOT EXISTS byte_length bigint,
  ADD COLUMN IF NOT EXISTS parser text,
  ADD COLUMN IF NOT EXISTS source_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.knowledge_documents
  ADD CONSTRAINT knowledge_documents_source_table_chk CHECK (source_table IS NULL OR source_table IN ('company_documents','project_documents','quote_documents','email_attachments')),
  ADD CONSTRAINT knowledge_documents_status_chk CHECK (processing_status IN ('pending','processed','partial','needs_review','unsupported','error')),
  ADD CONSTRAINT knowledge_documents_source_pair_chk CHECK ((source_table IS NULL) = (source_id IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_source_version_uq
  ON public.knowledge_documents (source_table, source_id, content_sha256) WHERE source_table IS NOT NULL AND content_sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_documents_source_current_uq
  ON public.knowledge_documents (source_table, source_id) WHERE source_table IS NOT NULL AND superseded_at IS NULL;

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS unit_label text,
  ADD COLUMN IF NOT EXISTS unit_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_kind text NOT NULL DEFAULT 'source_fact',
  ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;
ALTER TABLE public.knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_claim_kind_chk CHECK (claim_kind IN ('source_fact','ai_inference','unverified'));
CREATE INDEX IF NOT EXISTS knowledge_chunks_search_idx ON public.knowledge_chunks USING gin (search);
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx ON public.knowledge_chunks (document_id, unit_index);

-- Láthatóság: a hívó az eredeti dokumentumsort a meglévő RLS szerint látja-e (security invoker).
CREATE OR REPLACE FUNCTION public.knowledge_source_visible(p_table text, p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE p_table
    WHEN 'company_documents' THEN EXISTS (SELECT 1 FROM public.company_documents WHERE id = p_id)
    WHEN 'project_documents' THEN EXISTS (SELECT 1 FROM public.project_documents WHERE id = p_id)
    WHEN 'quote_documents'   THEN EXISTS (SELECT 1 FROM public.quote_documents WHERE id = p_id)
    WHEN 'email_attachments' THEN EXISTS (SELECT 1 FROM public.email_attachments WHERE id = p_id)
    ELSE false END
$$;

DROP POLICY IF EXISTS knowledge_documents_owner_all ON public.knowledge_documents;
DROP POLICY IF EXISTS knowledge_chunks_owner_all ON public.knowledge_chunks;

CREATE POLICY knowledge_documents_select_source ON public.knowledge_documents
  FOR SELECT TO authenticated
  USING (CASE WHEN source_table IS NULL THEN public.is_owner_role(auth.uid())
              ELSE public.knowledge_source_visible(source_table, source_id) END);

CREATE POLICY knowledge_chunks_select_source ON public.knowledge_chunks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.knowledge_documents d WHERE d.id = knowledge_chunks.document_id));

REVOKE INSERT, UPDATE, DELETE ON public.knowledge_documents, public.knowledge_chunks FROM anon, authenticated;
REVOKE SELECT ON public.knowledge_documents, public.knowledge_chunks FROM anon;
GRANT SELECT ON public.knowledge_documents, public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_documents, public.knowledge_chunks TO service_role;

-- Keresés: csak aktuális (nem elavult), feldolgozott/részleges verzió; RLS a hívóként érvényes.
CREATE OR REPLACE FUNCTION public.knowledge_search(p_query text, p_page integer DEFAULT 0, p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH q AS (SELECT plainto_tsquery('simple', left(coalesce(p_query, ''), 300)) AS tsq,
                    greatest(1, least(coalesce(p_limit, 10), 25)) AS lim,
                    greatest(0, least(coalesce(p_page, 0), 200)) AS pg),
  hits AS (
    SELECT c.id AS chunk_id, d.id AS document_id, d.title, d.source_table, d.source_id, d.company_id, d.project_id, d.quote_id, d.lead_id, d.email_id,
           d.content_sha256, d.processing_status, d.processed_at, d.source_updated_at, c.unit_label, c.unit_index, c.claim_kind,
           left(c.content, 1200) AS excerpt, ts_rank(c.search, q.tsq) AS rank
    FROM q, public.knowledge_chunks c JOIN public.knowledge_documents d ON d.id = c.document_id
    WHERE d.superseded_at IS NULL AND d.processing_status IN ('processed','partial','needs_review') AND c.search @@ q.tsq
    ORDER BY rank DESC, c.id
    LIMIT (SELECT lim + 1 FROM q) OFFSET (SELECT pg * lim FROM q))
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(to_jsonb(h) - 'rank') FROM (SELECT * FROM hits LIMIT (SELECT lim FROM q)) h), '[]'::jsonb),
    'has_more', (SELECT count(*) FROM hits) > (SELECT lim FROM q),
    'page', (SELECT pg FROM q));
$$;
GRANT EXECUTE ON FUNCTION public.knowledge_search(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_source_visible(text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.knowledge_search(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.knowledge_source_visible(text, uuid) FROM anon;