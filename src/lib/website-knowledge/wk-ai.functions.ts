/**
 * Website Knowledge AI — READ server functions (WK-3).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

// A generált Database típusok még nem tartalmazzák a `website_*` táblákat
// (WK-1 spec: séma külön migrációként ment). Amíg nem frissülnek, laza
// kliens-view csak READ-re. RLS + middleware továbbra is teljes védelmet ad.
type LooseClient = SupabaseClient<any, any, any>;

export const wkGetPageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { page_id: string }) => {
    if (!data?.page_id) throw new Error("page_id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    type EntityLink = {
      id: string;
      role: string | null;
      confidence: number | null;
      entity: { id: string; entity_kind: string; name: string } | null;
    };
    const { data: page, error: pErr } = await sb
      .from("website_pages")
      .select("id, url, title, current_version_id")
      .eq("id", data.page_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!page || !page.current_version_id) {
      return { summary: null, entity_links: [] as EntityLink[] };
    }
    const { data: summary, error: sErr } = await sb
      .from("website_page_summaries")
      .select("id, summary, summary_json, model, created_at, page_version_id")
      .eq("page_version_id", page.current_version_id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);

    const { data: links, error: lErr } = await sb
      .from("website_page_entities")
      .select("id, role, confidence, evidence, entity_id")
      .eq("page_version_id", page.current_version_id)
      .limit(50);
    if (lErr) throw new Error(lErr.message);

    const entityIds = Array.from(new Set((links ?? []).map((l: any) => l.entity_id as string)));
    let entities: any[] = [];
    if (entityIds.length > 0) {
      const { data: entRows, error: eErr } = await sb
        .from("website_entities")
        .select("id, entity_kind, name")
        .in("id", entityIds);
      if (eErr) throw new Error(eErr.message);
      entities = entRows ?? [];
    }
    const entityById = new Map<string, { id: string; entity_kind: string; name: string }>();
    for (const e of entities) entityById.set(e.id, e);

    const enriched: EntityLink[] = (links ?? []).map((l: any) => ({
      id: l.id as string,
      role: l.role as string | null,
      confidence: l.confidence as number | null,
      entity: entityById.get(l.entity_id as string) ?? null,
    }));

    return {
      summary: (summary ?? null) as null | {
        id: string;
        summary: string | null;
        summary_json: unknown;
        model: string | null;
        created_at: string;
        page_version_id: string;
      },
      entity_links: enriched,
    };
  });

export const wkListEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { search?: string } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    let q = sb
      .from("website_entities")
      .select("id, entity_kind, name, normalized_name, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.search && data.search.trim().length > 0) {
      const term = `%${data.search.trim()}%`;
      q = q.or(`name.ilike.${term},normalized_name.ilike.${term}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const entities = (rows ?? []) as Array<{
      id: string;
      entity_kind: string;
      name: string;
      normalized_name: string;
      updated_at: string;
    }>;

    // Előfordulás-számláló (count per entity a website_page_entities-en)
    const ids = entities.map((e) => e.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: linkRows } = await sb
        .from("website_page_entities")
        .select("entity_id")
        .in("entity_id", ids);
      for (const l of (linkRows ?? []) as Array<{ entity_id: string }>) {
        counts.set(l.entity_id, (counts.get(l.entity_id) ?? 0) + 1);
      }
    }

    return {
      entities: entities.map((e) => ({ ...e, occurrences: counts.get(e.id) ?? 0 })),
    };
  });

export const wkGetRunAiJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { run_id: string }) => {
    if (!data?.run_id) throw new Error("run_id required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as LooseClient;
    const { data: jobs, error } = await sb
      .from("website_ai_jobs")
      .select(
        "id, job_kind, provider, model, status, input_tokens, output_tokens, total_cost_usd, latency_ms, error_message, page_id, page_version_id, created_at, finished_at",
      )
      .eq("run_id", data.run_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { jobs: jobs ?? [] };
  });