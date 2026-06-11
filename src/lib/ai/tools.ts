/**
 * Agent tools — READ-ONLY.
 * Sémák OpenAI tool-calling formátumban + kliens oldali executor függvények.
 * Az executorok a böngészőből futnak, a felhasználó saját Supabase
 * sessionjével (RLS érvényesül). Egyik tool sem ír / nem töröl.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AgentId } from "@/lib/ai/agents";
import type { AiToolDef } from "@/lib/ai/provider.server";

type Row = Record<string, any>;
const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

async function fetchOne(table: string, id: string): Promise<Row | null> {
  const { data } = await supabase.from(table as any).select("*").eq("id", id).maybeSingle();
  return (data as Row) ?? null;
}
async function fetchAll(table: string, opts: { filterColumn?: string; filterValue?: any; limit?: number } = {}): Promise<Row[]> {
  let q: any = supabase.from(table as any).select("*").limit(opts.limit ?? 200);
  if (opts.filterColumn && opts.filterValue !== undefined) q = q.eq(opts.filterColumn, opts.filterValue);
  const { data } = await q;
  return (data as Row[]) ?? [];
}

// ============================================================
// EXECUTORS (csak olvasás)
// ============================================================

async function project_summary({ project_id }: { project_id: string }) {
  if (!project_id) return { error: "project_id kötelező" };
  const project = await fetchOne("projects", project_id);
  if (!project) return { error: "Projekt nem található", project_id };
  const [company, quotes, followups, tasks, docs, notes] = await Promise.all([
    project.company_id ? fetchOne("companies", project.company_id) : Promise.resolve(null),
    fetchAll("quotes", { filterColumn: "project_id", filterValue: project_id, limit: 50 }),
    fetchAll("followups", { filterColumn: "project_id", filterValue: project_id, limit: 50 }),
    fetchAll("tasks", { filterColumn: "project_id", filterValue: project_id, limit: 100 }),
    fetchAll("project_documents", { filterColumn: "project_id", filterValue: project_id, limit: 50 }),
    fetchAll("project_notes", { filterColumn: "project_id", filterValue: project_id, limit: 30 }),
  ]);
  const now = new Date();
  const open_tasks = tasks.filter((t) => t.status !== "done" && t.status !== "completed");
  const overdue_tasks = open_tasks.filter((t) => t.due_date && new Date(t.due_date) < now);
  const open_followups = followups.filter((f) => !f.completed);
  const total_quote_value = quotes.reduce((s, q) => s + (Number(q.total_amount) || 0), 0);
  return {
    project: pickProject(project),
    company: company ? pickCompany(company) : null,
    counts: { quotes: quotes.length, followups: followups.length, tasks: tasks.length, documents: docs.length, notes: notes.length },
    open_tasks: open_tasks.length,
    overdue_tasks: overdue_tasks.length,
    total_quote_value,
    quotes: quotes.map(pickQuote),
    open_followups: open_followups.map(pickFollowup),
    upcoming_tasks: open_tasks.slice(0, 10).map(pickTask),
    documents: docs.map((d) => ({ id: d.id, name: d.name ?? d.file_name, created_at: d.created_at })),
  };
}

async function company_summary({ company_id }: { company_id: string }) {
  if (!company_id) return { error: "company_id kötelező" };
  const company = await fetchOne("companies", company_id);
  if (!company) return { error: "Cég nem található", company_id };
  const [contacts, projects] = await Promise.all([
    fetchAll("contacts", { filterColumn: "company_id", filterValue: company_id, limit: 100 }),
    fetchAll("projects", { filterColumn: "company_id", filterValue: company_id, limit: 100 }),
  ]);
  const projectIds = projects.map((p) => p.id);
  const [quotes, followups] = await Promise.all([
    fetchAll("quotes", { limit: 200 }).then((all) => all.filter((q) => projectIds.includes(q.project_id))),
    fetchAll("followups", { limit: 200 }).then((all) => all.filter((f) => projectIds.includes(f.project_id))),
  ]);
  return {
    company: pickCompany(company),
    contacts: contacts.map(pickContact),
    projects: projects.map(pickProject),
    counts: { contacts: contacts.length, projects: projects.length, quotes: quotes.length, followups: followups.length },
    total_quote_value: quotes.reduce((s, q) => s + (Number(q.total_amount) || 0), 0),
    open_quotes: quotes.filter((q) => !["won", "lost", "accepted", "rejected"].includes(String(q.status))).length,
  };
}

async function contact_summary({ contact_id }: { contact_id: string }) {
  if (!contact_id) return { error: "contact_id kötelező" };
  const contact = await fetchOne("contacts", contact_id);
  if (!contact) return { error: "Kapcsolattartó nem található", contact_id };
  const [company, followups] = await Promise.all([
    contact.company_id ? fetchOne("companies", contact.company_id) : Promise.resolve(null),
    fetchAll("followups", { filterColumn: "contact_id", filterValue: contact_id, limit: 30 }),
  ]);
  return {
    contact: pickContact(contact),
    company: company ? pickCompany(company) : null,
    followups: followups.map(pickFollowup),
    open_followups: followups.filter((f) => !f.completed).length,
  };
}

// ----------------- Sales -----------------

async function create_followup_suggestion(_args: Record<string, never> = {}) {
  // CSAK JAVASLAT, semmit nem hoz létre.
  const [followups, quotes, leads] = await Promise.all([
    fetchAll("followups", { limit: 200 }),
    fetchAll("quotes", { limit: 200 }),
    fetchAll("leads", { limit: 100 }),
  ]);
  const now = new Date();
  const overdue = followups.filter((f) => !f.completed && f.due_date && new Date(f.due_date) < now);
  const openQuotes = quotes.filter((q) => !["won", "lost", "accepted", "rejected"].includes(String(q.status)));
  const staleQuotes = openQuotes.filter((q) => q.updated_at && daysBetween(now, new Date(q.updated_at)) > 7);
  const freshLeads = leads.filter((l) => l.status !== "lost" && l.status !== "won");
  const suggestions: Array<{ kind: string; ref: any; reason: string; priority: number }> = [];
  for (const f of overdue.slice(0, 5)) {
    suggestions.push({ kind: "followup_overdue", ref: pickFollowup(f), reason: `${daysBetween(now, new Date(f.due_date))} napja lejárt`, priority: 1 });
  }
  for (const q of staleQuotes.slice(0, 5)) {
    suggestions.push({ kind: "quote_stale", ref: pickQuote(q), reason: `${daysBetween(now, new Date(q.updated_at))} napja nem mozdult`, priority: 2 });
  }
  for (const l of freshLeads.slice(0, 5)) {
    suggestions.push({ kind: "lead_followup", ref: pickLead(l), reason: "Új vagy nyitott lead, érdemes megkeresni", priority: 3 });
  }
  return { generated_at: now.toISOString(), note: "Csak javaslat — nem hoz létre adatot.", suggestions };
}

async function lead_priority_report(_args: Record<string, never> = {}) {
  const leads = await fetchAll("leads", { limit: 200 });
  const now = new Date();
  const scored = leads.map((l) => {
    const ageDays = l.created_at ? daysBetween(now, new Date(l.created_at)) : 0;
    const isFresh = ageDays <= 7;
    const isHot = ["new", "qualified", "hot"].includes(String(l.status));
    const priority = (isFresh ? 2 : 0) + (isHot ? 2 : 0);
    return { ...pickLead(l), age_days: ageDays, priority };
  }).sort((a, b) => b.priority - a.priority);
  return {
    total: leads.length,
    fresh_7d: scored.filter((s) => s.age_days <= 7).length,
    top: scored.slice(0, 10),
  };
}

async function quote_risk_report(_args: Record<string, never> = {}) {
  const quotes = await fetchAll("quotes", { limit: 200 });
  const now = new Date();
  const open = quotes.filter((q) => !["won", "lost", "accepted", "rejected"].includes(String(q.status)));
  const stale = open.filter((q) => q.updated_at && daysBetween(now, new Date(q.updated_at)) > 14);
  const expiring = open.filter((q) => q.valid_until && daysBetween(new Date(q.valid_until), now) <= 7 && daysBetween(new Date(q.valid_until), now) >= 0);
  const expired = open.filter((q) => q.valid_until && new Date(q.valid_until) < now);
  return {
    total: quotes.length,
    open_count: open.length,
    open_value: open.reduce((s, q) => s + (Number(q.total_amount) || 0), 0),
    stale_over_14d: stale.map((q) => ({ ...pickQuote(q), stale_days: daysBetween(now, new Date(q.updated_at)) })),
    expiring_7d: expiring.map(pickQuote),
    already_expired: expired.map(pickQuote),
  };
}

// ----------------- PM -----------------

async function project_risk_report(_args: Record<string, never> = {}) {
  const [projects, tasks, followups, docs] = await Promise.all([
    fetchAll("projects", { limit: 200 }),
    fetchAll("tasks", { limit: 500 }),
    fetchAll("followups", { limit: 200 }),
    fetchAll("project_documents", { limit: 500 }),
  ]);
  const now = new Date();
  const active = projects.filter((p) => !["closed", "done", "lost", "archived", "cancelled"].includes(String(p.status)));
  const report = active.map((p) => {
    const pt = tasks.filter((t) => t.project_id === p.id);
    const open = pt.filter((t) => t.status !== "done" && t.status !== "completed");
    const overdue = open.filter((t) => t.due_date && new Date(t.due_date) < now);
    const pf = followups.filter((f) => f.project_id === p.id);
    const pd = docs.filter((d) => d.project_id === p.id);
    const risks: string[] = [];
    if (overdue.length) risks.push(`${overdue.length} lejárt feladat`);
    if (!pf.length) risks.push("nincs follow-up");
    if (!pd.length) risks.push("nincs dokumentum");
    const level = overdue.length >= 2 || risks.length >= 3 ? "🔴" : risks.length >= 1 ? "🟡" : "🟢";
    return { ...pickProject(p), level, risks, overdue_tasks: overdue.length, open_tasks: open.length, followups: pf.length, documents: pd.length };
  }).sort((a, b) => (a.level === "🔴" ? -1 : 1) - (b.level === "🔴" ? -1 : 1));
  return { generated_at: now.toISOString(), active_count: active.length, projects: report };
}

async function deadline_report({ days = 7 }: { days?: number } = {}) {
  const [tasks, projects] = await Promise.all([
    fetchAll("tasks", { limit: 500 }),
    fetchAll("projects", { limit: 200 }),
  ]);
  const now = new Date();
  const horizon = new Date(now.getTime() + days * DAY);
  const open = tasks.filter((t) => t.status !== "done" && t.status !== "completed" && t.due_date);
  const overdue = open.filter((t) => new Date(t.due_date) < now);
  const upcoming = open.filter((t) => new Date(t.due_date) >= now && new Date(t.due_date) <= horizon);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.title ?? projects.find((p) => p.id === id)?.name ?? null;
  return {
    today: now.toISOString(),
    horizon_days: days,
    overdue: overdue.map((t) => ({ ...pickTask(t), project: projectName(t.project_id) })),
    upcoming: upcoming.map((t) => ({ ...pickTask(t), project: projectName(t.project_id) })),
  };
}

async function missing_documents_report(_args: Record<string, never> = {}) {
  const [projects, docs] = await Promise.all([
    fetchAll("projects", { limit: 200 }),
    fetchAll("project_documents", { limit: 500 }),
  ]);
  const active = projects.filter((p) => !["closed", "done", "lost", "archived", "cancelled"].includes(String(p.status)));
  const withDocCount = active.map((p) => ({ project: pickProject(p), doc_count: docs.filter((d) => d.project_id === p.id).length }));
  return {
    active_count: active.length,
    missing: withDocCount.filter((x) => x.doc_count === 0).map((x) => x.project),
    has_docs: withDocCount.filter((x) => x.doc_count > 0).map((x) => ({ ...x.project, doc_count: x.doc_count })),
  };
}

async function email_thread_read({ thread_id }: { thread_id: string }) {
  if (!thread_id) return { error: "thread_id kötelező" };
  const { data, error } = await supabase
    .from("emails")
    .select("id,subject,from_email,to_email,direction,sent_at,created_at,body,summary")
    .eq("thread_id", thread_id)
    .order("sent_at", { ascending: true, nullsFirst: true })
    .limit(50);
  if (error) return { error: error.message };
  return { thread_id, count: data?.length ?? 0, messages: data ?? [] };
}

// ============================================================
// PICK HELPERS — token-takarékos kimenet
// ============================================================
const pickProject = (r: Row) => ({ id: r.id, title: r.title ?? r.name, status: r.status, address: r.address, company_id: r.company_id, deadline: r.deadline, created_at: r.created_at });
const pickCompany = (r: Row) => ({ id: r.id, name: r.name, tax_number: r.tax_number, industry: r.industry });
const pickContact = (r: Row) => ({ id: r.id, name: r.name ?? r.full_name, email: r.email, phone: r.phone, company_id: r.company_id, role: r.role });
const pickQuote = (r: Row) => ({ id: r.id, title: r.title, status: r.status, total_amount: r.total_amount, currency: r.currency, project_id: r.project_id, version: r.version, valid_until: r.valid_until, created_at: r.created_at, updated_at: r.updated_at });
const pickFollowup = (r: Row) => ({ id: r.id, due_date: r.due_date, completed: r.completed, followup_type: r.followup_type, result: r.result, project_id: r.project_id, contact_id: r.contact_id });
const pickTask = (r: Row) => ({ id: r.id, title: r.title, due_date: r.due_date, status: r.status, priority: r.priority, project_id: r.project_id });
const pickLead = (r: Row) => ({ id: r.id, name: r.name, company: r.company, source: r.source, status: r.status, created_at: r.created_at });

// ============================================================
// TOOL REGISTRY per AGENT
// ============================================================

type ToolEntry = { def: AiToolDef; run: (args: any) => Promise<any> };

const TOOLS: Record<string, ToolEntry> = {
  // CRM
  project_summary: {
    def: { type: "function", function: { name: "project_summary", description: "Egy konkrét projekt teljes összefoglalója: cég, ajánlatok, follow-upok, feladatok, dokumentumok. CSAK OLVAS.", parameters: { type: "object", properties: { project_id: { type: "string", description: "A projekt UUID-ja a CRM-ből." } }, required: ["project_id"] } } },
    run: project_summary,
  },
  company_summary: {
    def: { type: "function", function: { name: "company_summary", description: "Egy cég teljes képe: kapcsolattartók, projektek, ajánlatok, érték. CSAK OLVAS.", parameters: { type: "object", properties: { company_id: { type: "string" } }, required: ["company_id"] } } },
    run: company_summary,
  },
  contact_summary: {
    def: { type: "function", function: { name: "contact_summary", description: "Egy kapcsolattartó adatai, cége, hozzá tartozó follow-upok. CSAK OLVAS.", parameters: { type: "object", properties: { contact_id: { type: "string" } }, required: ["contact_id"] } } },
    run: contact_summary,
  },
  // Sales
  create_followup_suggestion: {
    def: { type: "function", function: { name: "create_followup_suggestion", description: "Follow-up JAVASLATOKAT generál priorizálva. NEM hoz létre semmit — csak olvas és javasol.", parameters: { type: "object", properties: {} } } },
    run: create_followup_suggestion,
  },
  lead_priority_report: {
    def: { type: "function", function: { name: "lead_priority_report", description: "Leadek prioritás szerinti listája (frissesség + státusz). CSAK OLVAS.", parameters: { type: "object", properties: {} } } },
    run: lead_priority_report,
  },
  quote_risk_report: {
    def: { type: "function", function: { name: "quote_risk_report", description: "Ajánlatok kockázati riportja: elakadt (>14 nap), lejáró (7 napon belül), már lejárt. CSAK OLVAS.", parameters: { type: "object", properties: {} } } },
    run: quote_risk_report,
  },
  // PM
  project_risk_report: {
    def: { type: "function", function: { name: "project_risk_report", description: "Aktív projektek kockázati riportja: 🟢/🟡/🔴 + indokok (lejárt feladat, hiányzó follow-up vagy dokumentum). CSAK OLVAS.", parameters: { type: "object", properties: {} } } },
    run: project_risk_report,
  },
  deadline_report: {
    def: { type: "function", function: { name: "deadline_report", description: "Lejárt és közelgő (alapból 7 nap) feladat-határidők projekt szerint. CSAK OLVAS.", parameters: { type: "object", properties: { days: { type: "number", description: "Hány napra előre nézzen (alap: 7)" } } } } },
    run: deadline_report,
  },
  missing_documents_report: {
    def: { type: "function", function: { name: "missing_documents_report", description: "Mely aktív projekteknek nincs dokumentumuk. CSAK OLVAS.", parameters: { type: "object", properties: {} } } },
    run: missing_documents_report,
  },
  // EMAIL (Gmail-szinkronból)
  email_thread_read: {
    def: { type: "function", function: { name: "email_thread_read", description: "Egy email szál összes üzenete időrendben (subject, feladó, címzett, body). CSAK OLVAS.", parameters: { type: "object", properties: { thread_id: { type: "string", description: "thread_id a CRM emails táblából (vagy Gmail threadId)." } }, required: ["thread_id"] } } },
    run: email_thread_read,
  },
};

export const AGENT_TOOL_NAMES: Record<AgentId, string[]> = {
  crm:   ["project_summary", "company_summary", "contact_summary", "email_thread_read"],
  sales: ["create_followup_suggestion", "lead_priority_report", "quote_risk_report", "project_summary", "company_summary", "email_thread_read"],
  pm:    ["project_risk_report", "deadline_report", "missing_documents_report", "project_summary", "email_thread_read"],
};

export function getToolDefsForAgent(agent: AgentId): AiToolDef[] {
  return AGENT_TOOL_NAMES[agent].map((n) => TOOLS[n].def);
}

export async function runTool(name: string, args: any): Promise<any> {
  const entry = TOOLS[name];
  if (!entry) return { error: `Ismeretlen tool: ${name}` };
  try {
    return await entry.run(args ?? {});
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}