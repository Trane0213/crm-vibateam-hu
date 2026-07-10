-- ============================================================
-- MICHAEL — Google Ads Specialista (M1)
-- Táblák: kapcsolat, alkotmány (user-scoped), snapshot, change log
-- Owner-only RLS (is_owner_role). Idempotens.
-- ============================================================

-- ---------- Közös: updated_at automatikus frissítés ----------
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------- google_ads_connections ----------
-- Egy sor / user. Refresh token AES-GCM titkosítva.
-- MCC:
--   manager_customer_id — a userhez tartozó MCC (Manager) fiók ID, ha van.
--   login_customer_id   — az Ads API `login-customer-id` header értéke
--                         (MCC alatti fiókoknál az MCC ID; direkt fióknál üres).
CREATE TABLE IF NOT EXISTS public.google_ads_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email             text,
  manager_customer_id      text,
  login_customer_id        text,
  active_customer_id       text,
  refresh_token_cipher     text,
  refresh_token_iv         text,
  scope                    text,
  status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','connected','revoked','expired','error')),
  last_error               text,
  connected_at             timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);
-- Migration-safe: korábbi verzió bővítése (oszlop + státusz-lista).
ALTER TABLE public.google_ads_connections
  ADD COLUMN IF NOT EXISTS manager_customer_id text;
ALTER TABLE public.google_ads_connections
  DROP CONSTRAINT IF EXISTS google_ads_connections_status_check;
ALTER TABLE public.google_ads_connections
  ADD CONSTRAINT google_ads_connections_status_check
  CHECK (status IN ('pending','connected','revoked','expired','error'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_connections TO authenticated;
GRANT ALL ON public.google_ads_connections TO service_role;
ALTER TABLE public.google_ads_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gac_owner_all ON public.google_ads_connections;
CREATE POLICY gac_owner_all ON public.google_ads_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_owner_role(auth.uid()));
DROP TRIGGER IF EXISTS trg_gac_touch_updated ON public.google_ads_connections;
CREATE TRIGGER trg_gac_touch_updated
  BEFORE UPDATE ON public.google_ads_connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ---------- google_ads_constitution ----------
-- VIBA Ads Constitution — user-hez kötve. UNIQUE(user_id, rule_key).
CREATE TABLE IF NOT EXISTS public.google_ads_constitution (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_key     text NOT NULL,
  rule_text    text NOT NULL,
  severity     text NOT NULL DEFAULT 'hard'
                 CHECK (severity IN ('hard','soft')),
  enabled      boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, rule_key)
);
-- Migration-safe bővítés (ha régebbi séma van).
ALTER TABLE public.google_ads_constitution
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.google_ads_constitution
  DROP CONSTRAINT IF EXISTS google_ads_constitution_rule_key_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'google_ads_constitution_user_id_rule_key_key'
  ) THEN
    ALTER TABLE public.google_ads_constitution
      ADD CONSTRAINT google_ads_constitution_user_id_rule_key_key UNIQUE (user_id, rule_key);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS gacon_order_idx ON public.google_ads_constitution(sort_order);
