-- =====================================================================
-- VIBA CRM — M7 / WK-1: Website Knowledge adatmodell (csontváz)
-- 2026-07-15
--
-- Hatókör (M7 v5 spec, B.3 + B.8/WK-1):
--   * Csak website_* táblák. KG táblákat NEM érint.
--   * Táblák:
--       website_sources
--       website_pages
--       website_page_versions
--       website_page_changes
--       website_page_blocks_hero
--       website_page_blocks_text
--       website_page_blocks_features
--       website_page_blocks_faq
--       website_page_blocks_cta
--       website_page_summaries
--       website_entities
--       website_page_entities
--       website_media           (Vision-ready mezőkkel)
--       website_media_entities
--       website_crawl_runs
--       website_ai_jobs
--   * RLS: authenticated -> SELECT minden website_* táblán,
--          service_role -> ALL, anon -> semmi.
--   * A WK-1 sprint kizárólag a csontvázat rakja le. A táblák üresen
--     indulnak, nincs seed.
--
-- Semmilyen meglévő táblát vagy triggerét NEM módosít.
-- Idempotens: IF NOT EXISTS / DROP POLICY IF EXISTS.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1) website_sources — sitemap / manuális forrás katalógus
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_sources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL CHECK (kind IN ('sitemap','manual','api')),
  base_url         text NOT NULL UNIQUE,
  label            text NOT NULL,
  is_enabled       boolean NOT NULL DEFAULT true,
  last_crawled_at  timestamptz NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.website_sources TO authenticated;
GRANT ALL    ON public.website_sources TO service_role;
ALTER TABLE public.website_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_sources_select_auth ON public.website_sources;
CREATE POLICY website_sources_select_auth
  ON public.website_sources FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 2) website_pages — indexelt oldalak
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           uuid NULL REFERENCES public.website_sources(id) ON DELETE SET NULL,
  url                 text NOT NULL UNIQUE,
  path                text NOT NULL,
  asset_kind          text NOT NULL DEFAULT 'landing'
                        CHECK (asset_kind IN ('landing','blog_post','service','faq','reference','other')),
  title               text NULL,
  current_version_id  uuid NULL,   -- laza pointer, FK-t később kötjük a versions után
  is_active           boolean NOT NULL DEFAULT true,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_crawled_at     timestamptz NULL,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_pages_source_idx     ON public.website_pages(source_id);
CREATE INDEX IF NOT EXISTS website_pages_asset_kind_idx ON public.website_pages(asset_kind);
CREATE INDEX IF NOT EXISTS website_pages_active_idx     ON public.website_pages(is_active);

GRANT SELECT ON public.website_pages TO authenticated;
GRANT ALL    ON public.website_pages TO service_role;
ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_pages_select_auth ON public.website_pages;
CREATE POLICY website_pages_select_auth
  ON public.website_pages FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 3) website_page_versions — hash + verzió + raw content
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_page_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id        uuid NOT NULL REFERENCES public.website_pages(id) ON DELETE CASCADE,
  version_number int  NOT NULL,
  content_hash   text NOT NULL,
  raw_html       text NULL,
  rendered_text  text NULL,
  http_status    int  NULL,
  byte_size      int  NULL,
  run_id         uuid NULL,   -- laza pointer a website_crawl_runs-hoz (lent hozzuk létre)
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_id, version_number),
  UNIQUE(page_id, content_hash)
);

CREATE INDEX IF NOT EXISTS website_page_versions_page_idx    ON public.website_page_versions(page_id);
CREATE INDEX IF NOT EXISTS website_page_versions_fetched_idx ON public.website_page_versions(fetched_at DESC);

GRANT SELECT ON public.website_page_versions TO authenticated;
GRANT ALL    ON public.website_page_versions TO service_role;
ALTER TABLE public.website_page_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_page_versions_select_auth ON public.website_page_versions;
CREATE POLICY website_page_versions_select_auth
  ON public.website_page_versions FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 4) website_page_changes — verziók közötti diff napló
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_page_changes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id          uuid NOT NULL REFERENCES public.website_pages(id) ON DELETE CASCADE,
  from_version_id  uuid NULL REFERENCES public.website_page_versions(id) ON DELETE SET NULL,
  to_version_id    uuid NULL REFERENCES public.website_page_versions(id) ON DELETE SET NULL,
  change_type      text NOT NULL CHECK (change_type IN ('created','updated','removed','restored')),
  diff_summary     text NULL,
  diff             jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_id           uuid NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_page_changes_page_idx    ON public.website_page_changes(page_id);
CREATE INDEX IF NOT EXISTS website_page_changes_created_idx ON public.website_page_changes(created_at DESC);

