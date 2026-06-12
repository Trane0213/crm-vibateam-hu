-- ==========================================================================
-- VIBA CRM — Gmail inkrementális szinkron infrastruktúra
-- Cél: percenkénti automatikus szinkron a Gmail History API segítségével.
--
-- Tartalmaz:
--  1) users_profile.gmail_history_id oszlop (per user checkpoint)
--  2) gmail_sync_runs napló tábla (futások + hibák)
--  3) pg_cron + pg_net extension engedélyezés
--  4) percenkénti cron job, ami meghívja a publikus végpontot
--
-- Idempotens — többször is futtatható.
-- ==========================================================================

-- 1) Checkpoint oszlop ------------------------------------------------------
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS gmail_history_id text;

-- 2) Naplótábla -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_sync_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger            text NOT NULL CHECK (trigger IN ('manual','cron','push','bootstrap')),
  mode               text,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  fetched            int DEFAULT 0,
  inserted           int DEFAULT 0,
  skipped            int DEFAULT 0,
  errors             jsonb DEFAULT '[]'::jsonb,
  history_id_before  text,
  history_id_after   text
);

CREATE INDEX IF NOT EXISTS idx_gmail_sync_runs_user_started
  ON public.gmail_sync_runs (user_id, started_at DESC);

GRANT SELECT ON public.gmail_sync_runs TO authenticated;
GRANT ALL    ON public.gmail_sync_runs TO service_role;

ALTER TABLE public.gmail_sync_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='gmail_sync_runs' AND policyname='own runs read'
  ) THEN
    CREATE POLICY "own runs read" ON public.gmail_sync_runs
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- 3) Extensionök ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4) Percenkénti cron job ---------------------------------------------------
-- Régi job törlése, ha létezik (újrafuttatáskor frissül).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gmail-incremental-sync') THEN
    PERFORM cron.unschedule('gmail-incremental-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'gmail-incremental-sync',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url     := 'https://crm-vibateam-hu.lovable.app/api/public/gmail/cron-sync',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-cron-secret',  current_setting('app.gmail_cron_secret', true)
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);

-- A titkos kulcsot adatbázis-szinten kell beállítani (egyszer, kézzel):
--   ALTER DATABASE postgres SET app.gmail_cron_secret = '<GMAIL_CRON_SECRET>';
-- Majd Supabase-en kell egyszer újraindítani a kapcsolatot, vagy várni a
-- következő percre — a pg_cron új worker session-t indít, ami betölti.