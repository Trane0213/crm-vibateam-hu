import { supabase } from "@/integrations/supabase/client";

type Row = Record<string, any>;

/** Mezőszűrés — csak az AI számára hasznos oszlopok mennek át. */
function pick<T extends Row>(row: T, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") out[k] = row[k];
  return out;
}

async function safeList(table: string, opts: { order?: string; ascending?: boolean; limit?: number } = {}) {
  const { order = "created_at", ascending = false, limit = 25 } = opts;
  try {
    const { data, error } = await supabase.from(table as any).select("*").order(order, { ascending }).limit(limit);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

export type CrmSnapshot = {
  companies: Row[];
  contacts: Row[];
  leads: Row[];
  projects: Row[];
  quotes: Row[];
  followups: Row[];
  tasks: Row[];
  documents: Row[];
};

export async function loadCrmSnapshot(): Promise<CrmSnapshot> {
  const [companies, contacts, leads, projects, quotes, followups, tasks, documents] = await Promise.all([
    safeList("companies", { order: "name", ascending: true, limit: 50 }),
    safeList("contacts", { order: "name", ascending: true, limit: 50 }),
    safeList("leads", { limit: 30 }),
    safeList("projects", { limit: 30 }),
    safeList("quotes", { limit: 30 }),
    safeList("followups", { order: "due_date", ascending: true, limit: 30 }),
    safeList("tasks", { order: "due_date", ascending: true, limit: 30 }),
    safeList("project_documents", { limit: 20 }),
  ]);
  return { companies, contacts, leads, projects, quotes, followups, tasks, documents };
}

/** Tömör JSON-szerű kontextus stringgé alakítva — token-kímélő. */
export function serializeSnapshot(s: CrmSnapshot): string {
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
    section("companies", s.companies, company),
    section("contacts", s.contacts, contact),
    section("leads", s.leads, lead),
    section("projects", s.projects, project),
    section("quotes", s.quotes, quote),
    section("followups", s.followups, followup),
    section("tasks", s.tasks, task),
    section("documents", s.documents, doc),
  ].join("\n\n");
}

/** Egy konkrét projekthez tartozó teljes kontextus. */
export async function loadProjectSnapshot(projectId: string) {
  const [project, quotes, followups, tasks, docs, notes] = await Promise.all([
    (async () => {
      const { data } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      return data as Row | null;
    })(),
    safeList("quotes", { limit: 50 }).then((rs) => rs.filter((r) => r.project_id === projectId)),
    safeList("followups", { order: "due_date", ascending: true, limit: 50 }).then((rs) => rs.filter((r) => r.project_id === projectId)),
    safeList("tasks", { order: "due_date", ascending: true, limit: 50 }).then((rs) => rs.filter((r) => r.project_id === projectId)),
    safeList("project_documents", { limit: 50 }).then((rs) => rs.filter((r) => r.project_id === projectId)),
    safeList("project_notes", { limit: 30 }).then((rs) => rs.filter((r) => r.project_id === projectId)),
  ]);
  return { project, quotes, followups, tasks, documents: docs, notes };
}

export function serializeProject(p: Awaited<ReturnType<typeof loadProjectSnapshot>>): string {
  return [
    `## PROJEKT\n${JSON.stringify(p.project ?? {})}`,
    `## AJÁNLATOK (${p.quotes.length})\n${JSON.stringify(p.quotes)}`,
    `## FOLLOW-UPOK (${p.followups.length})\n${JSON.stringify(p.followups)}`,
    `## FELADATOK (${p.tasks.length})\n${JSON.stringify(p.tasks)}`,
    `## DOKUMENTUMOK (${p.documents.length})\n${JSON.stringify(p.documents.map((d) => ({ id: d.id, name: d.name ?? d.file_name, created_at: d.created_at })))}`,
    `## JEGYZETEK (${p.notes.length})\n${JSON.stringify(p.notes.map((n) => ({ id: n.id, content: n.content ?? n.body, created_at: n.created_at })))}`,
  ].join("\n\n");
}