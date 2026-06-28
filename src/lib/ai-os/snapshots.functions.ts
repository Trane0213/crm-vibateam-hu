/**
 * AI OS — CRM snapshot szerver funkciók.
 *
 * A dashboard és a projekt nézet AI összefoglalóihoz tölt be tömör,
 * token-kímélő kontextust. RLS alatt fut (requireSupabaseAuth), így csak
 * azt látja, amit a bejelentkezett felhasználó.
 *
 * A régi `src/lib/ai/crm-context.ts` kliensoldali változatát váltja le.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

type Row = Record<string, any>;

function pick<T extends Row>(row: T, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") out[k] = row[k];
  return out;
}

async function safeList(
  supabase: any,
  table: string,
  opts: { order?: string; ascending?: boolean; limit?: number } = {},
): Promise<Row[]> {
  const { order = "created_at", ascending = false, limit = 25 } = opts;
  try {
    const { data, error } = await supabase.from(table).select("*").order(order, { ascending }).limit(limit);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

function serializeCrm(snapshot: {
  companies: Row[]; contacts: Row[]; leads: Row[]; projects: Row[];
  quotes: Row[]; followups: Row[]; tasks: Row[]; documents: Row[];
}): string {
  const company = (r: Row) => pick(r, ["id", "name", "tax_number", "website", "industry"]);
  const contact = (r: Row) => pick(r, ["id", "name", "full_name", "email", "phone", "company_id", "role"]);
  const lead = (r: Row) => pick(r, ["id", "name", "company", "source", "status", "created_at"]);
  const project = (r: Row) => pick(r, ["id", "title", "name", "status", "address", "company_id", "deadline", "created_at"]);
  const quote = (r: Row) => pick(r, ["id", "title", "status", "total_amount", "currency", "project_id", "version", "created_at", "valid_until"]);
  const followup = (r: Row) => pick(r, ["id", "due_date", "completed", "followup_type", "result", "project_id", "contact_id"]);
  const task = (r: Row) => pick(r, ["id", "title", "due_date", "status", "priority", "project_id"]);
  const doc = (r: Row) => pick(r, ["id", "name", "file_name", "project_id", "created_at"]);

  const section = (title: string, rows: Row[], map: (r: Row) => Row) =>
    `## ${title} (${rows.length})\n${rows.length ? JSON.stringify(rows.map(map)) : "[]"}`;

  return [
    section("companies", snapshot.companies, company),
    section("contacts", snapshot.contacts, contact),
    section("leads", snapshot.leads, lead),
    section("projects", snapshot.projects, project),
    section("quotes", snapshot.quotes, quote),
    section("followups", snapshot.followups, followup),
    section("tasks", snapshot.tasks, task),
    section("documents", snapshot.documents, doc),
  ].join("\n\n");
}

export const loadCrmSnapshotText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [companies, contacts, leads, projects, quotes, followups, tasks, documents] = await Promise.all([
      safeList(s, "companies", { order: "name", ascending: true, limit: 50 }),
      safeList(s, "contacts", { order: "name", ascending: true, limit: 50 }),
      safeList(s, "leads", { limit: 30 }),
      safeList(s, "projects", { limit: 30 }),
      safeList(s, "quotes", { limit: 30 }),
      safeList(s, "followups", { order: "due_date", ascending: true, limit: 30 }),
      safeList(s, "tasks", { order: "due_date", ascending: true, limit: 30 }),
      safeList(s, "project_documents", { limit: 20 }),
    ]);
    return {
      text: serializeCrm({ companies, contacts, leads, projects, quotes, followups, tasks, documents }),
    };
  });

function validateProjectInput(input: unknown): { projectId: string } {
  const i = input as { projectId?: string };
  if (!i || typeof i.projectId !== "string" || !i.projectId.trim()) {
    throw new Error("projectId kötelező");
  }
  return { projectId: i.projectId };
}

export const loadProjectSnapshotText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateProjectInput)
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    const { projectId } = data;

    const [{ data: projectRow }, quotesAll, followupsAll, tasksAll, docsAll, notesAll] = await Promise.all([
      s.from("projects").select("*").eq("id", projectId).maybeSingle(),
      safeList(s, "quotes", { limit: 50 }),
      safeList(s, "followups", { order: "due_date", ascending: true, limit: 50 }),
      safeList(s, "tasks", { order: "due_date", ascending: true, limit: 50 }),
      safeList(s, "project_documents", { limit: 50 }),
      safeList(s, "project_notes", { limit: 30 }),
    ]);

    const quotes = quotesAll.filter((r) => r.project_id === projectId);
    const followups = followupsAll.filter((r) => r.project_id === projectId);
    const tasks = tasksAll.filter((r) => r.project_id === projectId);
    const documents = docsAll.filter((r) => r.project_id === projectId);
    const notes = notesAll.filter((r) => r.project_id === projectId);

    const text = [
      `## PROJEKT\n${JSON.stringify(projectRow ?? {})}`,
      `## AJÁNLATOK (${quotes.length})\n${JSON.stringify(quotes)}`,
      `## FOLLOW-UPOK (${followups.length})\n${JSON.stringify(followups)}`,
      `## FELADATOK (${tasks.length})\n${JSON.stringify(tasks)}`,
      `## DOKUMENTUMOK (${documents.length})\n${JSON.stringify(documents.map((d) => ({ id: d.id, name: d.name ?? d.file_name, created_at: d.created_at })))}`,
      `## JEGYZETEK (${notes.length})\n${JSON.stringify(notes.map((n) => ({ id: n.id, content: n.content ?? n.body, created_at: n.created_at })))}`,
    ].join("\n\n");

    return { text };
  });