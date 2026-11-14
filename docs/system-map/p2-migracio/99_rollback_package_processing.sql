-- P2 visszaállítás (TERVEZET – NEM FUTTATOTT). Csak tulajdonosi jóváhagyással, a feldolgozó leállítása után.
-- Hatás: törli a feldolgozási feladatokat, kiolvasott oldalakat és jelentéseket; az eredeti feltöltött fájlok
-- (package_files ellenőrzött sorai, R2-objektumok) megmaradnak. A ZIP-ből kibontott fájlsorok külön döntést igényelnek
-- (ellenőrzött sor nem törölhető a package_files_guard miatt), ezért ez a szkript őket NEM törli, csak a kapcsolatot hagyja.
BEGIN;
DROP TRIGGER IF EXISTS package_processing_jobs_touch ON public.package_processing_jobs;
DROP TRIGGER IF EXISTS package_file_extracts_touch ON public.package_file_extracts;
DROP TABLE IF EXISTS public.package_file_units;
DROP TABLE IF EXISTS public.package_file_extracts;
DROP TABLE IF EXISTS public.package_processing_jobs;
DROP FUNCTION IF EXISTS public.package_processing_touch();
DROP FUNCTION IF EXISTS public.document_package_register_extracted(uuid,text,text,text,bigint,text,text,text,text,bigint,integer);
DELETE FROM public.settings WHERE key = 'document_package_processing';
-- A package_files új oszlopai (extracted_from, archive_entry, extract_depth) és a document_package_register_file
-- P2-es változata maradnak: eltávolításuk a kibontott sorok sorsáról szóló döntés után, külön lépésben.
COMMIT;
