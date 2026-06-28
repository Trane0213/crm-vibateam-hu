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

type Mode = "sales" | "pm";
type Row = Record<string, unknown>;

type Input = { mode: Mode; name?: string | null };

function validate(input: unknown): Input {
  const i = input as Input;
  if (!i || (i.mode !== "sales" && i.mode !== "pm")) {
    throw new Error("mode='sales' vagy 'pm' kötelező");
  }
  return { mode: i.mode, name: i.name ?? null };
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

async function loadSnapshot(client: SupabaseClient, mode: Mode): Promise<string> {
  if (mode === "sales") {
    const [companies, contacts, leads, quotes, followups] = await Promise.all([
      safeList(client, "companies", { order: "name", ascending: true, limit: 50 }),
      safeList(client, "contacts", { order: "name", ascending: true, limit: 50 }),
      safeList(client, "leads", { limit: 30 }),
      safeList(client, "quotes", { limit: 30 }),
      safeList(client, "followups", { order: "due_date", ascending: true, limit: 30 }),
    ]);
    return [
      `## companies (${companies.length})\n${JSON.stringify(companies.map((r) => pick(r, ["id", "name", "industry"])))}`,
      `## contacts (${contacts.length})\n${JSON.stringify(contacts.map((r) => pick(r, ["id", "name", "full_name", "email", "company_id"])))}`,
      `## leads (${leads.length})\n${JSON.stringify(leads.map((r) => pick(r, ["id", "name", "company", "source", "status", "created_at"])))}`,
      `## quotes (${quotes.length})\n${JSON.stringify(quotes.map((r) => pick(r, ["id", "title", "status", "total_amount", "currency", "project_id", "created_at", "valid_until"])))}`,
      `## followups (${followups.length})\n${JSON.stringify(followups.map((r) => pick(r, ["id", "due_date", "completed", "followup_type", "project_id", "contact_id"])))}`,
    ].join("\n\n");
  }
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
    const snapshot = await loadSnapshot(context.supabase, data.mode);
    const who = (data.name ?? "").trim() || "a kollégának";
    const agentId = data.mode === "sales" ? "sales_briefing" : "pm_briefing";
    const title = data.mode === "sales" ? "értékesítési" : "projektvezetői";

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

    return { text: result.finalText, runId: result.runId };
  });