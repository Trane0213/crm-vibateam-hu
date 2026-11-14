-- VIBA CRM P1 – visszaállítás. Csak az új objektumokat távolítja el; meglévő adat nem érintett.
-- FIGYELEM: a csomagfájl-sorok törlődnek; az R2 objektumok (document-packages/...) megmaradnak, külön, tételes döntéssel takaríthatók.
-- Futtatás előtt: snapshot (COPY) a négy tábláról.
DROP TRIGGER IF EXISTS package_files_guard ON public.package_files;
DROP FUNCTION IF EXISTS public.document_package_register_file(uuid,uuid,text,text,bigint,text,text,text,text,bigint,integer,text,bigint,bigint,integer);
DROP TABLE IF EXISTS public.package_upload_events;
DROP TABLE IF EXISTS public.package_file_parts;
DROP TABLE IF EXISTS public.package_files;
DROP TABLE IF EXISTS public.document_packages;
DROP FUNCTION IF EXISTS public.package_files_guard();
DROP FUNCTION IF EXISTS public.document_package_parent_visible(text, uuid, uuid);
DELETE FROM public.settings WHERE key = 'document_package_limits';
