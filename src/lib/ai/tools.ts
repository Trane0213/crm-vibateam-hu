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
    if (!pf.length) risks.push("nincs utókövetés");
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
// NAVIGÁCIÓ + KERESÉS (Sprint 3 / Fázis A)
// ============================================================

/** Egyszerű fuzzy score: substring match + szóhatáron jobb. */
function fuzzyScore(needle: string, hay: string): number {
  const n = needle.trim().toLowerCase();
  const h = (hay ?? "").toLowerCase();
  if (!n || !h) return 0;
  if (h === n) return 1;
  if (h.startsWith(n)) return 0.9;
  const idx = h.indexOf(n);
  if (idx >= 0) {
    const wordBoundary = idx === 0 || /\s/.test(h[idx - 1]);
    return wordBoundary ? 0.8 : 0.6;
  }
  // szavanként
  const tokens = n.split(/\s+/);
  let hits = 0;
  for (const t of tokens) if (t && h.includes(t)) hits++;
  return tokens.length ? (hits / tokens.length) * 0.5 : 0;
}

type EntityKind = "customer" | "company" | "project" | "quote" | "lead" | "contact";

async function find_entity({ entity_type, query }: { entity_type: EntityKind; query: string }) {
  if (!entity_type || !query?.trim()) return { error: "entity_type és query kötelező" };
  const q = query.trim();

  // Customer = companies (Sprint 2 döntés szerint).
  const table = entity_type === "customer" ? "companies" : entity_type === "company" ? "companies" : `${entity_type}s`;
  const { data, error } = await supabase.from(table as any).select("*").limit(500);
  if (error) return { error: error.message };
  const rows = (data as Row[]) ?? [];

  // Mező-választás entitás szerint
  const nameOf = (r: Row): string => {
    switch (entity_type) {
      case "customer":
      case "company": return r.name ?? "";
      case "project": return r.title ?? r.name ?? "";
      case "quote":   return [r.title, r.version != null ? `v${r.version}` : ""].filter(Boolean).join(" ");
      case "lead":    return r.summary ?? r.name ?? r.source ?? "";
      case "contact": return r.name ?? r.full_name ?? r.email ?? "";
    }
  };
  const routeOf = (id: string): { to: string; params?: Record<string, string> } => {
    switch (entity_type) {
      case "customer":
      case "company": return { to: "/customers/$id", params: { id } };
      case "project": return { to: "/projects/$id", params: { id } };
      case "quote":   return { to: "/quotes/$id", params: { id } };
      case "lead":    return { to: "/leads/$id", params: { id } };
      case "contact": return { to: "/contacts/$id", params: { id } };
    }
  };

  const scored = rows
    .map((r) => ({ id: r.id, label: nameOf(r), score: fuzzyScore(q, nameOf(r)), row: r }))
    .filter((x) => x.score > 0.35)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, 8).map((x) => ({ id: x.id, label: x.label, score: Number(x.score.toFixed(2)), ...routeOf(x.id) }));

  // Egyértelmű találat: csak akkor auto-navigate, ha a legjobb >= 0.8 és érdemben jobb a másodiknál (>= 0.2 különbség), vagy egyetlen találat van
  const best = scored[0];
  const second = scored[1];
  const isUnique =
    best && (scored.length === 1 || (best.score >= 0.8 && (!second || best.score - second.score >= 0.2)));

  if (isUnique) {
    const route = routeOf(best.id);
    return {
      __navigate: { to: route.to, params: route.params, label: best.label },
      summary: `Megnyitottam: ${best.label}`,
      match: { id: best.id, label: best.label, score: Number(best.score.toFixed(2)) },
    };
  }
  return {
    matches: top,
    summary: top.length
      ? `Több találat van „${q}" keresésre. Kérlek, válaszd ki a megfelelőt a listából.`
      : `Nincs találat „${q}" keresésre a(z) ${entity_type} körben.`,
  };
}

async function open_route({ route, label }: { route: string; label?: string }) {
  // Statikus listák — engedélyezett route-ok (whitelist).
  const ALLOWED = new Set([
    "/dashboard",
    "/customers", "/companies", "/contacts",
    "/leads", "/projects", "/quotes",
    "/followups", "/tasks", "/meetings", "/calls",
    "/emails", "/documents",
    "/ai-assistant",
  ]);
  if (!route || !ALLOWED.has(route)) return { error: `Nem engedélyezett route: ${route}` };
  return {
    __navigate: { to: route, label: label ?? route },
    summary: `Megnyitottam: ${label ?? route}`,
  };
}

