/**
 * Website Knowledge — READ server functions (WK-2).
 *
 * Csak SELECT-eket adnak vissza az authenticated felhasználónak (owner check
 * a UI oldalán). Nem használnak service_role klienst.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { simpleLineDiff, summarizeDiff, type DiffLine } from "./diff.server";
import type { PageListRow, PageVersionListRow } from "./types";

function normalizeForCompare(input: string): string {
  return input.replace(/\r\n/g, "\n").trim();
}

export const wkListRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("website_crawl_runs")
      .select(
        "id, trigger, status, netlify_deploy_id, netlify_site_id, started_at, finished_at, pages_crawled, pages_updated, pages_skipped, pages_failed, ai_jobs_total, ai_cost_usd, error_message",
      )
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { runs: data ?? [] };
  });

export const wkListPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { search?: string } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("website_pages")
      .select(
        "id, url, path, title, asset_kind, is_active, last_crawled_at, last_seen_at, current_version_id",
      )
      .order("last_crawled_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (data.search && data.search.trim().length > 0) {
      const term = `%${data.search.trim()}%`;
      q = q.or(`url.ilike.${term},title.ilike.${term},path.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { pages: (rows ?? []) as PageListRow[] };
  });

export const wkGetPageHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { page_id: string }) => {
    if (!data?.page_id || typeof data.page_id !== "string") {
      throw new Error("page_id required");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: page, error: pageErr } = await context.supabase
      .from("website_pages")
      .select("id, url, title, path, current_version_id, asset_kind")
      .eq("id", data.page_id)
      .maybeSingle();
    if (pageErr) throw new Error(pageErr.message);
    if (!page) throw new Error("page not found");

    const { data: versions, error: vErr } = await context.supabase
      .from("website_page_versions")
      .select("id, version_number, content_hash, http_status, byte_size, fetched_at, run_id")
      .eq("page_id", data.page_id)
      .order("version_number", { ascending: false })
      .limit(50);
    if (vErr) throw new Error(vErr.message);

    const { data: changes, error: cErr } = await context.supabase
      .from("website_page_changes")
      .select("id, from_version_id, to_version_id, change_type, diff_summary, created_at")
      .eq("page_id", data.page_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (cErr) throw new Error(cErr.message);

    return {
      page,
      versions: (versions ?? []) as PageVersionListRow[],
      changes: changes ?? [],
    };
  });

export const wkGetPageDiff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { from_version_id: string | null; to_version_id: string }) => {
    if (!data?.to_version_id) throw new Error("to_version_id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const ids: string[] = [data.to_version_id];
    if (data.from_version_id) ids.push(data.from_version_id);
    const { data: rows, error } = await context.supabase
      .from("website_page_versions")
      .select("id, version_number, rendered_text, fetched_at")
      .in("id", ids);
    if (error) throw new Error(error.message);

    const toRow = rows?.find((r) => r.id === data.to_version_id);
    const fromRow = data.from_version_id
      ? rows?.find((r) => r.id === data.from_version_id)
      : null;

    const before = normalizeForCompare((fromRow?.rendered_text as string | null) ?? "");
    const after = normalizeForCompare((toRow?.rendered_text as string | null) ?? "");
    const diff = simpleLineDiff(before, after);
    const lines: DiffLine[] = diff.lines.slice(0, 500);
    return {
      from: fromRow ?? null,
      to: toRow ?? null,
      summary: summarizeDiff(diff),
      added_lines: diff.added_lines,
      removed_lines: diff.removed_lines,
      lines,
      truncated: diff.lines.length > 500,
    };
  });