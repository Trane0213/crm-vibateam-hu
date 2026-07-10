-- =====================================================================
-- VIBA CRM — M7 / KG-1: Knowledge Graph csontváz
-- 2026-07-11
--
-- Hatókör (M7 v5 spec, A.3 + A.4):
--   * 6 új tábla: kg_node_kinds, kg_relations, kg_nodes, kg_edges,
--     kg_edge_history (üres, csak séma), kg_publishers
--   * RLS: authenticated -> SELECT minden kg_* táblán, service_role -> ALL,
--          anon -> semmi
--   * Seed INSERT-ek: A.3-ban felsorolt node kind + relation katalógus
--
-- Semmilyen meglévő táblát vagy triggerét NEM módosít.
-- Idempotens: IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1) kg_node_kinds — bővíthető típus-szótár
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.kg_node_kinds (
  kind          text PRIMARY KEY,
  label         text NOT NULL,
  description   text NULL,
  owner_module  text NOT NULL,
  is_enabled    boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kg_node_kinds TO authenticated;
GRANT ALL    ON public.kg_node_kinds TO service_role;
ALTER TABLE public.kg_node_kinds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kg_node_kinds_select_auth ON public.kg_node_kinds;
CREATE POLICY kg_node_kinds_select_auth
  ON public.kg_node_kinds FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 2) kg_relations — bővíthető reláció-szótár
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.kg_relations (
  relation           text PRIMARY KEY,
  label              text NOT NULL,
  description        text NULL,
  inverse_relation   text NULL REFERENCES public.kg_relations(relation)
                          DEFERRABLE INITIALLY DEFERRED,
  default_direction  text NOT NULL DEFAULT 'directed'
                          CHECK (default_direction IN ('directed','undirected')),
  is_semantic        boolean NOT NULL DEFAULT false,
  owner_module       text NULL,
  is_enabled         boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kg_relations TO authenticated;
GRANT ALL    ON public.kg_relations TO service_role;
ALTER TABLE public.kg_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kg_relations_select_auth ON public.kg_relations;
CREATE POLICY kg_relations_select_auth
  ON public.kg_relations FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 3) kg_nodes
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.kg_nodes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL REFERENCES public.kg_node_kinds(kind),
  ref_table   text NULL,
  ref_id      uuid NULL,
  ref_uri     text NULL,
  label       text NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE(kind, ref_table, ref_id) — csak akkor egyedi, ha van ref.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kg_nodes_kind_ref
  ON public.kg_nodes(kind, ref_table, ref_id)
  WHERE ref_table IS NOT NULL AND ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_kg_nodes_ref_uri ON public.kg_nodes(ref_uri)
  WHERE ref_uri IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_kg_nodes_kind ON public.kg_nodes(kind);

GRANT SELECT ON public.kg_nodes TO authenticated;
GRANT ALL    ON public.kg_nodes TO service_role;
ALTER TABLE public.kg_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kg_nodes_select_auth ON public.kg_nodes;
CREATE POLICY kg_nodes_select_auth
  ON public.kg_nodes FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 4) kg_edges
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.kg_edges (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id         uuid NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
  to_node_id           uuid NOT NULL REFERENCES public.kg_nodes(id) ON DELETE CASCADE,
  relation             text NOT NULL REFERENCES public.kg_relations(relation),
  direction            text NOT NULL DEFAULT 'directed'
                            CHECK (direction IN ('directed','undirected')),
  weight               numeric(4,3) NULL,
  confidence           numeric(3,2) NULL,
  source               text NOT NULL
                            CHECK (source IN (
                              'manual','heuristic','ai_extraction','ai_vision',
                              'ai_semantic','crawl_link','import','domain_hook'
                            )),
  origin_ref_table     text NULL,
  origin_ref_id        uuid NULL,
  evidence             jsonb NULL,
  valid_from           timestamptz NULL,
  valid_to             timestamptz NULL,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by_user_id   uuid NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kg_edges_from_to_relation
  ON public.kg_edges(from_node_id, to_node_id, relation);

CREATE INDEX IF NOT EXISTS ix_kg_edges_from_relation
  ON public.kg_edges(from_node_id, relation);
CREATE INDEX IF NOT EXISTS ix_kg_edges_to_relation
  ON public.kg_edges(to_node_id, relation);
CREATE INDEX IF NOT EXISTS ix_kg_edges_relation
  ON public.kg_edges(relation);

GRANT SELECT ON public.kg_edges TO authenticated;
GRANT ALL    ON public.kg_edges TO service_role;
ALTER TABLE public.kg_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kg_edges_select_auth ON public.kg_edges;
CREATE POLICY kg_edges_select_auth
  ON public.kg_edges FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 5) kg_edge_history (előkészítve, üresen indul)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.kg_edge_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_id               uuid NOT NULL,
  changed_at            timestamptz NOT NULL DEFAULT now(),
  change_type           text NOT NULL
                              CHECK (change_type IN ('created','updated','deleted')),
  previous_relation     text NULL,
  previous_weight       numeric(4,3) NULL,
  previous_confidence   numeric(3,2) NULL
);

