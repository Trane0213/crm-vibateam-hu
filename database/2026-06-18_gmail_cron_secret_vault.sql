-- ==========================================================================
-- VIBA CRM — Gmail cron secret áthelyezése Supabase Vault-ba
--
-- Háttér:
--   A `ALTER DATABASE postgres SET app.gmail_cron_secret = '...'` parancs
--   Supabase-en `permission denied to set parameter` hibát ad, mert a
--   managed Postgreshez nincs SUPERUSER hozzáférés.
--
-- Megoldás:
--   A titkot a Supabase Vault-ban tároljuk (`vault.secrets`), és a cron job
--   közvetlenül onnan olvassa SQL-ből — nincs szükség DB szintű GUC-ra.
--
-- Idempotens — többször is futtatható.
-- ==========================================================================

-- 1) Vault extension ------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- 2) Titok mentése / frissítése ------------------------------------------
--    Ugyanazt az értéket használjuk, mint a Lovable Secrets `GMAIL_CRON_SECRET`.
DO $$
DECLARE
  v_secret text := '81ffb3b2936ef14200d20b8eef561a171f5d6ac260020b1dee0d2415d20ab249';
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'gmail_cron_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'gmail_cron_secret', 'Gmail incremental sync cron HMAC secret');
  ELSE
    PERFORM vault.update_secret(v_id, v_secret, 'gmail_cron_secret', 'Gmail incremental sync cron HMAC secret');
  END IF;
END $$;

-- 3) Cron job újra-ütemezése Vault-os olvasással --------------------------
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
        'Content-Type',  'application/json',
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'gmail_cron_secret'
          LIMIT 1
        )
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);

-- 4) Ellenőrzés (manuális) ------------------------------------------------
--   SELECT name, created_at, updated_at FROM vault.secrets WHERE name = 'gmail_cron_secret';
--   SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'gmail-incremental-sync';
--   SELECT * FROM cron.job_run_details
--     WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='gmail-incremental-sync')
--     ORDER BY start_time DESC LIMIT 5;