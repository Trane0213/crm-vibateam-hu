/**
 * Website crawler — WK-2.
 *
 * `startCrawlRun`   — új `pending` run rekord (webhook azonnal ezt adja vissza).
 * `runCrawl`        — sitemap fetch → párhuzamos oldal-letöltés (concurrency=4),
 *                     `upsertPageAndVersion` hívás, run statisztika + státusz.
 *
 * A Cloudflare Worker CPU budget miatt HARD_DEADLINE_MS = 25 000 ms.
 * Ennél nagyobb sitemapre `partial` státusszal zárunk. A WK-5-ös async
 * runner ezt kiveszi majd a hot pathból.
 */

import { getAdminClient } from "@/integrations/supabase/server";
import type { StartCrawlRunInput, StartCrawlRunResult } from "./types";
import { fetchSitemapUrls, guessSitemapUrl } from "./sitemap.server";
import { upsertPageAndVersion } from "./pages.server";

const HARD_DEADLINE_MS = 25_000;
const MAX_CONCURRENT = 4;
const DEFAULT_BASE_URL = "https://vibateam.hu";
const PAGE_TIMEOUT_MS = 12_000;

export async function startCrawlRun(
  input: StartCrawlRunInput,
): Promise<StartCrawlRunResult> {
  const admin = getAdminClient();
  const payload = {
    trigger: input.trigger,
    status: "pending" as const,
    netlify_deploy_id: input.netlify_deploy_id ?? null,
    netlify_site_id: input.netlify_site_id ?? null,
    triggered_by_user_id: input.triggered_by_user_id ?? null,
    metadata: input.metadata ?? {},
  };
  const { data, error } = await admin
    .from("website_crawl_runs")
    .insert(payload)
    .select("id, status, started_at")
    .single();
  if (error) throw new Error(`website_crawl_runs insert: ${error.message}`);
  if (!data) throw new Error("website_crawl_runs insert: nincs visszatérő sor");
  return {
    run_id: data.id as string,
    status: data.status as StartCrawlRunResult["status"],
    started_at: data.started_at as string,
  };
}

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

async function ensureDefaultSource(): Promise<{ id: string; base_url: string; sitemap_url: string }> {
  const admin = getAdminClient();
  const { data: existing } = await admin
    .from("website_sources")
    .select("id, base_url, metadata")
    .eq("is_enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) {
    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    const sitemap =
      typeof meta.sitemap_url === "string" ? meta.sitemap_url : guessSitemapUrl(existing.base_url as string);
    return { id: existing.id as string, base_url: existing.base_url as string, sitemap_url: sitemap };
  }
  const sitemap = guessSitemapUrl(DEFAULT_BASE_URL);
  const { data: created, error } = await admin
    .from("website_sources")
    .insert({
      kind: "sitemap",
      base_url: DEFAULT_BASE_URL,
      label: "vibateam.hu",
      metadata: { sitemap_url: sitemap },
    })
    .select("id, base_url")
    .single();
  if (error || !created) throw new Error(`sources insert: ${error?.message ?? "no row"}`);
  return { id: created.id as string, base_url: created.base_url as string, sitemap_url: sitemap };
}

interface Stats {
  crawled: number;
  updated: number;
  skipped: number;
  failed: number;
}

export async function runCrawl(run_id: string): Promise<{
  status: "success" | "partial" | "failed";
  stats: Stats;
  error?: string;
}> {
  const admin = getAdminClient();
  const started = Date.now();
  const stats: Stats = { crawled: 0, updated: 0, skipped: 0, failed: 0 };
  let source_id: string | null = null;

  await admin
    .from("website_crawl_runs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", run_id);

  let urls: string[];
  try {
    const src = await ensureDefaultSource();
    source_id = src.id;
    urls = await fetchSitemapUrls(src.sitemap_url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("website_crawl_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: `sitemap: ${msg}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run_id);
    return { status: "failed", stats, error: msg };
  }

  let cursor = 0;
  let hitDeadline = false;

  async function worker() {
    while (true) {
      if (Date.now() - started > HARD_DEADLINE_MS) {
        hitDeadline = true;
        return;
      }
      const idx = cursor++;
      if (idx >= urls.length) return;
      const url = urls[idx];
      const fetched = await fetchPage(url);
      if (!fetched) {
        stats.failed++;
        continue;
      }
      stats.crawled++;
      if (fetched.status >= 400) {
        stats.failed++;
        continue;
      }
      try {
        const res = await upsertPageAndVersion({
          url,
          raw_html: fetched.html,
          http_status: fetched.status,
          source_id,
          run_id,
        });
        if (res.status === "updated" || res.status === "created") stats.updated++;
        else if (res.status === "unchanged") stats.skipped++;
        else stats.failed++;
      } catch {
        stats.failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: MAX_CONCURRENT }, worker));

  // AI job aggregálás a runra
  let ai_jobs_total = 0;
  let ai_cost_usd = 0;
  try {
    const { data: jobs } = await admin
      .from("website_ai_jobs")
      .select("total_cost_usd")
      .eq("run_id", run_id);
    if (jobs) {
      ai_jobs_total = jobs.length;
      ai_cost_usd = jobs.reduce(
        (sum, j) => sum + Number((j as { total_cost_usd: number | null }).total_cost_usd ?? 0),
        0,
      );
      ai_cost_usd = Number(ai_cost_usd.toFixed(4));
    }
  } catch (e) {
    console.error("[WK] ai_jobs aggregate failed", e);
  }

  // KG publisher stat aggregálás — a `website` publisher legutóbbi run-hoz
  // közeli sorai (fut_id-t nem tárolunk a kg_publishers-en, ezért idő szerint
  // vesszük a mai/futás alatti sorokat). Csak a metadata.kg_* mezőket írjuk
  // a `website_crawl_runs.metadata`-ba, oszlop-módosítás nélkül.
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
  } catch (e) {
    console.error("[WK] kg_publisher aggregate failed", e);
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
      error_message: hitDeadline ? `deadline reached after ${HARD_DEADLINE_MS}ms` : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run_id);

  if (source_id) {
    await admin
      .from("website_sources")
      .update({ last_crawled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", source_id);
  }

  return { status: finalStatus, stats };
}