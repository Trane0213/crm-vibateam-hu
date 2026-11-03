/**
 * AI OS — Daily Briefing server function.
 *
 * A Dashboard "Napi briefing" kártyája használja. Egy hívásban:
 *   1) RLS alatt betölti a felhasználó számára látható CRM snapshotot.
 *   2) A snapshot szerializált stringjét user message-ként átadja az AI OS-nek.
 *   3) A megfelelő briefing agentet (`sales_briefing` vagy `pm_briefing`) futtatja.
 *
 * NEM hív vissza a régi `src/lib/ai/*` rétegre. Saját, snapshot-only path.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from 'zod';

type Mode = "sales" | "pm";
type Row = Record<string, unknown>;

type Input = { mode: Mode; name?: string | null; intent: 'automatic'|'manual'|'read' };

function validate(input: unknown): Input {
  return z.object({mode:z.enum(['sales','pm']),name:z.string().max(120).nullable().optional(),intent:z.enum(['automatic','manual','read']).default('automatic')}).strict().parse(input);
}

function pick(row: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

async function safeList(
  client: SupabaseClient,
  table: string,
  opts: { order?: string; ascending?: boolean; limit?: number } = {},
): Promise<Row[]> {
  const { order = "created_at", ascending = false, limit = 25 } = opts;
  try {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order(order, { ascending })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

async function loadSnapshot(client: SupabaseClient): Promise<string> {
  // PM
  const [projects, tasks, followups, documents] = await Promise.all([
    safeList(client, "projects", { limit: 30 }),
    safeList(client, "tasks", { order: "due_date", ascending: true, limit: 30 }),
    safeList(client, "followups", { order: "due_date", ascending: true, limit: 30 }),
    safeList(client, "project_documents", { limit: 20 }),
  ]);
  return [
    `## projects (${projects.length})\n${JSON.stringify(projects.map((r) => pick(r, ["id", "title", "name", "status", "address", "company_id", "deadline", "created_at"])))}`,
    `## tasks (${tasks.length})\n${JSON.stringify(tasks.map((r) => pick(r, ["id", "title", "due_date", "status", "priority", "project_id"])))}`,
    `## followups (${followups.length})\n${JSON.stringify(followups.map((r) => pick(r, ["id", "due_date", "completed", "followup_type", "project_id"])))}`,
    `## documents (${documents.length})\n${JSON.stringify(documents.map((r) => pick(r, ["id", "name", "file_name", "project_id", "created_at"])))}`,
  ].join("\n\n");
}

export const runDailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { ensureBootstrapped } = await import("./bootstrap.server");
    const { runAgent } = await import("./runtime.server");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    ensureBootstrapped();

    const admin = getAdminClient();
    if (data.mode === 'sales') {
      const { dailySalesBriefing } = await import('./daily-sales.server');
      return dailySalesBriefing(context.supabase,admin,context.userId,data.intent);
    }
    const snapshot = await loadSnapshot(context.supabase);
    const who = (data.name ?? "").trim() || "a kollégának";
    const agentId = 'pm_briefing';
    const title = 'projektvezetői';

    const userPrompt = [
      `Készítsd el ${who} a mai napi ${title} riportot a kötelező sablon szerint. Tömör, belső céges hangnemben. Ne köszönj újra.`,
      ``,
      `[CRM KONTEXTUS — ${new Date().toLocaleString("hu-HU")}]`,
      snapshot,
    ].join("\n");

    const result = await runAgent(context.supabase, admin, {
      agentId,
      userId: context.userId,
      userRole: null,
      threadId: null,
      history: [{ role: "user", content: userPrompt }],
    });

    return { text: result.finalText, runId: result.runId, status:'ready',stale:false,generatedAt:new Date().toISOString(),fingerprint:'' };
  });