GRANT SELECT ON public.website_page_changes TO authenticated;
GRANT ALL    ON public.website_page_changes TO service_role;
ALTER TABLE public.website_page_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_page_changes_select_auth ON public.website_page_changes;
CREATE POLICY website_page_changes_select_auth
  ON public.website_page_changes FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 5) Blokk-táblák (5 db)
--    Minden blokk egy versionhöz tartozik; új verzió = blokkok újraírva.
-- =====================================================================

-- 5.a hero
CREATE TABLE IF NOT EXISTS public.website_page_blocks_hero (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_version_id  uuid NOT NULL REFERENCES public.website_page_versions(id) ON DELETE CASCADE,
  position         int  NOT NULL DEFAULT 0,
  headline         text NULL,
  subheadline      text NULL,
  cta_label        text NULL,
  cta_url          text NULL,
  media_url        text NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_blocks_hero_version_idx ON public.website_page_blocks_hero(page_version_id);

GRANT SELECT ON public.website_page_blocks_hero TO authenticated;
GRANT ALL    ON public.website_page_blocks_hero TO service_role;
ALTER TABLE public.website_page_blocks_hero ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_blocks_hero_select_auth ON public.website_page_blocks_hero;
CREATE POLICY website_blocks_hero_select_auth
  ON public.website_page_blocks_hero FOR SELECT TO authenticated USING (true);

-- 5.b text
CREATE TABLE IF NOT EXISTS public.website_page_blocks_text (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_version_id  uuid NOT NULL REFERENCES public.website_page_versions(id) ON DELETE CASCADE,
  position         int  NOT NULL DEFAULT 0,
  heading          text NULL,
  body_markdown    text NULL,
  body_text        text NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_blocks_text_version_idx ON public.website_page_blocks_text(page_version_id);

GRANT SELECT ON public.website_page_blocks_text TO authenticated;
GRANT ALL    ON public.website_page_blocks_text TO service_role;
ALTER TABLE public.website_page_blocks_text ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_blocks_text_select_auth ON public.website_page_blocks_text;
CREATE POLICY website_blocks_text_select_auth
  ON public.website_page_blocks_text FOR SELECT TO authenticated USING (true);

-- 5.c features
CREATE TABLE IF NOT EXISTS public.website_page_blocks_features (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_version_id  uuid NOT NULL REFERENCES public.website_page_versions(id) ON DELETE CASCADE,
  position         int  NOT NULL DEFAULT 0,
  heading          text NULL,
  items            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{title, description, icon?}]
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_blocks_features_version_idx ON public.website_page_blocks_features(page_version_id);

GRANT SELECT ON public.website_page_blocks_features TO authenticated;
GRANT ALL    ON public.website_page_blocks_features TO service_role;
ALTER TABLE public.website_page_blocks_features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_blocks_features_select_auth ON public.website_page_blocks_features;
CREATE POLICY website_blocks_features_select_auth
  ON public.website_page_blocks_features FOR SELECT TO authenticated USING (true);

-- 5.d faq
CREATE TABLE IF NOT EXISTS public.website_page_blocks_faq (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_version_id  uuid NOT NULL REFERENCES public.website_page_versions(id) ON DELETE CASCADE,
  position         int  NOT NULL DEFAULT 0,
  heading          text NULL,
  items            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{question, answer}]
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_blocks_faq_version_idx ON public.website_page_blocks_faq(page_version_id);

GRANT SELECT ON public.website_page_blocks_faq TO authenticated;
GRANT ALL    ON public.website_page_blocks_faq TO service_role;
ALTER TABLE public.website_page_blocks_faq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_blocks_faq_select_auth ON public.website_page_blocks_faq;
CREATE POLICY website_blocks_faq_select_auth
  ON public.website_page_blocks_faq FOR SELECT TO authenticated USING (true);

-- 5.e cta
CREATE TABLE IF NOT EXISTS public.website_page_blocks_cta (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_version_id  uuid NOT NULL REFERENCES public.website_page_versions(id) ON DELETE CASCADE,
  position         int  NOT NULL DEFAULT 0,
  headline         text NULL,
  description      text NULL,
  cta_label        text NULL,
  cta_url          text NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS website_blocks_cta_version_idx ON public.website_page_blocks_cta(page_version_id);

GRANT SELECT ON public.website_page_blocks_cta TO authenticated;
GRANT ALL    ON public.website_page_blocks_cta TO service_role;
ALTER TABLE public.website_page_blocks_cta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_blocks_cta_select_auth ON public.website_page_blocks_cta;
CREATE POLICY website_blocks_cta_select_auth
  ON public.website_page_blocks_cta FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 6) website_page_summaries — AI összefoglaló versionönként
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_page_summaries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id            uuid NOT NULL REFERENCES public.website_pages(id) ON DELETE CASCADE,
  page_version_id    uuid NOT NULL REFERENCES public.website_page_versions(id) ON DELETE CASCADE,
  summary            text NULL,
  summary_json       jsonb NOT NULL DEFAULT '{}'::jsonb,
  model              text NULL,
  ai_job_id          uuid NULL,  -- laza pointer a website_ai_jobs-hoz
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_version_id)
);

