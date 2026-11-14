-- VIBA CRM P2 – Tervcsomagok feldolgozása (elkülönített feldolgozó). Csak új objektumok + 2 új oszlop + a regisztráló függvény kvótaszámítása.

-- 1) Kibontott fájlok kapcsolata
ALTER TABLE public.package_files
  ADD COLUMN extracted_from uuid REFERENCES public.package_files(id) ON DELETE RESTRICT,
  ADD COLUMN archive_entry text CHECK (archive_entry IS NULL OR char_length(archive_entry) BETWEEN 1 AND 1000),
  ADD COLUMN extract_depth smallint NOT NULL DEFAULT 0 CHECK (extract_depth BETWEEN 0 AND 3);
CREATE UNIQUE INDEX package_files_extracted_entry_idx ON public.package_files (extracted_from, archive_entry) WHERE extracted_from IS NOT NULL;

-- 2) Feldolgozási feladatok
CREATE TABLE public.package_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.package_files(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL REFERENCES public.document_packages(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatched','running','done','failed','cancelled')),
  attempt integer NOT NULL DEFAULT 0,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  dispatched_at timestamptz, heartbeat_at timestamptz, finished_at timestamptz,
  error_code text, error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX package_processing_jobs_active_idx ON public.package_processing_jobs (file_id) WHERE status IN ('queued','dispatched','running');
CREATE INDEX package_processing_jobs_pkg_idx ON public.package_processing_jobs (package_id, created_at DESC);

-- 3) Fájlonkénti eredmény
CREATE TABLE public.package_file_extracts (
  file_id uuid PRIMARY KEY REFERENCES public.package_files(id) ON DELETE RESTRICT,
  job_id uuid REFERENCES public.package_processing_jobs(id) ON DELETE SET NULL,
  parser text NOT NULL,
  status text NOT NULL CHECK (status IN ('done','partial','unreadable','not_supported','corrupt')),
  sha256_ok boolean,
  page_count integer, text_pages integer, ocr_pages integer, ocr_skipped integer, unreadable_pages integer,
  sheet_count integer, formula_count integer, entry_count integer, extracted_count integer,
  has_macros boolean NOT NULL DEFAULT false, encrypted boolean NOT NULL DEFAULT false,
  structure_key text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  problems jsonb NOT NULL DEFAULT '[]'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Kiolvasott szöveg oldalanként / munkalaponként (kereshető)
CREATE TABLE public.package_file_units (
  file_id uuid NOT NULL REFERENCES public.package_files(id) ON DELETE RESTRICT,
  unit_kind text NOT NULL CHECK (unit_kind IN ('page','sheet','text')),
  unit_no integer NOT NULL CHECK (unit_no >= 1),
  label text,
  source text NOT NULL CHECK (source IN ('text_layer','ocr','sheet','text')),
  text text NOT NULL,
  chars integer NOT NULL DEFAULT 0,
  ai_extracted boolean NOT NULL DEFAULT false,
  uncertain jsonb NOT NULL DEFAULT '[]'::jsonb,
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(label,'') || ' ' || left(text, 200000))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, unit_kind, unit_no)
);
CREATE INDEX package_file_units_search_idx ON public.package_file_units USING gin (search);

-- 5) Jogosultság: böngésző csak olvas; írás csak szerveren
GRANT SELECT ON public.package_processing_jobs, public.package_file_extracts, public.package_file_units TO authenticated;
GRANT ALL ON public.package_processing_jobs, public.package_file_extracts, public.package_file_units TO service_role;
ALTER TABLE public.package_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_file_extracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_file_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY package_processing_jobs_select ON public.package_processing_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.package_files f WHERE f.id = package_processing_jobs.file_id));
CREATE POLICY package_file_extracts_select ON public.package_file_extracts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.package_files f WHERE f.id = package_file_extracts.file_id));
CREATE POLICY package_file_units_select ON public.package_file_units FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.package_files f WHERE f.id = package_file_units.file_id));

CREATE OR REPLACE FUNCTION public.package_processing_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER package_processing_jobs_touch BEFORE UPDATE ON public.package_processing_jobs FOR EACH ROW EXECUTE FUNCTION public.package_processing_touch();
CREATE TRIGGER package_file_extracts_touch BEFORE UPDATE ON public.package_file_extracts FOR EACH ROW EXECUTE FUNCTION public.package_processing_touch();

