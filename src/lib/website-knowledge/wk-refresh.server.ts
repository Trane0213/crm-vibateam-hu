/**
 * Website Knowledge — manuális refresh (WK-5). SERVER-ONLY.
 *
 * Egyetlen oldal vagy oldal-lista újracrawlolása anélkül, hogy a teljes
 * sitemap végigfutna. A folyamat ugyanazt a `upsertPageAndVersion`
 * (fetch → parse → verzió → blokkok → AI summary/entity → KG publish)
 * pipeline-t használja, mint a normál crawl.
 *
 * Külön `website_crawl_runs` sort ír (`trigger = manual_page | manual_batch`),
 * hogy az UI és a KG statisztika elkülönítve mérje.
 */

import { getAdminClient } from "@/integrations/supabase/server";
import { startCrawlRun } from "./crawler.server";
import { upsertPageAndVersion } from "./pages.server";
import { publishPageChange } from "./kg-publisher.server";
import type { CrawlTrigger } from "./types";

const PAGE_TIMEOUT_MS = 12_000;
const BATCH_HARD_DEADLINE_MS = 25_000;

async function fetchPage(url: string): Promise<{ html: string; status: number } | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "VibaCRM-WK/1.0 (+https://vibateam.hu)" },
    });
    const html = await res.text();
    return { html, status: res.status };
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

interface Stats {
  crawled: number;
  updated: number;
  skipped: number;
  failed: number;
}

async function loadPages(page_ids: string[]): Promise<
  Array<{ id: string; url: string; source_id: string | null; current_version_id: string | null }>
> {
  if (page_ids.length === 0) return [];
  const { data, error } = await getAdminClient()
    .from("website_pages")
    .select("id, url, source_id, current_version_id")
    .in("id", page_ids);
  if (error) throw new Error(`pages select: ${error.message}`);
  return (data ?? []) as Array<{
    id: string;
    url: string;
    source_id: string | null;
    current_version_id: string | null;
  }>;
}

async function finalizeRun(
  run_id: string,
  started: number,
  stats: Stats,
  hitDeadline: boolean,
): Promise<{ status: "success" | "partial" | "failed" }> {
  const admin = getAdminClient();

  let ai_jobs_total = 0;
  let ai_cost_usd = 0;
  try {
    const { data: jobs } = await admin
      .from("website_ai_jobs")
      .select("total_cost_usd")
      .eq("run_id", run_id);
    if (jobs) {
      ai_jobs_total = jobs.length;
      ai_cost_usd = Number(
        jobs
          .reduce(
            (s, j) => s + Number((j as { total_cost_usd: number | null }).total_cost_usd ?? 0),
            0,
          )
          .toFixed(4),
      );
    }
  } catch {
    /* ignore */
  }

  try {
    const { data: pubs } = await admin
      .from("kg_publishers")
      .select("nodes_upserted, edges_upserted, last_run_at, status")
      .eq("module", "website")
      .gte("last_run_at", new Date(started).toISOString());
    const rows = (pubs ?? []) as Array<{
      nodes_upserted: number;
      edges_upserted: number;
      status: string;
    }>;
    const kg_nodes = rows.reduce((s, r) => s + Number(r.nodes_upserted ?? 0), 0);
    const kg_edges = rows.reduce((s, r) => s + Number(r.edges_upserted ?? 0), 0);
    const kg_errors = rows.filter((r) => r.status !== "ok").length;
    const { data: current } = await admin
      .from("website_crawl_runs")
      .select("metadata")
      .eq("id", run_id)
      .maybeSingle();
    const prevMeta =
      ((current as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}) as Record<
        string,
        unknown
      >;
    await admin
      .from("website_crawl_runs")
      .update({
        metadata: {
          ...prevMeta,
          kg_publisher_runs: rows.length,
          kg_nodes_upserted: kg_nodes,
          kg_edges_upserted: kg_edges,
          kg_publisher_errors: kg_errors,
        },
      })
      .eq("id", run_id);
  } catch {
    /* ignore */
  }

  const finalStatus: "success" | "partial" | "failed" =
    stats.crawled === 0
      ? "failed"
      : hitDeadline || stats.failed > 0
        ? "partial"
        : "success";

  await admin
    .from("website_crawl_runs")
    .update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      pages_crawled: stats.crawled,
      pages_updated: stats.updated,
      pages_skipped: stats.skipped,
      pages_failed: stats.failed,
      ai_jobs_total,
      ai_cost_usd,
      error_message: hitDeadline ? `deadline reached after ${BATCH_HARD_DEADLINE_MS}ms` : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run_id);

  return { status: finalStatus };
}

