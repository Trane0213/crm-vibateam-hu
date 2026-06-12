-- ============================================================
-- VIBA CRM — Stabilitási csomag: duplikáció-védelem + audit indexek
-- 2026-06-17
-- Idempotens, biztonságos. Másold a Supabase SQL Editorba, majd Run.
--
-- Fontos: a CREATE UNIQUE INDEX **meglévő duplikátumon hibára futna**,
-- ezért minden UNIQUE indexet egy DO blokk véd: előbb megnézi, van-e
-- duplikátum, és csak akkor hozza létre. Ha van, RAISE NOTICE-ban
-- felsorolja az érintett kulcsokat — futtasd újra, miután kitisztítottad.
-- ============================================================

-- 1) AI Action Log keresési indexek (audit gyors lekérdezéshez) ----
CREATE INDEX IF NOT EXISTS idx_ai_action_log_user_created
  ON public.ai_action_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_log_agent_action
  ON public.ai_action_log(agent_type, action_type, created_at DESC);

-- 2) Kapcsolattartók — e-mail (case-insensitive) duplikátum-védelem
--    Csak akkor, ha minden e-mailes contact e-mailje már egyedi.
DO $$
DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT lower(email) AS e, COUNT(*) c
      FROM public.contacts
     WHERE email IS NOT NULL AND length(trim(email)) > 0
     GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) d;
  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_contacts_email_lower
      ON public.contacts (lower(email))
      WHERE email IS NOT NULL AND length(trim(email)) > 0;
    RAISE NOTICE 'uniq_contacts_email_lower létrehozva.';
  ELSE
    RAISE NOTICE 'KIHAGYVA: % darab duplikált contacts.email — tisztítsd először.', dup_count;
  END IF;
END $$;

-- 3) Cégek — név alapján (lower) — opcionális, csak ha tiszta a tábla.
DO $$
DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT lower(trim(name)) AS n, COUNT(*) c
      FROM public.companies
     WHERE name IS NOT NULL AND length(trim(name)) > 0
     GROUP BY lower(trim(name))
    HAVING COUNT(*) > 1
  ) d;
  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_companies_name_lower
      ON public.companies (lower(trim(name)))
      WHERE name IS NOT NULL AND length(trim(name)) > 0;
    RAISE NOTICE 'uniq_companies_name_lower létrehozva.';
  ELSE
    RAISE NOTICE 'KIHAGYVA: % darab duplikált cégnév — tisztítsd először.', dup_count;
  END IF;
END $$;

-- 4) Feladatok — projekt + cím (lower) duplikátum-szűrés a nyitott feladatokra
DO $$
DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT project_id, lower(trim(title)) AS t, COUNT(*) c
      FROM public.tasks
     WHERE project_id IS NOT NULL
       AND title IS NOT NULL AND length(trim(title)) > 0
       AND coalesce(status, '') NOT IN ('done','completed','cancelled')
     GROUP BY project_id, lower(trim(title))
    HAVING COUNT(*) > 1
  ) d;
  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_open_project_title
      ON public.tasks (project_id, lower(trim(title)))
      WHERE project_id IS NOT NULL
        AND coalesce(status,'') NOT IN ('done','completed','cancelled');
    RAISE NOTICE 'uniq_tasks_open_project_title létrehozva.';
  ELSE
    RAISE NOTICE 'KIHAGYVA: % duplikált nyitott feladat (projekt+cím) — tisztítsd először.', dup_count;
  END IF;
END $$;

-- 5) Utókövetések — keresési indexek (gyors dedup lookup-hoz)
CREATE INDEX IF NOT EXISTS idx_followups_company_due
  ON public.followups(company_id, due_date)
  WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_followups_project_due
  ON public.followups(project_id, due_date)
  WHERE completed = false;
CREATE INDEX IF NOT EXISTS idx_followups_quote_due
  ON public.followups(quote_id, due_date)
  WHERE completed = false;

-- 6) Érdeklődők — gyors lookup company_id-ra
CREATE INDEX IF NOT EXISTS idx_leads_company_status
  ON public.leads(company_id, status);

-- 7) Ajánlatok — projekt+verzió ne tudjon duplikálódni
DO $$
DECLARE dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT project_id, version, COUNT(*) c
      FROM public.quotes
     WHERE project_id IS NOT NULL AND version IS NOT NULL
     GROUP BY project_id, version
    HAVING COUNT(*) > 1
  ) d;
  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_quotes_project_version
      ON public.quotes (project_id, version)
      WHERE project_id IS NOT NULL AND version IS NOT NULL;
    RAISE NOTICE 'uniq_quotes_project_version létrehozva.';
  ELSE
    RAISE NOTICE 'KIHAGYVA: % duplikált quotes(project_id,version) — tisztítsd először.', dup_count;
  END IF;
END $$;

-- 8) Data API GRANT-ok ellenőrzése (idempotens, csak hozzáfér, RLS marad)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','contacts','leads','projects','quotes',
    'followups','tasks','project_documents','project_notes',
    'emails','phone_calls','meetings','ai_action_log','activity_log'
  ]::text[]
  LOOP
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'Kihagyva (nincs ilyen tábla): %', t;
    END;
  END LOOP;
END $$;

-- ============================================================
-- VÉGE. Ha minden RAISE NOTICE „létrehozva", a védőhálók aktívak.
-- Ahol „KIHAGYVA" szerepel, ott a duplikátum-tisztítás után futtasd újra.
-- ============================================================