-- 6) Kibontott ZIP-bejegyzés regisztrálása (szerver hívja a feldolgozó aláírt visszajelzésére). Idempotens: ugyanaz a bejegyzés újra → ugyanaz a sor.
CREATE OR REPLACE FUNCTION public.document_package_register_extracted(
  p_zip uuid, p_entry text, p_relative_path text, p_name text, p_size bigint, p_mime text, p_kind text,
  p_sha256 text, p_processing text, p_max_file bigint, p_max_files integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE z public.package_files%ROWTYPE; v_row public.package_files%ROWTYPE; v_same public.package_files%ROWTYPE; v_count integer; v_id uuid;
BEGIN
  SELECT * INTO z FROM public.package_files WHERE id = p_zip;
  IF NOT FOUND OR z.status <> 'verified' THEN RETURN jsonb_build_object('action','reject','reason','no_archive'); END IF;
  IF z.extract_depth >= 2 THEN RETURN jsonb_build_object('action','reject','reason','too_deep'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('document_package:' || z.parent_kind || ':' || z.parent_id::text, 0));
  SELECT * INTO v_row FROM public.package_files WHERE extracted_from = p_zip AND archive_entry = p_entry;
  IF FOUND THEN
    RETURN jsonb_build_object('action', CASE v_row.status WHEN 'verified' THEN 'verified' WHEN 'duplicate' THEN 'duplicate' ELSE 'upload' END,
      'file_id', v_row.id, 'r2_key', v_row.r2_key, 'sha256', v_row.sha256);
  END IF;
  IF p_size > p_max_file THEN RETURN jsonb_build_object('action','reject','reason','file_too_large'); END IF;
  SELECT count(*) INTO v_count FROM public.package_files WHERE package_id = z.package_id AND status <> 'aborted';
  IF v_count >= p_max_files THEN RETURN jsonb_build_object('action','reject','reason','too_many_files'); END IF;
  SELECT * INTO v_same FROM public.package_files
   WHERE parent_kind = z.parent_kind AND parent_id = z.parent_id AND sha256 = p_sha256 AND status = 'verified' AND duplicate_of IS NULL
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.package_files (package_id, parent_kind, parent_id, relative_path, name, size_bytes, mime_type, file_kind, sha256, fingerprint,
      status, duplicate_of, processing_status, uploaded_by, extracted_from, archive_entry, extract_depth)
    VALUES (z.package_id, z.parent_kind, z.parent_id, p_relative_path, p_name, p_size, p_mime, p_kind, p_sha256, 'zip:' || p_zip || ':' || p_entry,
      'duplicate', v_same.id, v_same.processing_status, z.uploaded_by, p_zip, p_entry, z.extract_depth + 1) RETURNING id INTO v_id;
    RETURN jsonb_build_object('action','duplicate','file_id',v_id,'of',v_same.id,'of_path',v_same.relative_path);
  END IF;
  INSERT INTO public.package_files (package_id, parent_kind, parent_id, relative_path, name, size_bytes, mime_type, file_kind, sha256, fingerprint,
    status, processing_status, uploaded_by, extracted_from, archive_entry, extract_depth)
  VALUES (z.package_id, z.parent_kind, z.parent_id, p_relative_path, p_name, p_size, p_mime, p_kind, p_sha256, 'zip:' || p_zip || ':' || p_entry,
    'uploading', p_processing, z.uploaded_by, p_zip, p_entry, z.extract_depth + 1) RETURNING id INTO v_id;
  RETURN jsonb_build_object('action','upload','file_id',v_id);
END $$;
REVOKE ALL ON FUNCTION public.document_package_register_extracted(uuid,text,text,text,bigint,text,text,text,text,bigint,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_package_register_extracted(uuid,text,text,text,bigint,text,text,text,text,bigint,integer) TO service_role;

-- 7) Kvóta: csak az eredeti feltöltések számítanak (a kibontott másolatok nem). Minden más változatlan.
CREATE OR REPLACE FUNCTION public.document_package_register_file(
  p_package uuid, p_user uuid, p_relative_path text, p_name text, p_size bigint, p_mime text, p_kind text,
  p_sha256 text, p_fingerprint text, p_part_size bigint, p_part_count integer, p_processing text,
  p_max_file bigint, p_max_parent bigint, p_max_files integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pkg public.document_packages%ROWTYPE; v_parent uuid; v_same public.package_files%ROWTYPE;
  v_used bigint; v_count integer; v_rev integer; v_root uuid; v_id uuid; v_resume public.package_files%ROWTYPE;
BEGIN
  SELECT * INTO pkg FROM public.document_packages WHERE id = p_package;
  IF NOT FOUND THEN RETURN jsonb_build_object('action','reject','reason','no_package'); END IF;
  v_parent := COALESCE(pkg.project_id, pkg.quote_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('document_package:' || pkg.parent_kind || ':' || v_parent::text, 0));

  SELECT * INTO v_resume FROM public.package_files
   WHERE package_id = p_package AND fingerprint = p_fingerprint AND sha256 = p_sha256 AND status IN ('pending','uploading','verified','duplicate')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND v_resume.status = 'duplicate' THEN
    RETURN jsonb_build_object('action','duplicate','file_id',v_resume.id,'of',v_resume.duplicate_of,
      'of_path',(SELECT relative_path FROM public.package_files WHERE id = v_resume.duplicate_of));
  END IF;
  IF FOUND THEN RETURN jsonb_build_object('action','resume','file_id',v_resume.id,'status',v_resume.status); END IF;

  IF p_size > p_max_file THEN RETURN jsonb_build_object('action','reject','reason','file_too_large'); END IF;
  SELECT count(*) INTO v_count FROM public.package_files WHERE package_id = p_package AND status <> 'aborted';
  IF v_count >= p_max_files THEN RETURN jsonb_build_object('action','reject','reason','too_many_files'); END IF;

  SELECT * INTO v_same FROM public.package_files
   WHERE parent_kind = pkg.parent_kind AND parent_id = v_parent AND sha256 = p_sha256
     AND status IN ('pending','uploading','verified') AND duplicate_of IS NULL
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.package_files (package_id, parent_kind, parent_id, relative_path, name, size_bytes, mime_type, file_kind, sha256, fingerprint,
      status, duplicate_of, processing_status, uploaded_by)
    VALUES (p_package, pkg.parent_kind, v_parent, p_relative_path, p_name, p_size, p_mime, p_kind, p_sha256, p_fingerprint,
      'duplicate', v_same.id, v_same.processing_status, p_user) RETURNING id INTO v_id;
    RETURN jsonb_build_object('action','duplicate','file_id',v_id,'of',v_same.id,'of_path',v_same.relative_path);
  END IF;

  SELECT COALESCE(sum(size_bytes),0) INTO v_used FROM public.package_files
   WHERE parent_kind = pkg.parent_kind AND parent_id = v_parent AND status IN ('pending','uploading','verified') AND duplicate_of IS NULL
     AND extracted_from IS NULL;
  IF v_used + p_size > p_max_parent THEN RETURN jsonb_build_object('action','reject','reason','parent_quota','used',v_used); END IF;

  SELECT max(revision_no), COALESCE(min(revision_of::text)::uuid, (array_agg(id ORDER BY created_at))[1])
    INTO v_rev, v_root FROM public.package_files
   WHERE parent_kind = pkg.parent_kind AND parent_id = v_parent AND relative_path = p_relative_path
     AND status IN ('pending','uploading','verified') AND duplicate_of IS NULL;

  INSERT INTO public.package_files (package_id, parent_kind, parent_id, relative_path, name, size_bytes, mime_type, file_kind, sha256, fingerprint,
    part_size, part_count, status, revision_no, revision_of, processing_status, uploaded_by)
  VALUES (p_package, pkg.parent_kind, v_parent, p_relative_path, p_name, p_size, p_mime, p_kind, p_sha256, p_fingerprint,
    p_part_size, p_part_count, 'pending', COALESCE(v_rev,0) + 1, CASE WHEN v_rev IS NULL THEN NULL ELSE v_root END, p_processing, p_user)
  RETURNING id INTO v_id;
  UPDATE public.document_packages SET updated_at = now() WHERE id = p_package;
  RETURN jsonb_build_object('action','upload','file_id',v_id,'revision_no',COALESCE(v_rev,0) + 1);
END $$;
REVOKE ALL ON FUNCTION public.document_package_register_file(uuid,uuid,text,text,bigint,text,text,text,text,bigint,integer,text,bigint,bigint,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_package_register_file(uuid,uuid,text,text,bigint,text,text,text,text,bigint,integer,text,bigint,bigint,integer) TO service_role;

-- 8) Feldolgozási alapbeállítás (tulajdonos módosíthatja a meglévő settings táblában)
INSERT INTO public.settings (key, value)
SELECT 'document_package_processing', jsonb_build_object('ocrEnabled', true, 'ocrPagesPerPackage', 300, 'maxZipEntries', 20000, 'maxExpandRatio', 200)
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'document_package_processing');