CREATE INDEX IF NOT EXISTS ix_kg_edge_history_edge_id
  ON public.kg_edge_history(edge_id);

GRANT SELECT ON public.kg_edge_history TO authenticated;
GRANT ALL    ON public.kg_edge_history TO service_role;
ALTER TABLE public.kg_edge_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kg_edge_history_select_auth ON public.kg_edge_history;
CREATE POLICY kg_edge_history_select_auth
  ON public.kg_edge_history FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 6) kg_publishers — futásidejű regiszter
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.kg_publishers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module           text NOT NULL,
  source_kind      text NOT NULL,
  last_run_at      timestamptz NOT NULL DEFAULT now(),
  nodes_upserted   integer NOT NULL DEFAULT 0,
  edges_upserted   integer NOT NULL DEFAULT 0,
  edges_removed    integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'ok'
                        CHECK (status IN ('ok','partial','error')),
  error_message    text NULL
);

CREATE INDEX IF NOT EXISTS ix_kg_publishers_module_source_kind_last_run
  ON public.kg_publishers(module, source_kind, last_run_at DESC);

GRANT SELECT ON public.kg_publishers TO authenticated;
GRANT ALL    ON public.kg_publishers TO service_role;
ALTER TABLE public.kg_publishers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kg_publishers_select_auth ON public.kg_publishers;
CREATE POLICY kg_publishers_select_auth
  ON public.kg_publishers FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 7) SEED — kg_node_kinds (spec A.3)
-- =====================================================================
INSERT INTO public.kg_node_kinds (kind, label, owner_module) VALUES
  -- website (WK modul jövőbeli publisher)
  ('website_page',           'Website page',          'website'),
  ('website_entity',         'Website entity',        'website'),
  ('media_asset',            'Media asset',           'website'),
  ('pdf_document',           'PDF document',          'website'),
  ('blog_post',              'Blog post',             'website'),
  ('faq_item',               'FAQ item',              'website'),
  ('reference_project',      'Reference project',     'website'),
  ('external_url',           'External URL',          'website'),
  ('topic',                  'Topic',                 'website'),
  -- CRM
  ('crm_lead',               'CRM lead',              'crm'),
  ('crm_project',            'CRM project',           'crm'),
  ('crm_company',            'CRM company',           'crm'),
  ('crm_contact',            'CRM contact',           'crm'),
  ('crm_quote',              'CRM quote',             'crm'),
  ('crm_followup',           'CRM follow-up',         'crm'),
  ('crm_email_thread',       'CRM email thread',      'crm'),
  -- Google Ads
  ('google_ads_campaign',    'Google Ads campaign',   'ads'),
  ('google_ads_ad_group',    'Google Ads ad group',   'ads'),
  ('google_ads_ad',          'Google Ads ad',         'ads'),
  ('google_ads_keyword',     'Google Ads keyword',    'ads'),
  -- GA4 / Clarity
  ('ga4_event',              'GA4 event',             'ga4'),
  ('clarity_recording',      'Clarity recording',     'clarity'),
  -- Számlázás / dokumentumok / kommunikáció
  ('invoice',                'Invoice',               'billing'),
  ('document',               'Document',              'docs'),
  ('email_message',          'Email message',         'email'),
  ('calendar_event',         'Calendar event',        'calendar'),
  -- Egyéb üzleti modulok
  ('nexohabit_habit',        'NexoHabit habit',       'nexohabit'),
  ('mennyibe_item',          'Mennyibe.hu item',      'mennyibe'),
  -- AI OS belső
  ('ai_agent',               'AI agent',              'ai_os'),
  ('ai_run',                 'AI run',                'ai_os'),
  ('ai_tool_call',           'AI tool call',          'ai_os')