CREATE INDEX IF NOT EXISTS website_page_summaries_page_idx ON public.website_page_summaries(page_id);

GRANT SELECT ON public.website_page_summaries TO authenticated;
GRANT ALL    ON public.website_page_summaries TO service_role;
ALTER TABLE public.website_page_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_page_summaries_select_auth ON public.website_page_summaries;
CREATE POLICY website_page_summaries_select_auth
  ON public.website_page_summaries FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 7) website_entities — kinyert entitás katalógus
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind      text NOT NULL CHECK (entity_kind IN
                     ('service','product','person','company','location','topic','technology','other')),
  name             text NOT NULL,
  normalized_name  text NOT NULL,
  description      text NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_kind, normalized_name)
);

CREATE INDEX IF NOT EXISTS website_entities_kind_idx ON public.website_entities(entity_kind);

GRANT SELECT ON public.website_entities TO authenticated;
GRANT ALL    ON public.website_entities TO service_role;
ALTER TABLE public.website_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_entities_select_auth ON public.website_entities;
CREATE POLICY website_entities_select_auth
  ON public.website_entities FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 8) website_page_entities — page-version <-> entity kapcsolat
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_page_entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id          uuid NOT NULL REFERENCES public.website_pages(id) ON DELETE CASCADE,
  page_version_id  uuid NOT NULL REFERENCES public.website_page_versions(id) ON DELETE CASCADE,
  entity_id        uuid NOT NULL REFERENCES public.website_entities(id) ON DELETE CASCADE,
  role             text NULL CHECK (role IS NULL OR role IN ('primary','secondary','mentioned')),
  confidence       numeric(3,2) NULL,
  evidence         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_job_id        uuid NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_version_id, entity_id, role)
);

CREATE INDEX IF NOT EXISTS website_page_entities_page_idx    ON public.website_page_entities(page_id);
CREATE INDEX IF NOT EXISTS website_page_entities_version_idx ON public.website_page_entities(page_version_id);
CREATE INDEX IF NOT EXISTS website_page_entities_entity_idx  ON public.website_page_entities(entity_id);

GRANT SELECT ON public.website_page_entities TO authenticated;
GRANT ALL    ON public.website_page_entities TO service_role;
ALTER TABLE public.website_page_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_page_entities_select_auth ON public.website_page_entities;
CREATE POLICY website_page_entities_select_auth
  ON public.website_page_entities FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 9) website_media — képek / videók / dokumentumok (Vision-ready)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_media (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id          uuid NULL REFERENCES public.website_pages(id) ON DELETE SET NULL,
  page_version_id  uuid NULL REFERENCES public.website_page_versions(id) ON DELETE SET NULL,
  url              text NOT NULL,
  media_kind       text NOT NULL DEFAULT 'image'
                     CHECK (media_kind IN ('image','video','document','other')),
  mime_type        text NULL,
  alt_text         text NULL,
  width            int NULL,
  height           int NULL,
  byte_size        bigint NULL,
  -- Vision-ready mezők (WK-1-ben üresen maradnak)
  ai_caption       text NULL,
  ai_description   text NULL,
  ai_ocr_text      text NULL,
  ai_labels        jsonb NULL,
  vision_status    text NOT NULL DEFAULT 'pending'
                     CHECK (vision_status IN ('pending','running','success','failed','skipped')),
  vision_job_id    uuid NULL,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_version_id, url)
);

CREATE INDEX IF NOT EXISTS website_media_page_idx    ON public.website_media(page_id);
CREATE INDEX IF NOT EXISTS website_media_version_idx ON public.website_media(page_version_id);
CREATE INDEX IF NOT EXISTS website_media_kind_idx    ON public.website_media(media_kind);

GRANT SELECT ON public.website_media TO authenticated;
GRANT ALL    ON public.website_media TO service_role;
ALTER TABLE public.website_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_media_select_auth ON public.website_media;
CREATE POLICY website_media_select_auth
  ON public.website_media FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 10) website_media_entities — media <-> entity (Vision-ready)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_media_entities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id     uuid NOT NULL REFERENCES public.website_media(id) ON DELETE CASCADE,
  entity_id    uuid NOT NULL REFERENCES public.website_entities(id) ON DELETE CASCADE,
  confidence   numeric(3,2) NULL,
  source       text NOT NULL DEFAULT 'ai_vision'
                  CHECK (source IN ('ai_vision','manual','heuristic')),
  evidence     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_job_id    uuid NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(media_id, entity_id, source)
);