CREATE INDEX IF NOT EXISTS gacon_user_idx  ON public.google_ads_constitution(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_constitution TO authenticated;
GRANT ALL ON public.google_ads_constitution TO service_role;
ALTER TABLE public.google_ads_constitution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gacon_owner_all ON public.google_ads_constitution;
CREATE POLICY gacon_owner_all ON public.google_ads_constitution
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_owner_role(auth.uid()));
DROP TRIGGER IF EXISTS trg_gacon_touch_updated ON public.google_ads_constitution;
CREATE TRIGGER trg_gacon_touch_updated
  BEFORE UPDATE ON public.google_ads_constitution
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ---------- google_ads_snapshots ----------
-- Nyers Ads API metrika snapshotok. Baseline SZÁMÍTOTT nézet ezek fölött.
-- READ-only user oldalról; írni csak service_role (backend job / read tool).
--
-- metrics_json séma (schema_version = 1):
--   {
--     "spend":            number,   -- kiadás a periódusban (fiók pénzneme)
--     "impressions":      number,
--     "clicks":           number,
--     "ctr":              number,   -- clicks / impressions
--     "avg_cpc":          number,   -- spend / clicks
--     "conversions":      number,
--     "conv_value":       number,
--     "cpa":              number,   -- spend / conversions
--     "roas":             number,   -- conv_value / spend
--     "impression_share": number,   -- 0..1, ha Google visszaadja
--     "period":           { "from": ISO_DATE, "to": ISO_DATE, "grain": "day"|"week"|"month" },
--     "currency":         "HUF"|...,
--     "raw":              object    -- opcionális Google válasz-részlet
--   }
-- Új mezők bevezetésekor NÖVELD a schema_version-t, régiek maradjanak olvashatók.
CREATE TABLE IF NOT EXISTS public.google_ads_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id      text NOT NULL,
  scope            text NOT NULL CHECK (scope IN ('account','campaign','ad_group','keyword')),
  entity_id        text,
  schema_version   integer NOT NULL DEFAULT 1,
  metrics_json     jsonb NOT NULL,
  snapshotted_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_ads_snapshots
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS gasnap_user_scope_idx
  ON public.google_ads_snapshots(user_id, customer_id, scope, entity_id, snapshotted_at DESC);
GRANT SELECT ON public.google_ads_snapshots TO authenticated;
GRANT ALL ON public.google_ads_snapshots TO service_role;
ALTER TABLE public.google_ads_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gasnap_owner_read        ON public.google_ads_snapshots;
DROP POLICY IF EXISTS gasnap_owner_all         ON public.google_ads_snapshots;
DROP POLICY IF EXISTS gasnap_owner_write_block ON public.google_ads_snapshots;
CREATE POLICY gasnap_owner_read ON public.google_ads_snapshots
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()));
CREATE POLICY gasnap_owner_write_block ON public.google_ads_snapshots
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_owner_role(auth.uid()));

-- ---------- google_ads_change_log ----------
-- Michael execute-ok + kézi Google módosítások (M7+ change_event sync).
-- `changed_by` szabad szöveg — más AI agentek (scarlet, boss, stb.) is írhatnak
-- ide, ezért nincs zárt CHECK lista. Ajánlott értékek: 'michael', 'user',
-- 'google_auto', <agent_id>.
CREATE TABLE IF NOT EXISTS public.google_ads_change_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id    text NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  entity         text NOT NULL,
  entity_id      text,
  field          text NOT NULL,
  old_value      text,
  new_value      text,
  changed_by     text NOT NULL DEFAULT 'michael',
  reason         text,
  dry_run_ref    uuid
);
-- Migration-safe: korábbi zárt CHECK ejtése.
ALTER TABLE public.google_ads_change_log
  DROP CONSTRAINT IF EXISTS google_ads_change_log_changed_by_check;
CREATE INDEX IF NOT EXISTS gachg_user_time_idx
  ON public.google_ads_change_log(user_id, customer_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS gachg_entity_idx
  ON public.google_ads_change_log(user_id, entity, entity_id, changed_at DESC);
GRANT SELECT ON public.google_ads_change_log TO authenticated;
GRANT ALL ON public.google_ads_change_log TO service_role;
ALTER TABLE public.google_ads_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gachg_owner_read        ON public.google_ads_change_log;
DROP POLICY IF EXISTS gachg_owner_all         ON public.google_ads_change_log;
DROP POLICY IF EXISTS gachg_owner_write_block ON public.google_ads_change_log;
CREATE POLICY gachg_owner_read ON public.google_ads_change_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()));
CREATE POLICY gachg_owner_write_block ON public.google_ads_change_log
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_owner_role(auth.uid()));

-- ---------- agent_role_access: Michael (ads) — Owner ONLY ----------
INSERT INTO public.agent_role_access (agent_id, role_id, can_view)
SELECT 'ads', r.id, true
FROM public.roles r
WHERE r.name = 'owner'
ON CONFLICT (agent_id, role_id) DO UPDATE SET can_view = EXCLUDED.can_view;