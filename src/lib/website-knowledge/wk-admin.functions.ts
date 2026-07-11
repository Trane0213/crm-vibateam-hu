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