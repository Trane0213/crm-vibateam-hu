/**
 * Website crawler — WK-1 STUB.
 *
 * A tényleges sitemap-fetch, HTML parse, hash + verzió + diff és blokk
 * extrakció a WK-2 sprintben kerül implementálásra. WK-1-ben ez a fájl
 * kizárólag egy `website_crawl_runs` sort ír `pending` státusszal, hogy
 * a Netlify webhook auditálható legyen és megjelenjen az Owner UI-n.
 */

import { getAdminClient } from "@/integrations/supabase/server";
import type { StartCrawlRunInput, StartCrawlRunResult } from "./types";

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