async function processOne(
  page: { id: string; url: string; source_id: string | null; current_version_id: string | null },
  run_id: string,
  stats: Stats,
): Promise<void> {
  const fetched = await fetchPage(page.url);
  if (!fetched) {
    stats.failed++;
    return;
  }
  stats.crawled++;
  if (fetched.status >= 400) {
    stats.failed++;
    return;
  }
  try {
    const res = await upsertPageAndVersion({
      url: page.url,
      raw_html: fetched.html,
      http_status: fetched.status,
      source_id: page.source_id,
      run_id,
    });
    if (res.status === "updated" || res.status === "created") {
      stats.updated++;
    } else if (res.status === "unchanged") {
      // Manuális refreshnél az „unchanged" is szándékos újraprojekció:
      // ismételten meghívjuk a KG publishert a current verziót használva,
      // hogy a snapshot ténylegesen frissüljön (élek + audit sor).
      stats.skipped++;
      try {
        await publishPageChange({ page_id: page.id, run_id });
      } catch {
        /* KG-hiba nem borítja a runt */
      }
    } else {
      stats.failed++;
    }
  } catch {
    stats.failed++;
  }
}

export interface RefreshResult {
  run_id: string;
  status: "success" | "partial" | "failed";
  stats: Stats;
  pages_requested: number;
}

async function markRunning(run_id: string): Promise<void> {
  await getAdminClient()
    .from("website_crawl_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", run_id);
}

export async function refreshSinglePage(input: {
  page_id: string;
  triggered_by_user_id?: string | null;
}): Promise<RefreshResult> {
  const pages = await loadPages([input.page_id]);
  if (pages.length === 0) {
    throw new Error("Oldal nem található.");
  }
  const started = Date.now();
  const stats: Stats = { crawled: 0, updated: 0, skipped: 0, failed: 0 };
  const run = await startCrawlRun({
    trigger: "manual_page" as CrawlTrigger,
    triggered_by_user_id: input.triggered_by_user_id ?? null,
    metadata: { page_id: input.page_id, url: pages[0].url },
  });
  await markRunning(run.run_id);
  await processOne(pages[0], run.run_id, stats);
  const fin = await finalizeRun(run.run_id, started, stats, false);
  return { run_id: run.run_id, status: fin.status, stats, pages_requested: 1 };
}

export async function refreshPagesBatch(input: {
  page_ids: string[];
  triggered_by_user_id?: string | null;
}): Promise<RefreshResult> {
  const uniqueIds = Array.from(new Set(input.page_ids)).slice(0, 20);
  const pages = await loadPages(uniqueIds);
  if (pages.length === 0) {
    throw new Error("Nincs feldolgozandó oldal.");
  }
  const started = Date.now();
  const stats: Stats = { crawled: 0, updated: 0, skipped: 0, failed: 0 };
  const run = await startCrawlRun({
    trigger: "manual_batch" as CrawlTrigger,
    triggered_by_user_id: input.triggered_by_user_id ?? null,
    metadata: { page_ids: uniqueIds },
  });
  await markRunning(run.run_id);
  let hitDeadline = false;
  for (const p of pages) {
    if (Date.now() - started > BATCH_HARD_DEADLINE_MS) {
      hitDeadline = true;
      break;
    }
    await processOne(p, run.run_id, stats);
  }
  const fin = await finalizeRun(run.run_id, started, stats, hitDeadline);
  return { run_id: run.run_id, status: fin.status, stats, pages_requested: pages.length };
}