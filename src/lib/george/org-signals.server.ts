/**
 * George szervezeti jelzések — szerveroldali olvasás a HÍVÓ (Tulajdonos) RLS-kliensével.
 * Csak SELECT és az `is_owner_role` jogosultság-ellenőrzés; admin kliens, írás, RPC-mutáció,
 * AI-hívás nincs. Minden forrás korlátos; ha a teljes darabszám nagyobb a beolvasottnál,
 * a forrás „részleges”-ként jelenik meg, nem csendben levágva.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgInputs } from "./org-signals";

export type OrgSourceState = { key: string; label: string; state: "ok" | "partial" | "error"; rows: number; total: number | null };
export type OrgLoad = { inputs: OrgInputs; sources: OrgSourceState[]; collectorEnabled: boolean | null };

export const SOURCE_LIMIT = 2000;
const CHUNK = 100;
type Res = { data: unknown[] | null; error: unknown; count?: number | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

export class OrgAccessError extends Error {}

export async function assertOwner(supabase: SupabaseClient, userId: string) {
  const owner = await supabase.rpc("is_owner_role", { _auth_user: userId });
  if (owner.error) throw new OrgAccessError("A jogosultság nem ellenőrizhető.");
  if (owner.data !== true) throw new OrgAccessError("George szervezeti jelzéseit csak a Tulajdonos láthatja.");
}

export async function loadOrgSignals(supabase: SupabaseClient, now: Date = new Date()): Promise<OrgLoad> {
  const sources: OrgSourceState[] = [];
  const nowIso = now.toISOString();
  const since14 = new Date(now.getTime() - 14 * 86400_000).toISOString();
  const since30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const db = supabase as Q;

  async function read<T>(key: string, label: string, q: Q): Promise<T[]> {
    const r = (await q.range(0, SOURCE_LIMIT - 1)) as Res;
    if (r.error) { sources.push({ key, label, state: "error", rows: 0, total: null }); return []; }
    const rows = (r.data ?? []) as T[];
    const total = typeof r.count === "number" ? r.count : rows.length;
    sources.push({ key, label, state: total > rows.length ? "partial" : "ok", rows: rows.length, total });
    return rows;
  }
  /** Azonosítólistára szűrt olvasás darabokban (URL-hossz), egy forrásállapottal. */
  async function readIn<T>(key: string, label: string, ids: string[], make: (chunk: string[]) => Q): Promise<T[]> {
    const out: T[] = [];
    let failed = false;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const r = (await make(ids.slice(i, i + CHUNK)).range(0, SOURCE_LIMIT - 1)) as Res;
      if (r.error) { failed = true; break; }
      out.push(...((r.data ?? []) as T[]));
    }
    sources.push({ key, label, state: failed ? "error" : "ok", rows: out.length, total: failed ? null : out.length });
    return failed ? [] : out;
  }

  const [leads, projects, tasks, followups, sentQuotes, issues, signals, notices, importRows, candidates, people, documentErrors, docsReview] = await Promise.all([
    read<OrgInputs["leads"][number]>("leads", "Sales-ügyek", db.from("leads").select("id,status,assigned_to,next_step_type,next_step_due_at,company_id,created_at", { count: "exact" }).neq("status", "lost").order("id")),
    read<OrgInputs["projects"][number]>("projects", "Projektek", db.from("projects").select("id,title,status,lead_id,company_id,project_manager_user_id,handoff_payload,handoff_at,start_date,deadline,address", { count: "exact" }).not("status", "in", "(lezart,felfuggesztve)").order("id")),
    read<OrgInputs["tasks"][number]>("tasks", "Feladatok", db.from("tasks").select("id,title,status,due_date,project_id,assigned_user", { count: "exact" }).order("id")),
    read<OrgInputs["followups"][number]>("followups", "Lejárt utánkövetések", db.from("followups").select("id,lead_id,project_id,due_date,followup_type,assigned_to", { count: "exact" }).eq("completed", false).lt("due_date", nowIso).order("id")),
    read<OrgInputs["sentQuotes"][number]>("quotes", "Kiküldöttnek jelölt ajánlatok", db.from("quotes").select("id,status,lead_id,project_id,title", { count: "exact" }).eq("status", "sent").order("id")),
    read<OrgInputs["issues"][number]>("issues", "Dolgozói bejelentések", db.from("issue_reports").select("id,category,status,page_path,reporter_role,created_at,updated_at,technical_code,ai_analyzed_at,reporter_verdict", { count: "exact" }).or(`status.not.in.(closed,usage_question),updated_at.gte.${since30}`).order("created_at")),
    read<OrgInputs["signals"][number]>("signals", "Automatikus jelzéstábla", db.from("ai_review_signals").select("id,signal_key,domain,agent,severity,title,source_table,source_id,occurrences,first_seen_at,last_seen_at,review_status,issue_id", { count: "exact" }).or(`review_status.neq.resolved,resolved_at.gte.${since14}`).order("signal_key")),
    read<OrgInputs["notices"][number]>("notices", "Döntést igénylő értesítések", db.from("crm_notifications").select("id,title,severity,requires_decision,link_path,source_table,source_id,last_occurred_at,occurrences", { count: "exact" }).is("resolved_at", null).or("severity.eq.critical,requires_decision.eq.true").order("id")),
    read<{ kind: string }>("imports", "Import-ellenőrzési tételek", db.from("import_review_items").select("kind", { count: "exact" }).eq("status", "open").order("id")),
    read<{ id: string }>("candidates", "Projektjelöltek", db.from("project_candidates").select("id", { count: "exact" }).eq("review_status", "review").order("id")),
    read<{ id: string | null; auth_user_id: string | null; full_name: string | null }>("people", "Munkatársnevek", db.from("users_profile_lookup").select("id,auth_user_id,full_name", { count: "exact" }).order("id")),
    read<OrgInputs["documentErrors"][number]>("documents", "Dokumentumfeldolgozási hibák", db.from("knowledge_documents").select("id,title,processing_status,error_code,source_table", { count: "exact" }).is("superseded_at", null).eq("processing_status", "error").order("id")),
    read<{ id: string }>("documents_review", "Ellenőrzést igénylő dokumentumok", db.from("knowledge_documents").select("id", { count: "exact" }).is("superseded_at", null).eq("processing_status", "needs_review").order("id")),
  ]);

  const projectIds = projects.map((p) => p.id).sort();
  const sentIds = sentQuotes.map((q) => q.id).sort();
  const issueIds = issues.map((i) => i.id).sort();
  const companyIds = [...new Set([...leads.map((l) => l.company_id), ...projects.map((p) => p.company_id)].filter((x): x is string => !!x))].sort();
  const [projectQuoteIds, projectContacts, proven, findings, companyRows, cfg] = await Promise.all([
    readIn<{ project_id: string }>("project_quotes", "Projekthez kötött ajánlatok", projectIds, (c) => db.from("quotes").select("project_id").in("project_id", c).order("id")),
    readIn<{ project_id: string }>("project_contacts", "Projekt-kapcsolattartók", projectIds, (c) => db.from("project_contacts").select("project_id").in("project_id", c).order("id")),
    readIn<{ quote_id: string }>("quote_sends", "Küldési bizonyítékok", sentIds, (c) => db.from("quote_sends").select("quote_id").eq("status", "sent").in("quote_id", c).order("id")),
    readIn<OrgInputs["findings"][number]>("findings", "George-vizsgálati eredmények", issueIds, (c) => db.from("issue_report_findings").select("issue_id,verified_source_count,unverified_claim_count").eq("contribution", "coordinator").in("issue_id", c).order("id")),
    readIn<{ id: string; name: string }>("companies", "Cégnevek", companyIds, (c) => db.from("companies").select("id,name").in("id", c).order("id")),
    db.from("ai_review_config").select("enabled").eq("id", 1).maybeSingle() as Promise<{ data: { enabled: boolean } | null; error: unknown }>,
  ]);

  const peopleMap: Record<string, string> = {};
  for (const p of people) if (p.full_name) { if (p.auth_user_id) peopleMap[p.auth_user_id] = p.full_name; if (p.id) peopleMap[p.id] = p.full_name; }
  const companies: Record<string, string> = {};
  for (const c of companyRows) companies[c.id] = c.name;
  const kinds = new Map<string, number>();
  for (const r of importRows) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  const imports = [...kinds.entries()].map(([kind, count]) => ({ kind, count }));
  const candidateTotal = sources.find((s) => s.key === "candidates")?.total ?? candidates.length;
  if (candidateTotal > 0) imports.push({ kind: "project_candidate", count: candidateTotal });

  return {
    inputs: {
      now: nowIso, leads, projects, tasks, followups, sentQuotes,
      provenQuoteIds: proven.map((p) => p.quote_id), projectQuoteIds, projectContacts,
      issues, findings, signals, notices, imports, people: peopleMap, companies,
      documentErrors, documentsNeedReview: sources.find((s) => s.key === "documents_review")?.total ?? docsReview.length,
    },
    sources,
    collectorEnabled: cfg.error ? null : cfg.data?.enabled ?? null,
  };
}
