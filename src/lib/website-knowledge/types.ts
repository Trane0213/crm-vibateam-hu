/**
 * Website Knowledge — közös típusok.
 *
 * WK-1 hatókör: adatmodell + Netlify webhook csontváz. A tényleges crawl,
 * AI-summary, entity-extraction és KG-projekció további sprintekben jön.
 */

export type CrawlTrigger =
  | "netlify_webhook"
  | "manual_page"
  | "manual_batch"
  | "manual_full"
  | "scheduled";

export type CrawlRunStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "partial"
  | "skipped";

export type AssetKind =
  | "landing"
  | "blog_post"
  | "service"
  | "faq"
  | "reference"
  | "other";

/** Netlify outgoing webhook payload — csak azokra a mezőkre támaszkodunk, amiket használunk. */
export interface NetlifyDeployPayload {
  id?: string;
  site_id?: string;
  name?: string;
  state?: string;
  branch?: string;
  deploy_ssl_url?: string;
  ssl_url?: string;
  url?: string;
  [key: string]: unknown;
}

export interface StartCrawlRunInput {
  trigger: CrawlTrigger;
  netlify_deploy_id?: string | null;
  netlify_site_id?: string | null;
  triggered_by_user_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StartCrawlRunResult {
  run_id: string;
  status: CrawlRunStatus;
  started_at: string;
}

export interface CrawlRunRow {
  id: string;
  trigger: CrawlTrigger;
  status: CrawlRunStatus;
  netlify_deploy_id: string | null;
  netlify_site_id: string | null;
  started_at: string;
  finished_at: string | null;
  pages_crawled: number;
  pages_updated: number;
  pages_skipped: number;
  pages_failed: number;
  ai_jobs_total: number;
  ai_cost_usd: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
}