ON CONFLICT (kind) DO NOTHING;

-- =====================================================================
-- 8) SEED — kg_relations (spec A.3)
-- Két lépcső: előbb NULL inverse_relation-nel, utána UPDATE az inverzekre.
-- =====================================================================
INSERT INTO public.kg_relations (relation, label, default_direction, is_semantic, owner_module) VALUES
  -- Strukturális
  ('describes',              'describes',                  'directed',   false, 'ai_os'),
  ('mentions',               'mentions',                   'directed',   false, 'ai_os'),
  ('links_to',               'links to',                   'directed',   false, 'website'),
  ('contains_media',         'contains media',             'directed',   false, 'website'),
  ('belongs_to_source',      'belongs to source',          'directed',   false, 'ai_os'),
  ('has_entity',             'has entity',                 'directed',   false, 'ai_os'),
  ('has_version',            'has version',                'directed',   false, 'ai_os'),
  ('derived_from',           'derived from',               'directed',   false, 'ai_os'),
  ('authored_by',            'authored by',                'directed',   false, 'ai_os'),
  ('assigned_to',            'assigned to',                'directed',   false, 'ai_os'),
  -- Üzleti (deklarálva, üres)
  ('landing_of_campaign',    'landing of campaign',        'directed',   false, 'ads'),
  ('target_of_ad',           'target of ad',               'directed',   false, 'ads'),
  ('tracked_by_ga4_event',   'tracked by GA4 event',       'directed',   false, 'ga4'),
  ('recorded_by_clarity',    'recorded by Clarity',        'directed',   false, 'clarity'),
  ('originates_lead',        'originates lead',            'directed',   false, 'crm'),
  ('supports_project',       'supports project',           'directed',   false, 'crm'),
  ('billed_in_invoice',      'billed in invoice',          'directed',   false, 'billing'),
  ('quoted_in',              'quoted in',                  'directed',   false, 'crm'),
  ('booked_in_calendar',     'booked in calendar',         'directed',   false, 'calendar'),
  ('related_to_habit',       'related to habit',           'directed',   false, 'nexohabit'),
  -- Szemantikus AI (deklarálva, üres)
  ('related_to',             'related to',                 'undirected', true,  'ai_os'),
  ('describes_same_service', 'describes same service',     'undirected', true,  'ai_os'),
  ('predecessor_of',         'predecessor of',             'directed',   true,  'ai_os'),
  ('successor_of',           'successor of',               'directed',   true,  'ai_os'),
  ('supports',               'supports',                   'directed',   true,  'ai_os'),
  ('details',                'details',                    'directed',   true,  'ai_os'),
  ('contradicts',            'contradicts',                'undirected', true,  'ai_os'),
  ('supersedes',             'supersedes',                 'directed',   true,  'ai_os')
ON CONFLICT (relation) DO NOTHING;

-- Inverz párok bekötése
UPDATE public.kg_relations SET inverse_relation = 'successor_of'
  WHERE relation = 'predecessor_of' AND inverse_relation IS NULL;
UPDATE public.kg_relations SET inverse_relation = 'predecessor_of'
  WHERE relation = 'successor_of'   AND inverse_relation IS NULL;

COMMIT;

-- =====================================================================
-- ELLENŐRZÉS (migráció után):
--   SELECT count(*) FROM public.kg_node_kinds;   -- várt: 31
--   SELECT count(*) FROM public.kg_relations;    -- várt: 28
--   SELECT relname FROM pg_class
--    WHERE relname LIKE 'kg\_%' AND relkind = 'r' ORDER BY relname;
--     -- várt: kg_edge_history, kg_edges, kg_node_kinds, kg_nodes,
--     --       kg_publishers, kg_relations
--   SELECT tablename, rowsecurity FROM pg_tables
--    WHERE schemaname='public' AND tablename LIKE 'kg\_%';
--     -- várt: minden sorban rowsecurity = t
-- =====================================================================
