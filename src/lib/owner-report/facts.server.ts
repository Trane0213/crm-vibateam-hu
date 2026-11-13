import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { safeLink } from "@/lib/notifications/model";
import { ISSUE_CATEGORY, ISSUE_STATUS } from "@/lib/issue-reports-model";
import { bounded, reportPeriod, type FactItem, type FactSection, type OwnerFacts, type ReportKind } from "./model";

type Db = SupabaseClient<Database>;
const OPEN_LEAD = ["new", "follow_up", "quote_prep"];
const cat = (c: string) => ISSUE_CATEGORY[c as keyof typeof ISSUE_CATEGORY] ?? c;
const ist = (s: string) => ISSUE_STATUS[s as keyof typeof ISSUE_STATUS] ?? s;

function must<T>(r: { data: T | null; error: unknown; count?: number | null }, what: string) {
  if (r.error) throw new Error(`A jelentés tényei nem tölthetők be (${what}).`);
  return { data: (r.data ?? []) as T, count: r.count ?? 0 };
}
const section = (key: string, title: string, total: number, items: FactItem[], note?: string): FactSection => ({ key, title, total, items: bounded(items), ...(note ? { note } : {}) });

/**
 * Determinisztikus tények a Tulajdonos saját jogosultságával (RLS). Kivétel: a kliens elől elzárt
 * webes ajánlatkérések — ezekből csak azonosító, űrlaptípus és dátum kerül be, személyes adat nem.
 */
