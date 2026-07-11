/**
 * Website Knowledge — owner-only admin server functions.
 *
 * Belső fejlesztői/demo célra: az owner a Settings → Website Knowledge
 * felületről manuálisan indíthat egy crawl-t, ami ugyanazt a
 * `startCrawlRun` + `runCrawl` folyamatot futtatja, mint a Netlify
 * webhook. Nem igényel secretet — a hívó autentikációját a
 * `requireSupabaseAuth` middleware, a szerepkör-ellenőrzést pedig a
 * `users_profile.roles.name = 'owner'` feltétel biztosítja.
 *
 * Ez a végpont NEM helyettesíti a publikus
 * `/api/public/website-knowledge/manual-trigger` route-ot; annak secretje
 * változatlanul él a Netlify / külső hívók számára.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertOwner(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("users_profile")
    .select("roles ( name )")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`role lookup: ${error.message}`);
  const raw = (data as { roles?: { name?: string | null } | null } | null)
    ?.roles?.name ?? null;
  const name = (raw ?? "owner").toString().trim().toLowerCase();
  const isOwner = ["owner", "tulajdonos", "admin", "superadmin"].includes(name);
  if (!isOwner) throw new Error("Csak owner indíthat manuális crawl-t.");
}

export const wkTriggerManualCrawl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.supabase as unknown as { from: (t: string) => any }, context.userId);
    const { startCrawlRun, runCrawl } = await import("./crawler.server");
    const run = await startCrawlRun({ trigger: "manual_full" });
    const result = await runCrawl(run.run_id);
    return { ok: true as const, run_id: run.run_id, ...result };
  });

export const wkRefreshPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { page_id: string }) =>
    z.object({ page_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase as unknown as { from: (t: string) => any }, context.userId);
    const { refreshSinglePage } = await import("./wk-refresh.server");
    const res = await refreshSinglePage({
      page_id: data.page_id,
      triggered_by_user_id: context.userId,
    });
    return { ok: true as const, ...res };
  });

export const wkRefreshPagesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { page_ids: string[] }) =>
    z
      .object({ page_ids: z.array(z.string().uuid()).min(1).max(20) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase as unknown as { from: (t: string) => any }, context.userId);
    const { refreshPagesBatch } = await import("./wk-refresh.server");
    const res = await refreshPagesBatch({
      page_ids: data.page_ids,
      triggered_by_user_id: context.userId,
    });
    return { ok: true as const, ...res };
  });

/**
 * KG backfill — HTML fetch NÉLKÜL futtatja a `publishPageChange`-et
 * a már indexelt `website_pages` sorokra. Létező oldalak KG
 * publikálására való, amikor a hash-check miatt a crawler „unchanged"
 * ágban átugorta a publishert. Egy hívás legfeljebb `limit` (max 40) oldalt
 * dolgoz fel, hogy beleférjen a Worker CPU budgetbe; többszöri hívással
 * lapozható az `offset` paraméterrel.
 */
export const wkBackfillKg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { limit?: number; offset?: number }) =>
    z
      .object({
        limit: z.number().int().min(1).max(40).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(
      context.supabase as unknown as { from: (t: string) => any },
      context.userId,
    );
    const limit = data.limit ?? 25;
    const offset = data.offset ?? 0;
    const { getAdminClient } = await import("@/integrations/supabase/server");
    const { publishPageChange } = await import("./kg-publisher.server");
    const { startCrawlRun } = await import("./crawler.server");

    const admin = getAdminClient();
    const { data: pages, error } = await admin
      .from("website_pages")
      .select("id, url, current_version_id")
      .eq("is_active", true)
      .not("current_version_id", "is", null)
      .order("last_crawled_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(`pages select: ${error.message}`);
    const rows = (pages ?? []) as Array<{ id: string; url: string }>;

    const run = await startCrawlRun({
      trigger: "manual_batch",
      triggered_by_user_id: context.userId,
      metadata: { kg_backfill: true, limit, offset, page_count: rows.length },
    });

    let ok = 0;
    let failed = 0;
    const started = Date.now();
    const DEADLINE_MS = 22_000;
    for (const p of rows) {
      if (Date.now() - started > DEADLINE_MS) break;
      try {
        const res = await publishPageChange({ page_id: p.id, run_id: run.run_id });
        if (!res.skipped && res.status === "ok") ok++;
        else failed++;
      } catch {
        failed++;
      }
    }

    await admin
      .from("website_crawl_runs")
      .update({
        status: failed > 0 ? "partial" : "success",
        finished_at: new Date().toISOString(),
        pages_crawled: rows.length,
        pages_updated: ok,
        pages_failed: failed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.run_id);

    return {
      ok: true as const,
      run_id: run.run_id,
      processed: rows.length,
      published: ok,
      failed,
      next_offset: offset + rows.length,
    };
  });