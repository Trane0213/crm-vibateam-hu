-- VIBA CRM P1 – Tervcsomagok (nagyfájlos, darabolt, folytatható feltöltés)
-- ÁLLAPOT: TERVEZET – tulajdonosi jóváhagyásig NEM futtatható élesen.
-- Csak ÚJ objektumokat hoz létre; meglévő tábla, policy, adat nem változik.
-- Visszaállítás: 99_rollback_document_packages.sql (az R2-ben lévő objektumokat nem törli).

-- 1) Csomag: egy ügy (projekt VAGY ajánlat) teljes dokumentációja.
CREATE TABLE public.document_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_kind text NOT NULL CHECK (parent_kind IN ('project','quote')),
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  source text NOT NULL DEFAULT 'files' CHECK (source IN ('files','folder','zip','mixed')),
  created_by uuid NOT NULL,                       -- auth.users.id (szerver állítja)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_packages_one_parent CHECK (
    (parent_kind = 'project' AND project_id IS NOT NULL AND quote_id IS NULL) OR
    (parent_kind = 'quote'   AND quote_id IS NOT NULL AND project_id IS NULL))
);
CREATE INDEX document_packages_project_idx ON public.document_packages (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX document_packages_quote_idx ON public.document_packages (quote_id, created_at DESC) WHERE quote_id IS NOT NULL;

-- 2) Csomagfájl: eredeti objektum + feltöltési munkamenet + verzió + feldolgozási állapot.
CREATE TABLE public.package_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.document_packages(id) ON DELETE RESTRICT,
  parent_kind text NOT NULL,                      -- denormalizált a kvóta- és duplikációvizsgálathoz
  parent_id uuid NOT NULL,
  relative_path text NOT NULL CHECK (char_length(relative_path) BETWEEN 1 AND 1000 AND relative_path NOT LIKE '%..%' AND left(relative_path,1) <> '/'),
  name text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  mime_type text,
  file_kind text,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  fingerprint text NOT NULL,                      -- útvonal|méret|módosítás – folytatáshoz
  r2_key text UNIQUE,                             -- csak szerver képzi; duplikátumnál NULL
  upload_id text,                                 -- R2 többrészes azonosító (befejezés után NULL)
  part_size bigint,
  part_count integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploading','verified','failed','aborted','duplicate')),
  duplicate_of uuid REFERENCES public.package_files(id),
  revision_no integer NOT NULL DEFAULT 1,
  revision_of uuid REFERENCES public.package_files(id),
  processing_status text NOT NULL DEFAULT 'waiting' CHECK (processing_status IN ('waiting','not_supported','processing','done','partial','unreadable')),
  error_code text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
CREATE INDEX package_files_package_idx ON public.package_files (package_id, relative_path);
CREATE INDEX package_files_parent_sha_idx ON public.package_files (parent_kind, parent_id, sha256);
CREATE INDEX package_files_parent_path_idx ON public.package_files (parent_kind, parent_id, relative_path);
CREATE INDEX package_files_open_idx ON public.package_files (uploaded_by, status) WHERE status IN ('pending','uploading');

-- 3) Darabok: kliens által számolt MD5 (az R2 darab-ETag-gel lezáráskor összevetve).
CREATE TABLE public.package_file_parts (
  file_id uuid NOT NULL REFERENCES public.package_files(id) ON DELETE CASCADE,
  part_number integer NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  md5 text NOT NULL CHECK (md5 ~ '^[0-9a-f]{32}$'),
  etag text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, part_number)
);

-- 4) Napló: minden munkamenet-esemény (indítás, folytatás, lezárás, hiba, megszakítás).
CREATE TABLE public.package_upload_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES public.document_packages(id) ON DELETE RESTRICT,
  file_id uuid REFERENCES public.package_files(id) ON DELETE SET NULL,
  actor uuid NOT NULL,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX package_upload_events_pkg_idx ON public.package_upload_events (package_id, created_at DESC);

-- 5) Jogosultság: a böngésző CSAK olvas; minden írás a szerveren, jogosultság-ellenőrzés után.
GRANT SELECT ON public.document_packages, public.package_files, public.package_file_parts, public.package_upload_events TO authenticated;
GRANT ALL ON public.document_packages, public.package_files, public.package_file_parts, public.package_upload_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.package_upload_events_id_seq TO service_role;

ALTER TABLE public.document_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_file_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_upload_events ENABLE ROW LEVEL SECURITY;

-- Láthatóság = a szülő ügy láthatósága a hívó SAJÁT jogával (SECURITY INVOKER):
-- projekt → a meglévő projects_read; ajánlat → a meglévő quotes_access (can_access_quote).
-- Így a csomagok pontosan annyira láthatók, mint ma a szülő – se bővítés, se szűkítés.
CREATE OR REPLACE FUNCTION public.document_package_parent_visible(p_kind text, p_project uuid, p_quote uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE p_kind
    WHEN 'project' THEN EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project)
    WHEN 'quote'   THEN EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = p_quote)
    ELSE false END
$$;
REVOKE ALL ON FUNCTION public.document_package_parent_visible(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_package_parent_visible(text, uuid, uuid) TO authenticated, service_role;

CREATE POLICY document_packages_select ON public.document_packages FOR SELECT TO authenticated
  USING (public.document_package_parent_visible(parent_kind, project_id, quote_id));
CREATE POLICY package_files_select ON public.package_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.document_packages d WHERE d.id = package_files.package_id));
CREATE POLICY package_file_parts_select ON public.package_file_parts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.package_files f WHERE f.id = package_file_parts.file_id));
CREATE POLICY package_upload_events_select ON public.package_upload_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.document_packages d WHERE d.id = package_upload_events.package_id));

-- 6) Eredeti változatlansága: ellenőrzött fájl tárolási adatai nem módosíthatók, és nem törölhető.
CREATE OR REPLACE FUNCTION public.package_files_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'verified' THEN RAISE EXCEPTION 'Ellenőrzött eredeti csomagfájl nem törölhető'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'verified' AND (NEW.r2_key IS DISTINCT FROM OLD.r2_key OR NEW.sha256 IS DISTINCT FROM OLD.sha256
      OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR NEW.relative_path IS DISTINCT FROM OLD.relative_path
      OR NEW.package_id IS DISTINCT FROM OLD.package_id OR NEW.status <> 'verified') THEN
    RAISE EXCEPTION 'Ellenőrzött eredeti csomagfájl tárolási adatai nem módosíthatók';
  END IF;
  IF OLD.status IN ('aborted','duplicate') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Lezárt csomagfájl állapota nem változtatható';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER package_files_guard BEFORE UPDATE OR DELETE ON public.package_files
  FOR EACH ROW EXECUTE FUNCTION public.package_files_guard();

-- 7) Regisztráció egy tranzakcióban, ügyenkénti zárolással: kvóta, duplikáció, verzió.
--    Csak a szerver (service_role) hívhatja, MIUTÁN a hívó jogosultságát a saját kliensével ellenőrizte.
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

  -- Folytatás: ugyanaz a helyi fájl ugyanabban a csomagban → a meglévő munkamenet.
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
   WHERE parent_kind = pkg.parent_kind AND parent_id = v_parent AND status IN ('pending','uploading','verified') AND duplicate_of IS NULL;
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

-- 8) Alapértelmezett korlátok (tulajdonos módosíthatja a meglévő settings táblában; owner-only RLS változatlan).
INSERT INTO public.settings (key, value)
SELECT 'document_package_limits', jsonb_build_object('maxFileBytes', 1073741824, 'maxParentBytes', 5368709120, 'maxFilesPerPackage', 5000)
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'document_package_limits');