// ============================================================
// NAPI HÍVÁSLISTA — pontozó algoritmus
// ============================================================

async function daily_call_list(_args: Record<string, never> = {}) {
  const [followups, quotes, leads, kpiRes, companies] = await Promise.all([
    fetchAll("followups", { limit: 500 }),
    fetchAll("quotes", { limit: 500 }),
    fetchAll("leads", { limit: 200 }),
    supabase.from("customer_kpi_v" as any).select("*").limit(1000),
    fetchAll("companies", { limit: 500 }),
  ]);
  const now = new Date();
  const kpi: Row[] = (kpiRes.data as Row[]) ?? [];
  const kpiById = new Map(kpi.map((k) => [k.customer_id ?? k.id, k]));
  const compById = new Map(companies.map((c) => [c.id, c]));

  type Reason = { kind: string; weight: number; detail: string };
  type ScoreRow = { customer_id: string; name: string; score: number; reasons: Reason[] };
  const scores = new Map<string, ScoreRow>();

  const bump = (customer_id: string, reason: Reason) => {
    if (!customer_id) return;
    const name = (compById.get(customer_id) as Row | undefined)?.name ?? "Ismeretlen ügyfél";
    const cur: ScoreRow = scores.get(customer_id) ?? { customer_id, name, score: 0, reasons: [] };
    cur.score += reason.weight;
    cur.reasons.push(reason);
    scores.set(customer_id, cur);
  };

  // Lejárt utókövetésok → súly 30 + napok
  for (const f of followups) {
    if (f.completed || !f.due_date) continue;
    const due = new Date(f.due_date);
    if (due >= now) continue;
    const days = daysBetween(now, due);
    const cid = f.company_id;
    if (!cid) continue;
    bump(cid, { kind: "overdue_followup", weight: 30 + Math.min(days, 30), detail: `${days} napja lejárt utókövetés` });
  }

  // Nyitott ajánlatok → súly 15 + ajánlat kora (max 30 nap)
  const openStatus = (s: any) => !["won", "lost", "accepted", "rejected", "cancelled"].includes(String(s));
  for (const q of quotes) {
    if (!openStatus(q.status)) continue;
    const ref = q.updated_at ?? q.created_at;
    if (!ref) continue;
    const age = Math.min(daysBetween(now, new Date(ref)), 30);
    // Project → company
    // (gyors keresés project táblából költséges — quote-on már szokott lenni company_id ha létezik)
    const cid = q.company_id;
    if (!cid) continue;
    bump(cid, { kind: "open_quote", weight: 15 + age, detail: `nyitott ajánlat (${age} napos)` });
  }

  // KPI: lejárt utókövetés + nyitott ajánlat overdue ügyfeleknek (fallback)
  for (const k of kpi) {
    const cid = k.customer_id ?? k.id;
    if (!cid) continue;
    const overdue = Number(k.overdue_followups ?? 0);
    if (overdue > 0 && !scores.has(cid)) {
      bump(cid, { kind: "overdue_followup_kpi", weight: 25, detail: `${overdue} lejárt utókövetés (KPI)` });
    }
    const open = Number(k.open_quotes ?? 0);
    if (open > 0 && !scores.has(cid)) {
      bump(cid, { kind: "open_quotes_kpi", weight: 10 + open * 2, detail: `${open} nyitott ajánlat` });
    }
    const last = k.last_activity_at ? new Date(k.last_activity_at) : null;
    if (last) {
      const idle = daysBetween(now, last);
      if (idle > 30) bump(cid, { kind: "stale_activity", weight: Math.min(idle / 5, 20), detail: `${idle} napja nem volt aktivitás` });
    }
  }

  // Új leadek → 12 pont, ha 7 napon belüliek
  for (const l of leads) {
    if (!l.company_id || !l.created_at) continue;
    const age = daysBetween(now, new Date(l.created_at));
    if (age <= 7 && !["lost", "converted"].includes(String(l.status))) {
      bump(l.company_id, { kind: "fresh_lead", weight: 12, detail: `friss lead (${age} napos)` });
    }
  }

  const list = Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((s) => ({
      customer_id: s.customer_id,
      name: s.name,
      score: Math.round(s.score),
      reasons: s.reasons.map((r) => r.detail),
      route: { to: "/customers/$id", params: { id: s.customer_id } },
    }));

  return {
    generated_at: now.toISOString(),
    total: list.length,
    call_list: list,
    note: "Pontozás: lejárt utókövetés (30+), nyitott ajánlat (15+kor), inaktivitás (max 20), friss lead (12).",
  };
}

