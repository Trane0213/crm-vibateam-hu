-- ============================================================
-- MICHAEL — Google Ads Specialista (M1)
-- Táblák: kapcsolat, alkotmány, snapshot, change log
-- Owner-only RLS (is_owner_role). Idempotens.
-- ============================================================

-- ---------- google_ads_connections ----------
-- Egy sor / user. Refresh token AES-GCM titkosítva (M2+ töltjük tényleges értékkel).
CREATE TABLE IF NOT EXISTS public.google_ads_connections (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email             text,
  login_customer_id        text,           -- opcionális MCC
  active_customer_id       text,           -- kiválasztott Ads fiók
  refresh_token_cipher     text,           -- base64(AES-GCM(refresh_token))
  refresh_token_iv         text,           -- base64(IV)
  scope                    text,
  status                   text NOT NULL DEFAULT 'connected'
                             CHECK (status IN ('connected','revoked','error')),
  last_error               text,
  connected_at             timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_connections TO authenticated;
GRANT ALL ON public.google_ads_connections TO service_role;
ALTER TABLE public.google_ads_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gac_owner_all ON public.google_ads_connections;
CREATE POLICY gac_owner_all ON public.google_ads_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_owner_role(auth.uid()));

-- ---------- google_ads_constitution ----------
-- VIBA Ads Constitution — kötelező szabályrendszer, minden Michael run olvassa.
CREATE TABLE IF NOT EXISTS public.google_ads_constitution (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key     text NOT NULL UNIQUE,
  rule_text    text NOT NULL,               -- magyar szöveg
  severity     text NOT NULL DEFAULT 'hard'
                 CHECK (severity IN ('hard','soft')),
  enabled      boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gacon_order_idx ON public.google_ads_constitution(sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_constitution TO authenticated;
GRANT ALL ON public.google_ads_constitution TO service_role;
ALTER TABLE public.google_ads_constitution ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gacon_owner_all ON public.google_ads_constitution;
CREATE POLICY gacon_owner_all ON public.google_ads_constitution
  FOR ALL TO authenticated
  USING (public.is_owner_role(auth.uid()))
  WITH CHECK (public.is_owner_role(auth.uid()));

-- ---------- google_ads_snapshots ----------
-- Nyers Ads API metrika snapshotok. Baseline SZÁMÍTOTT nézet ezek fölött.
-- READ-only: Michael és a user nem szerkeszti (csak backend job / read tool ír).
CREATE TABLE IF NOT EXISTS public.google_ads_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id      text NOT NULL,
  scope            text NOT NULL CHECK (scope IN ('account','campaign','ad_group','keyword')),
  entity_id        text,                -- account esetén null
  metrics_json     jsonb NOT NULL,      -- {spend, ctr, cpc, cpa, roas, conv, impression_share, ...}
  snapshotted_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gasnap_user_scope_idx
  ON public.google_ads_snapshots(user_id, customer_id, scope, entity_id, snapshotted_at DESC);
-- Csak SELECT — a snapshot táblát kizárólag backend job / read-only tool tölti (service_role).
GRANT SELECT ON public.google_ads_snapshots TO authenticated;
GRANT ALL ON public.google_ads_snapshots TO service_role;
ALTER TABLE public.google_ads_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gasnap_owner_read ON public.google_ads_snapshots;
DROP POLICY IF EXISTS gasnap_owner_all ON public.google_ads_snapshots;
CREATE POLICY gasnap_owner_read ON public.google_ads_snapshots
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()));
-- Explicit Owner-only tiltás INSERT/UPDATE/DELETE-re (defense-in-depth,
-- akkor is ha később valaki GRANT-et adna hozzá authenticated-nek).
CREATE POLICY gasnap_owner_write_block ON public.google_ads_snapshots
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_owner_role(auth.uid()));

-- ---------- google_ads_change_log ----------
-- Michael execute-ok + kézi Google módosítások (M7+ change_event sync).
CREATE TABLE IF NOT EXISTS public.google_ads_change_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id    text NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  entity         text NOT NULL,          -- pl. 'campaign', 'ad_group', 'keyword'
  entity_id      text,
  field          text NOT NULL,
  old_value      text,
  new_value      text,
  changed_by     text NOT NULL DEFAULT 'michael'
                   CHECK (changed_by IN ('michael','user','google_auto')),
  reason         text,
  dry_run_ref    uuid                    -- agent_run_steps.id majd (soft ref)
);
CREATE INDEX IF NOT EXISTS gachg_user_time_idx
  ON public.google_ads_change_log(user_id, customer_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS gachg_entity_idx
  ON public.google_ads_change_log(user_id, entity, entity_id, changed_at DESC);
-- Csak SELECT — a change log-ot Michael execute (service_role) írja.
GRANT SELECT ON public.google_ads_change_log TO authenticated;
GRANT ALL ON public.google_ads_change_log TO service_role;
ALTER TABLE public.google_ads_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gachg_owner_read ON public.google_ads_change_log;
DROP POLICY IF EXISTS gachg_owner_all ON public.google_ads_change_log;
CREATE POLICY gachg_owner_read ON public.google_ads_change_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()));
CREATE POLICY gachg_owner_write_block ON public.google_ads_change_log
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_owner_role(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_owner_role(auth.uid()));

-- ---------- agent_role_access: Michael (ads) — Owner ONLY ----------
-- Csak akkor szúrjuk be, ha van 'owner' role sor. Idempotens.
INSERT INTO public.agent_role_access (agent_id, role_id, can_view)
SELECT 'ads', r.id, true
FROM public.roles r
WHERE r.name = 'owner'
ON CONFLICT (agent_id, role_id) DO UPDATE SET can_view = EXCLUDED.can_view;