import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * George szervezeti jelzései (1. ütem) — Tulajdonos-only, GET, determinisztikus.
 * 0 AI-hívás, 0 írás, admin kliens nélkül: csak a hívó RLS-jogosultságával olvas.
 */
export const georgeOrgSignals = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { assertOwner, loadOrgSignals } = await import("./org-signals.server");
  const { buildOrgSignals, summarizeOrgSignals } = await import("./org-signals");
  await assertOwner(context.supabase, context.userId);
  const load = await loadOrgSignals(context.supabase);
  const items = buildOrgSignals(load.inputs);
  return { generatedAt: load.inputs.now, items, summary: summarizeOrgSignals(items), sources: load.sources, collectorEnabled: load.collectorEnabled, llmCalls: 0 as const, writes: 0 as const };
});