// ============================================================
// FOLLOW-UP ASSZISZTENS — nyitott ajánlatokra javaslat
// ============================================================

async function quote_followup_assistant(_args: Record<string, never> = {}) {
  const [quotes, followups, companies, activityRes] = await Promise.all([
    fetchAll("quotes", { limit: 200 }),
    fetchAll("followups", { limit: 500 }),
    fetchAll("companies", { limit: 500 }),
    supabase.from("customer_activity_v" as any).select("customer_id, occurred_at, kind").order("occurred_at", { ascending: false }).limit(2000),
  ]);
  const now = new Date();
  const compById = new Map(companies.map((c) => [c.id, c]));
  const activities: Row[] = (activityRes.data as Row[]) ?? [];
  const lastActivityByCustomer = new Map<string, Date>();
  for (const a of activities) {
    const cid = a.customer_id;
    if (!cid || !a.occurred_at) continue;
    if (!lastActivityByCustomer.has(cid)) lastActivityByCustomer.set(cid, new Date(a.occurred_at));
  }

  const openStatus = (s: any) => !["won", "lost", "accepted", "rejected", "cancelled"].includes(String(s));
  const open = quotes.filter((q) => openStatus(q.status));

  const items = open.map((q) => {
    const sentRef = q.created_at ? new Date(q.created_at) : null;
    const daysSinceSent = sentRef ? daysBetween(now, sentRef) : null;
    const cid = q.company_id;
    const last = cid ? lastActivityByCustomer.get(cid) : null;
    const daysSinceLast = last ? daysBetween(now, last) : null;

    // Van-e válasz / aktivitás az ajánlat után?
    const hadReplyAfterQuote = sentRef && last ? last > sentRef : false;

    // Van-e már nyitott utókövetés erre az ajánlatra?
    const hasOpenFollowup = followups.some(
      (f) => !f.completed && f.quote_id === q.id,
    );

    // Javaslat típus
    let suggestion: "call" | "email" | "task" | "wait" = "wait";
    let reason = "—";
    if (hasOpenFollowup) {
      suggestion = "wait";
      reason = "Már van nyitott utókövetés erre az ajánlatra.";
    } else if (daysSinceSent != null && daysSinceSent >= 14 && !hadReplyAfterQuote) {
      suggestion = "call";
      reason = `${daysSinceSent} napja küldve, nem érkezett válasz → telefonhívás javasolt.`;
    } else if (daysSinceSent != null && daysSinceSent >= 7 && !hadReplyAfterQuote) {
      suggestion = "email";
      reason = `${daysSinceSent} napja küldve → udvarias emlékeztető e-mail.`;
    } else if (daysSinceSent != null && daysSinceSent >= 3) {
      suggestion = "task";
      reason = `${daysSinceSent} napja küldve → emlékeztető feladat ${Math.max(1, 7 - daysSinceSent)} nap múlvára.`;
    } else {
      suggestion = "wait";
      reason = "Friss ajánlat — még várjunk a megrendelő válaszára.";
    }

    return {
      quote_id: q.id,
      title: q.title ?? `Ajánlat #${String(q.id).slice(0, 6)}`,
      version: q.version,
      total_amount: q.total_amount,
      status: q.status,
      company_id: cid,
      company_name: cid ? compById.get(cid)?.name ?? null : null,
      days_since_sent: daysSinceSent,
      days_since_last_activity: daysSinceLast,
      had_reply_after_quote: hadReplyAfterQuote,
      has_open_followup: hasOpenFollowup,
      suggestion,
      reason,
    };
  });

  // Rangsor: legrégebbi, válasz nélküli ajánlat felülre
  items.sort((a, b) => (b.days_since_sent ?? 0) - (a.days_since_sent ?? 0));

  return {
    generated_at: now.toISOString(),
    open_quotes: items.length,
    items: items.slice(0, 15),
  };
}

// ============================================================
// OPERÁTOR PROPOSAL TOOLOK — NEM hajtják végre, csak javasolnak
// ============================================================

function nowPlus(hoursOrIso: string | number): string {
  if (typeof hoursOrIso === "string") return new Date(hoursOrIso).toISOString();
  return new Date(Date.now() + hoursOrIso * 3600_000).toISOString();
}