export async function buildOwnerFacts(supabase: Db, admin: Db, kind: ReportKind, now = new Date()): Promise<OwnerFacts> {
  const period = reportPeriod(kind, now);
  const { start } = period;
  const nowIso = now.toISOString();
  const sections: FactSection[] = [];

  const immediate = must(await supabase.from("crm_notifications").select("id,title,link_path,occurrences,last_occurred_at,severity,requires_decision", { count: "exact" }).is("resolved_at", null).or("severity.eq.critical,requires_decision.eq.true").order("last_occurred_at", { ascending: false }).limit(25), "azonnali");
  sections.push(section("immediate", "Azonnali figyelem / döntést igényel", immediate.count, immediate.data.map((n) => ({ id: n.id, type: "notification", label: n.title, at: n.last_occurred_at, link: safeLink(n.link_path), extra: { severity: n.severity, decision: n.requires_decision, occurrences: n.occurrences } }))));

  const newIssues = must(await supabase.from("issue_reports").select("id,category,status,page_path,technical_code,created_at,reporter_role", { count: "exact" }).gte("created_at", start).order("created_at", { ascending: false }).limit(25), "új bejelentések");
  sections.push(section("new_issues", "Új bejelentések és AI-hibajegyek", newIssues.count, newIssues.data.map((i) => ({ id: i.id, type: "issue", label: `${i.technical_code === "AI_REVIEW" ? "AI-felülvizsgálat" : cat(i.category)} · ${i.page_path} · ${ist(i.status)}`, at: i.created_at, link: "/help", extra: { reporter_role: i.reporter_role } }))));

  const openIssues = must(await supabase.from("issue_reports").select("id,category,status,page_path,created_at", { count: "exact" }).not("status", "in", "(closed,usage_question)").order("created_at").limit(25), "nyitott bejelentések");
  sections.push(section("open_issues", "Nyitott bejelentések (legrégebbiek elöl)", openIssues.count, openIssues.data.map((i) => ({ id: i.id, type: "issue", label: `${cat(i.category)} · ${i.page_path} · ${ist(i.status)}`, at: i.created_at, link: "/help" }))));

  const won = must(await supabase.from("leads").select("id,won_at", { count: "exact" }).gte("won_at", start).limit(25), "megnyert");
  const lost = must(await supabase.from("leads").select("id,lost_at,lost_reason", { count: "exact" }).gte("lost_at", start).limit(25), "elveszett");
  const sent = must(await supabase.from("quote_sends").select("id,quote_id,sent_at", { count: "exact" }).eq("status", "sent").gte("sent_at", start).limit(25), "kiküldött ajánlatok");
  const webNew = must(await admin.from("quote_requests").select("id,form_type,created_at", { count: "exact" }).gte("created_at", start).limit(25), "webes ajánlatkérések");
  sections.push(section("business", "Fontos üzleti események", won.count + lost.count + sent.count + webNew.count, [
    ...won.data.map((l) => ({ id: l.id, type: "lead", label: "Megnyert ügy", at: l.won_at, link: `/leads/${l.id}` })),
    ...lost.data.map((l) => ({ id: l.id, type: "lead", label: `Elveszett ügy${l.lost_reason ? ` (${l.lost_reason})` : ""}`, at: l.lost_at, link: `/leads/${l.id}` })),
    ...sent.data.map((s) => ({ id: s.id, type: "quote_send", label: "Igazoltan kiküldött ajánlat", at: s.sent_at, link: s.quote_id ? `/quotes/${s.quote_id}` : null, extra: { quote_id: s.quote_id } })),
    ...webNew.data.map((r) => ({ id: r.id, type: "web_request", label: `Új webes ajánlatkérés (${r.form_type ?? "űrlap"})`, at: r.created_at, link: "/web-quote-requests" })),
  ], `Megnyert ${won.count}, elveszett ${lost.count}, igazoltan kiküldött ajánlat ${sent.count}, új webes ajánlatkérés ${webNew.count}.`));

  const docs = must(await supabase.from("knowledge_documents").select("id,title,processing_status,error_code,processed_at", { count: "exact" }).is("superseded_at", null).in("processing_status", ["error", "needs_review"]).order("processed_at", { ascending: false }).limit(25), "dokumentumok");
  sections.push(section("processing", "Dokumentumfeldolgozási problémák (jelenleg nyitott)", docs.count, docs.data.map((d) => ({ id: d.id, type: "document", label: `${d.title ?? "Dokumentum"} · ${d.processing_status === "error" ? "Hibás" : "Ellenőrzést igényel"}${d.error_code ? ` · ${d.error_code}` : ""}`, at: d.processed_at, link: "/settings/knowledge-graph" }))));

  const notes = must(await supabase.from("crm_notifications").select("id,title,category,severity,link_path,created_at,occurrences", { count: "exact" }).gte("last_occurred_at", start).order("last_occurred_at", { ascending: false }).limit(25), "értesítések");
  sections.push(section("notifications", "Értesítések az időszakban", notes.count, notes.data.map((n) => ({ id: n.id, type: "notification", label: n.title, at: n.created_at, link: safeLink(n.link_path), extra: { category: n.category, severity: n.severity, occurrences: n.occurrences } }))));

  const overLeads = must(await supabase.from("leads").select("id,status,next_step_type,next_step_due_at", { count: "exact" }).in("status", OPEN_LEAD).lt("next_step_due_at", nowIso).order("next_step_due_at").limit(25), "lejárt lépések");
  const overFollow = must(await supabase.from("followups").select("id,followup_type,due_date,lead_id", { count: "exact" }).eq("completed", false).lt("due_date", nowIso).order("due_date").limit(25), "lejárt utánkövetések");
  const overTasks = must(await supabase.from("tasks").select("id,title,due_date,project_id", { count: "exact" }).neq("status", "done").lt("due_date", nowIso).order("due_date").limit(25), "lejárt feladatok");
  const webWait = must(await admin.from("quote_requests").select("id,form_type,created_at", { count: "exact" }).is("intake_at", null).lt("created_at", new Date(now.getTime() - 86400_000).toISOString()).order("created_at").limit(25), "feldolgozatlan webes kérések");
  sections.push(section("overdue", "Elmaradt teendők (jelenleg)", overLeads.count + overFollow.count + overTasks.count + webWait.count, [
    ...overLeads.data.map((l) => ({ id: l.id, type: "lead", label: `Lejárt következő lépés (${l.next_step_type ?? "—"})`, at: l.next_step_due_at, link: `/leads/${l.id}` })),
    ...overFollow.data.map((f) => ({ id: f.id, type: "followup", label: `Lejárt utánkövetés (${f.followup_type ?? "—"})`, at: f.due_date, link: f.lead_id ? `/leads/${f.lead_id}` : null, extra: { lead_id: f.lead_id } })),
    ...overTasks.data.map((t) => ({ id: t.id, type: "task", label: `Lejárt feladat: ${t.title ?? ""}`.slice(0, 200), at: t.due_date, link: t.project_id ? `/projects/${t.project_id}` : "/tasks", extra: { project_id: t.project_id } })),
    ...webWait.data.map((r) => ({ id: r.id, type: "web_request", label: `Feldolgozatlan webes ajánlatkérés (${r.form_type ?? "űrlap"})`, at: r.created_at, link: "/web-quote-requests" })),
  ], `Lejárt következő lépés ${overLeads.count}, lejárt utánkövetés ${overFollow.count}, lejárt feladat ${overTasks.count}, 24 óránál régebbi feldolgozatlan webes kérés ${webWait.count}.`));

  const signals = must(await supabase.from("ai_review_signals").select("id,title,agent,severity,review_status,occurrences,last_seen_at,first_seen_at,issue_id", { count: "exact" }).in("review_status", ["pending", "in_review", "failed"]).neq("severity", "info").order("last_seen_at", { ascending: false }).limit(25), "AI-jelzések");
  sections.push(section("ai_signals", "Nyitott automatikus AI-jelzések (gyanú, nem igazolt hiba)", signals.count, signals.data.map((s) => ({ id: s.id, type: "ai_signal", label: `${s.title} · ${s.agent}`, at: s.last_seen_at, link: "/settings/ai-review", extra: { severity: s.severity, occurrences: s.occurrences, issue_id: s.issue_id } }))));

  const runs = must(await admin.from("agent_runs").select("id,agent_id,model,status,prompt_tokens,completion_tokens,error_message", { count: "exact" }).gte("started_at", start).range(0, 4999), "AI-futások");
  const per = new Map<string, { runs: number; errors: number; tokens: number }>();
  for (const r of runs.data) { const k = r.model || "ismeretlen"; const m = per.get(k) ?? { runs: 0, errors: 0, tokens: 0 }; m.runs++; if (r.status === "error") m.errors++; m.tokens += (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0); per.set(k, m); }
  sections.push(section("ai_usage", "AI-felhasználás modellenként (agent_runs napló)", runs.count, [...per.entries()].map(([model, m]) => ({ id: `model:${model}`, type: "model", label: `${model}: ${m.runs} futás, ${m.errors} hiba, ${m.tokens} token`, extra: { runs: m.runs, errors: m.errors, tokens: m.tokens } }))));

  if (kind === "weekly") {
    const rec = must(await supabase.from("ai_review_signals").select("id,title,agent,severity,occurrences,first_seen_at,last_seen_at,review_status", { count: "exact" }).neq("review_status", "resolved").gte("last_seen_at", start).gte("occurrences", 3).order("occurrences", { ascending: false }).limit(25), "ismétlődő jelzések");
    const recN = must(await supabase.from("crm_notifications").select("id,title,occurrences,last_occurred_at,link_path", { count: "exact" }).gte("last_occurred_at", start).gt("occurrences", 1).order("occurrences", { ascending: false }).limit(25), "ismétlődő értesítések");
    sections.push(section("recurring", "Ismétlődő problémák", rec.count + recN.count, [
      ...rec.data.map((s) => ({ id: s.id, type: "ai_signal", label: `${s.title} · ${s.agent} · ${s.occurrences}× észlelve`, at: s.last_seen_at, link: "/settings/ai-review", extra: { occurrences: s.occurrences, severity: s.severity } })),
      ...recN.data.map((n) => ({ id: n.id, type: "notification", label: `${n.title} · ${n.occurrences}×`, at: n.last_occurred_at, link: safeLink(n.link_path), extra: { occurrences: n.occurrences } })),
    ]));
    const aiRec = must(await supabase.from("issue_report_findings").select("id,issue_id,agent_id,summary,recommended_actions,verified_source_count,unverified_claim_count,created_at", { count: "exact" }).eq("contribution", "coordinator").gte("created_at", start).order("created_at", { ascending: false }).limit(25), "AI-javaslatok");
    sections.push(section("ai_recommendations", "AI-vizsgálatok javaslatai (George-összegzések)", aiRec.count, aiRec.data.map((f) => {
      const actions = Array.isArray(f.recommended_actions) ? (f.recommended_actions as { action?: string }[]).map((a) => a?.action).filter(Boolean).join(" | ") : "";
      return { id: f.id, type: "finding", label: `${(f.summary ?? "").slice(0, 200)}${actions ? ` — Javaslat: ${actions.slice(0, 300)}` : ""}`, at: f.created_at, link: "/help", extra: { issue_id: f.issue_id, verified_sources: f.verified_source_count, unverified_claims: f.unverified_claim_count } };
    })));
    const staff = must(await supabase.from("issue_reports").select("id,category,page_path,description,reporter_role,created_at,status,technical_code", { count: "exact" }).in("category", ["feature", "ux"]).gte("created_at", start).order("created_at", { ascending: false }).limit(25), "dolgozói javaslatok");
    const staffRows = staff.data.filter((i) => i.technical_code !== "AI_REVIEW");
    sections.push(section("staff_suggestions", "Dolgozói javaslatok (UX / fejlesztési igény)", staffRows.length, staffRows.map((i) => ({ id: i.id, type: "issue", label: `${cat(i.category)} · ${i.page_path} · ${i.description.slice(0, 220)}`, at: i.created_at, link: "/help", extra: { reporter_role: i.reporter_role, status: i.status } }))));
    const notRes = must(await supabase.from("issue_reports").select("id,page_path,reporter_verdict_at,status", { count: "exact" }).eq("reporter_verdict", "not_resolved").gte("reporter_verdict_at", start).limit(25), "nem megoldott");
    sections.push(section("not_resolved", "A bejelentő szerint nem oldódott meg", notRes.count, notRes.data.map((i) => ({ id: i.id, type: "issue", label: `${i.page_path} · ${ist(i.status)}`, at: i.reporter_verdict_at, link: "/help" }))));
  }
  return { kind, period, sections };
}