CREATE INDEX IF NOT EXISTS website_media_entities_media_idx  ON public.website_media_entities(media_id);
CREATE INDEX IF NOT EXISTS website_media_entities_entity_idx ON public.website_media_entities(entity_id);

GRANT SELECT ON public.website_media_entities TO authenticated;
GRANT ALL    ON public.website_media_entities TO service_role;
ALTER TABLE public.website_media_entities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_media_entities_select_auth ON public.website_media_entities;
CREATE POLICY website_media_entities_select_auth
  ON public.website_media_entities FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 11) website_crawl_runs — crawl futások (WK-1: webhook ezt írja)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_crawl_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger               text NOT NULL DEFAULT 'netlify_webhook'
                          CHECK (trigger IN
                            ('netlify_webhook','manual_page','manual_batch','manual_full','scheduled')),
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','running','success','failed','partial','skipped')),
  netlify_deploy_id     text NULL,
  netlify_site_id       text NULL,
  triggered_by_user_id  uuid NULL,   -- laza pointer az auth.users-re, cross-schema FK nélkül
  started_at            timestamptz NOT NULL DEFAULT now(),
  finished_at           timestamptz NULL,
  pages_crawled         int NOT NULL DEFAULT 0,
  pages_updated         int NOT NULL DEFAULT 0,
  pages_skipped         int NOT NULL DEFAULT 0,
  pages_failed          int NOT NULL DEFAULT 0,
  ai_jobs_total         int NOT NULL DEFAULT 0,
  ai_cost_usd           numeric(10,4) NOT NULL DEFAULT 0,
  error_message         text NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_crawl_runs_started_idx ON public.website_crawl_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS website_crawl_runs_status_idx  ON public.website_crawl_runs(status);
CREATE INDEX IF NOT EXISTS website_crawl_runs_trigger_idx ON public.website_crawl_runs(trigger);

GRANT SELECT ON public.website_crawl_runs TO authenticated;
GRANT ALL    ON public.website_crawl_runs TO service_role;
ALTER TABLE public.website_crawl_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_crawl_runs_select_auth ON public.website_crawl_runs;
CREATE POLICY website_crawl_runs_select_auth
  ON public.website_crawl_runs FOR SELECT TO authenticated USING (true);

-- =====================================================================
-- 12) website_ai_jobs — minden AI hívás telemetriája (WK-3-ban töltődik)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_ai_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NULL REFERENCES public.website_crawl_runs(id) ON DELETE SET NULL,
  page_id           uuid NULL REFERENCES public.website_pages(id) ON DELETE SET NULL,
  page_version_id   uuid NULL REFERENCES public.website_page_versions(id) ON DELETE SET NULL,
  media_id          uuid NULL REFERENCES public.website_media(id) ON DELETE SET NULL,
  job_kind          text NOT NULL CHECK (job_kind IN
                      ('summary','entity_extraction','vision_caption','vision_ocr','other')),
  provider          text NOT NULL DEFAULT 'openai',
  model             text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','running','success','failed')),
  input_tokens      int NULL,
  output_tokens     int NULL,
  input_cost_usd    numeric(12,6) NULL,
  output_cost_usd   numeric(12,6) NULL,
  total_cost_usd    numeric(12,6) NULL,
  latency_ms        int NULL,
  request_payload   jsonb NULL,
  response_payload  jsonb NULL,
  error_message     text NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz NULL
);

CREATE INDEX IF NOT EXISTS website_ai_jobs_run_idx     ON public.website_ai_jobs(run_id);
CREATE INDEX IF NOT EXISTS website_ai_jobs_page_idx    ON public.website_ai_jobs(page_id);
CREATE INDEX IF NOT EXISTS website_ai_jobs_kind_idx    ON public.website_ai_jobs(job_kind);
CREATE INDEX IF NOT EXISTS website_ai_jobs_status_idx  ON public.website_ai_jobs(status);
CREATE INDEX IF NOT EXISTS website_ai_jobs_created_idx ON public.website_ai_jobs(created_at DESC);

GRANT SELECT ON public.website_ai_jobs TO authenticated;
GRANT ALL    ON public.website_ai_jobs TO service_role;
ALTER TABLE public.website_ai_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_ai_jobs_select_auth ON public.website_ai_jobs;
CREATE POLICY website_ai_jobs_select_auth
  ON public.website_ai_jobs FOR SELECT TO authenticated USING (true);

COMMIT;

-- =====================================================================
-- Vége — WK-1 séma kész. A táblák üresen indulnak, seed nincs.
-- =====================================================================