async function propose_create_followup(args: {
  due_date?: string;
  followup_type?: "call" | "email" | "meeting" | "other";
  result?: string;
  project_id?: string;
  contact_id?: string;
  company_id?: string;
  quote_id?: string;
}) {
  if (!args.due_date) return { error: "due_date kötelező (ISO formátum vagy 'YYYY-MM-DD HH:mm')." };
  const proposal = {
    kind: "create_followup" as const,
    due_date: nowPlus(args.due_date),
    followup_type: args.followup_type ?? "call",
    result: args.result ?? null,
    project_id: args.project_id ?? null,
    contact_id: args.contact_id ?? null,
    company_id: args.company_id ?? null,
    quote_id: args.quote_id ?? null,
  };
  return { __proposal: proposal, summary: "Készítettem egy utókövetés javaslatot. Kérlek hagyd jóvá a felületen." };
}

async function propose_create_task(args: {
  title?: string;
  description?: string;
  project_id?: string;
  due_date?: string;
  priority?: string;
  status?: string;
}) {
  if (!args.title?.trim()) return { error: "title kötelező." };
  const proposal = {
    kind: "create_task" as const,
    title: args.title.trim(),
    description: args.description ?? null,
    project_id: args.project_id ?? null,
    due_date: args.due_date ? nowPlus(args.due_date) : null,
    status: args.status ?? "todo",
    priority: args.priority ?? "normal",
  };
  return { __proposal: proposal, summary: "Készítettem egy feladat javaslatot. Kérlek hagyd jóvá a felületen." };
}

async function propose_create_contact(args: {
  name?: string;
  email?: string;
  phone?: string;
  company_id?: string;
  role?: string;
  notes?: string;
}) {
  if (!args.name?.trim()) return { error: "name kötelező." };
  const proposal = {
    kind: "create_contact" as const,
    name: args.name.trim(),
    email: args.email ?? null,
    phone: args.phone ?? null,
    company_id: args.company_id ?? null,
    role: args.role ?? null,
    notes: args.notes ?? null,
  };
  return { __proposal: proposal, summary: "Készítettem egy kapcsolattartó javaslatot. Kérlek hagyd jóvá." };
}

async function propose_create_lead(args: {
  summary?: string;
  source?: string;
  project_type?: string;
  status?: string;
  company_id?: string;
  contact_id?: string;
}) {
  if (!args.summary?.trim()) return { error: "summary kötelező." };
  const proposal = {
    kind: "create_lead" as const,
    summary: args.summary.trim(),
    source: args.source ?? null,
    project_type: args.project_type ?? null,
    status: args.status ?? "new",
    company_id: args.company_id ?? null,
    contact_id: args.contact_id ?? null,
  };
  return { __proposal: proposal, summary: "Készítettem egy lead javaslatot. Kérlek hagyd jóvá." };
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
    def: { type: "function", function: { name: "project_summary", description: "Egy konkrét projekt teljes összefoglalója: cég, ajánlatok, utókövetésok, feladatok, dokumentumok. CSAK OLVAS.", parameters: { type: "object", properties: { project_id: { type: "string", description: "A projekt UUID-ja a CRM-ből." } }, required: ["project_id"] } } },
    run: project_summary,
  },
  company_summary: {
    def: { type: "function", function: { name: "company_summary", description: "Egy cég teljes képe: kapcsolattartók, projektek, ajánlatok, érték. CSAK OLVAS.", parameters: { type: "object", properties: { company_id: { type: "string" } }, required: ["company_id"] } } },
    run: company_summary,
  },
  contact_summary: {
    def: { type: "function", function: { name: "contact_summary", description: "Egy kapcsolattartó adatai, cége, hozzá tartozó utókövetésok. CSAK OLVAS.", parameters: { type: "object", properties: { contact_id: { type: "string" } }, required: ["contact_id"] } } },
    run: contact_summary,
  },
  // Sales
  create_followup_suggestion: {
    def: { type: "function", function: { name: "create_followup_suggestion", description: "Utókövetés JAVASLATOKAT generál priorizálva. NEM hoz létre semmit — csak olvas és javasol.", parameters: { type: "object", properties: {} } } },
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
    def: { type: "function", function: { name: "project_risk_report", description: "Aktív projektek kockázati riportja: 🟢/🟡/🔴 + indokok (lejárt feladat, hiányzó utókövetés vagy dokumentum). CSAK OLVAS.", parameters: { type: "object", properties: {} } } },
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
  // NAVIGÁCIÓ
  find_entity: {
    def: { type: "function", function: { name: "find_entity", description: "Megkeres egy entitást név/cím alapján és (ha egyértelmű találat van) MEGNYITJA a megfelelő CRM oldalt. Használd, ha a user azt mondja 'nyisd meg X-et', 'mutasd Y-t', vagy 'keresd meg Z-t'.", parameters: { type: "object", properties: { entity_type: { type: "string", enum: ["customer", "company", "project", "quote", "lead", "contact"], description: "Milyen entitást keresünk. 'customer' és 'company' ugyanaz (companies tábla)." }, query: { type: "string", description: "Szabad szöveges keresés (cég név, projekt cím, lead összefoglaló stb.)." } }, required: ["entity_type", "query"] } } },
    run: find_entity,
  },
  open_route: {
    def: { type: "function", function: { name: "open_route", description: "Megnyit egy listanézetet a CRM-ben (pl. /followups, /quotes, /leads). Használd, ha a user általános listát kér (pl. 'mutasd a lejárt utókövetésokat' → /followups).", parameters: { type: "object", properties: { route: { type: "string", enum: ["/dashboard", "/customers", "/companies", "/contacts", "/leads", "/projects", "/quotes", "/followups", "/tasks", "/meetings", "/calls", "/emails", "/documents", "/ai-assistant"] }, label: { type: "string", description: "Felhasználónak megjelenő rövid címke" } }, required: ["route"] } } },
    run: open_route,
  },
  // SALES — napi munka
  daily_call_list: {
    def: { type: "function", function: { name: "daily_call_list", description: "Prioritás szerint rangsorolt ügyféllista, kit kell ma hívni. Pontozás: lejárt utókövetés, nyitott ajánlat, inaktivitás, friss lead.", parameters: { type: "object", properties: {} } } },
    run: daily_call_list,
  },
  quote_followup_assistant: {
    def: { type: "function", function: { name: "quote_followup_assistant", description: "Nyitott ajánlatokra javasol konkrét utókövetés típust (call/email/task/wait) annak alapján, mennyi ideje küldtük és volt-e válasz.", parameters: { type: "object", properties: {} } } },
    run: quote_followup_assistant,
  },
  // SALES — operátor (PROPOSAL, jóváhagyás kell)
  propose_create_followup: {
    def: { type: "function", function: { name: "propose_create_followup", description: "Utókövetés rekord JAVASLATA. NEM hozza létre — jóváhagyás után a felület inserteli. Esedékesség ISO dátum vagy óraszám (pl. '2026-06-19T09:00' vagy óra-eltolás).", parameters: { type: "object", properties: { due_date: { type: "string", description: "Esedékesség, ISO formátumban (pl. 2026-06-19T09:00:00). KÖTELEZŐ." }, followup_type: { type: "string", enum: ["call", "email", "meeting", "other"] }, result: { type: "string", description: "Megjegyzés / cél" }, project_id: { type: "string" }, contact_id: { type: "string" }, company_id: { type: "string" }, quote_id: { type: "string" } }, required: ["due_date"] } } },
    run: propose_create_followup,
  },
  propose_create_task: {
    def: { type: "function", function: { name: "propose_create_task", description: "Feladat (task) rekord JAVASLATA. NEM hozza létre — jóváhagyás után az insert történik.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, project_id: { type: "string" }, due_date: { type: "string", description: "ISO határidő" }, priority: { type: "string" }, status: { type: "string" } }, required: ["title"] } } },
    run: propose_create_task,
  },
  propose_create_contact: {
    def: { type: "function", function: { name: "propose_create_contact", description: "Új kapcsolattartó JAVASLATA. Jóváhagyás után jön létre.", parameters: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, company_id: { type: "string" }, role: { type: "string" }, notes: { type: "string" } }, required: ["name"] } } },
    run: propose_create_contact,
  },
  propose_create_lead: {
    def: { type: "function", function: { name: "propose_create_lead", description: "Új lead JAVASLATA. Jóváhagyás után jön létre.", parameters: { type: "object", properties: { summary: { type: "string" }, source: { type: "string" }, project_type: { type: "string" }, status: { type: "string" }, company_id: { type: "string" }, contact_id: { type: "string" } }, required: ["summary"] } } },
    run: propose_create_lead,
  },
};

export const AGENT_TOOL_NAMES: Record<AgentId, string[]> = {
  crm:   ["find_entity", "open_route", "project_summary", "company_summary", "contact_summary", "email_thread_read"],
  sales: [
    "find_entity", "open_route",
    "daily_call_list", "quote_followup_assistant",
    "create_followup_suggestion", "lead_priority_report", "quote_risk_report",
    "propose_create_followup", "propose_create_task", "propose_create_contact", "propose_create_lead",
    "project_summary", "company_summary", "email_thread_read",
  ],
  pm:    ["find_entity", "open_route", "project_risk_report", "deadline_report", "missing_documents_report", "propose_create_task", "project_summary", "email_thread_read"],
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