/**
 * Tulajdonosi (Owner) napi munkafelület — kizárólag megjelenítési modell.
 *
 * Bemenet: a meglévő, AI nélküli tulajdonosi tények (`buildOwnerFacts`, napi
 * nézet), az aktív projektek és nyitott feladatok, a Szerződés / elfogadott /
 * küldésre kész ajánlatok, valamint a saját, jóváhagyásra váró AI-műveletek —
 * mind a Tulajdonos saját jogosultságával (RLS) olvasva.
 *
 * Kimenet: egy prioritásos teendőlista forrással és valós CRM-hivatkozással.
 * Nem ír adatot, nem dönt, nem hagy jóvá. Pénzügyi (számla, befizetés, bank,
 * Billingo) adatkapcsolat NINCS — ezt a modell kimondja, nem becsül.
 */
import type { FactItem, FactSection } from "@/lib/owner-report/model";
import { safeLink } from "@/lib/notifications/model";
import { budapestYmd, classifyTask, isActiveProject, projectManagerOf, type PmProject, type PmTask } from "@/lib/pm/pm-day-flow";
import { PROJECT_STATUS_LABEL } from "@/lib/viba-constants";
import { contractPrepSummary, contractWarningsFromPrep, type ContractQuote } from "@/lib/contract/contract-prep";

/** Nincs számla-/befizetés-/bank-/Billingo-adat a CRM-ben (2026-11-14). */
export const FINANCE_DATA_CONNECTED = false as const;
/** A CRM-ben nincs külön szerződés-jóváhagyási lépés és elektronikus aláírás. */
export const CONTRACT_APPROVAL_AVAILABLE = false as const;

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------
export const OWNER_LANES = ["decide", "deals", "projects", "overdue", "team", "ai"] as const;
export type OwnerLane = (typeof OWNER_LANES)[number];
export const OWNER_LANE_LABEL: Record<OwnerLane, string> = {
  decide: "Azonnali döntés",
  deals: "Ajánlat és szerződés",
  projects: "Kritikus projektek",
  overdue: "Elmaradt teendők",
  team: "Dolgozói jelzések",
  ai: "George és AI-jelzések",
};
/** Rövid címke a munkafolyamat-sávhoz (hat elem egy sorban is olvasható legyen). */
export const OWNER_LANE_SHORT: Record<OwnerLane, string> = {
  decide: "Döntés", deals: "Ajánlat, szerződés", projects: "Projektek", overdue: "Elmaradt", team: "Dolgozók", ai: "AI-jelzések",
};
export const OWNER_LANE_HINT: Record<OwnerLane, string> = {
  decide: "Kritikus / döntést igénylő értesítés, jóváhagyásra váró AI-művelet",
  deals: "Szerződés szakasz, elfogadott és küldésre kész ajánlat",
  projects: "Lejárt vagy akadályozott feladat, lejárt határidő, nincs projektvezető",
  overdue: "Lejárt következő lépés, utánkövetés, feldolgozatlan webes kérés",
  team: "Munkatársak hibajegyei és bejelentései",
  ai: "Automatikus AI-jelzés (gyanú) és dokumentumfeldolgozási hiba",
};
export function ownerLaneFromSearch(v: unknown): OwnerLane | undefined {
  return typeof v === "string" && (OWNER_LANES as readonly string[]).includes(v) ? (v as OwnerLane) : undefined;
}

export type OwnerItemKind =
  | "notification" | "ai_approval" | "contract" | "accepted_quote" | "ready_quote"
  | "critical_project" | "overdue_lead" | "overdue_followup" | "overdue_task" | "web_request"
  | "issue" | "ai_signal" | "doc_problem";
/** Prioritási sorrend: kisebb index = előbb. */
export const OWNER_KIND_ORDER: OwnerItemKind[] = [
  "notification", "ai_approval", "contract", "accepted_quote", "critical_project",
  "overdue_lead", "overdue_followup", "overdue_task", "web_request", "ready_quote",
  "issue", "ai_signal", "doc_problem",
];
const LANE_OF: Record<OwnerItemKind, OwnerLane> = {
  notification: "decide", ai_approval: "decide",
  contract: "deals", accepted_quote: "deals", ready_quote: "deals",
  critical_project: "projects",
  overdue_lead: "overdue", overdue_followup: "overdue", overdue_task: "overdue", web_request: "overdue",
  issue: "team", ai_signal: "ai", doc_problem: "ai",
};

export type OwnerLink = { to: string; search?: Record<string, string> };
export type OwnerItem = {
  key: string;
  kind: OwnerItemKind;
  lane: OwnerLane;
  title: string;
  detail: string;
  /** Forrás megnevezése (tábla/funkció) — mindig látszik. */
  source: string;
  sourceId: string;
  at: string | null;
  who: string | null;
  link: OwnerLink | null;
  button: string;
  warnings: string[];
  severity: "critical" | "warning" | "info";
};

export type OwnerProject = PmProject;
export type OwnerTask = PmTask;
export type OwnerLead = {
  id: string; status: string | null; summary: string | null; company_id: string | null; contact_id: string | null;
  assigned_to: string | null; next_step_due_at: string | null; pipeline_entered_at: string | null;
};
export type OwnerQuote = {
  id: string; lead_id: string | null; project_id?: string | null; title: string | null; status: string | null;
  is_current: boolean | null; net?: number | null; updated_at?: string | null;
};
export type OwnerApproval = { id: string; tool_name: string | null; agent_id: string | null; approval_expires_at: string | null; created_at: string | null };

export type OwnerInputs = {
  facts?: { sections: FactSection[] } | null;
  projects?: OwnerProject[] | null;
  tasks?: OwnerTask[] | null;
  leads?: OwnerLead[] | null;
  quotes?: OwnerQuote[] | null;
  approvals?: OwnerApproval[] | null;
  companyName?: (id: string | null | undefined) => string | null;
  personName?: (authId: string | null | undefined) => string | null;
};

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------
/** Csak belső CRM-útvonal; a lekérdezés-részt a router `search` objektumává bontja. */
export function parseInternalLink(path: string | null | undefined): OwnerLink | null {
  const safe = safeLink(path ?? null);
  if (!safe) return null;
  const [to, query] = safe.split("?", 2);
  if (!to) return null;
  if (!query) return { to };
  const search: Record<string, string> = {};
  for (const part of query.split("&")) {
    const [k, v = ""] = part.split("=", 2);
    if (k && /^[A-Za-z_]+$/.test(k)) search[k] = decodeURIComponent(v);
  }
  return Object.keys(search).length ? { to, search } : { to };
}

/** Pipeline-ügy a Pipeline adatlapra, előkészítés a Leadek munkafelületre (ugyanaz, mint a Sales napi lista). */
export function leadLink(lead: Pick<OwnerLead, "id" | "pipeline_entered_at" | "status">): OwnerLink {
  return lead.pipeline_entered_at && lead.status !== "won" && lead.status !== "lost"
    ? { to: "/sales/leads", search: { lead: lead.id } }
    : { to: "/leads", search: { lead: lead.id } };
}

const shortDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
};

/** Csak dátum (a projekt határideje nap pontosságú). */
const dayLabel = (iso: string) => new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "short", day: "numeric" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

const sectionItems = (facts: OwnerInputs["facts"], key: string): FactItem[] =>
  facts?.sections.find((s) => s.key === key)?.items ?? [];
export const sectionTotal = (facts: OwnerInputs["facts"], key: string): number | null => {
  const s = facts?.sections.find((x) => x.key === key);
  return s ? s.total : null;
};

// ---------------------------------------------------------------------------
// Kritikus projektek
// ---------------------------------------------------------------------------
export type ProjectRisk = { project: OwnerProject; overdue: number; blocked: number; deadlinePassed: boolean; noPm: boolean; handover: boolean; reasons: string[]; tab: "tasks" | "handover" | "overview" };
export function projectRisks(projects: OwnerProject[], tasks: OwnerTask[], now: Date = new Date()): ProjectRisk[] {
  const today = budapestYmd(now);
  const out: ProjectRisk[] = [];
  for (const p of projects) {
    if (!isActiveProject(p)) continue;
    const own = tasks.filter((t) => t.project_id === p.id);
    let overdue = 0, blocked = 0;
    for (const t of own) { const f = classifyTask(t, now); if (f.overdue) overdue++; if (f.blocked) blocked++; }
    const deadlinePassed = !!p.deadline && budapestYmd(p.deadline) < today;
    const noPm = !projectManagerOf(p);
    const handover = p.status === "atadas";
    const reasons = [
      overdue ? `${overdue} lejárt feladat` : null,
      blocked ? `${blocked} akadályozott feladat` : null,
      deadlinePassed ? "a projekt határideje lejárt" : null,
      noPm ? "nincs kijelölt projektvezető" : null,
      handover ? "Sales-átadás átvétele folyamatban (Átadás / előkészítés)" : null,
    ].filter((x): x is string => !!x);
    if (!reasons.length) continue;
    out.push({ project: p, overdue, blocked, deadlinePassed, noPm, handover, reasons, tab: overdue || blocked ? "tasks" : handover || noPm ? "handover" : "overview" });
  }
  const score = (r: ProjectRisk) => r.overdue * 4 + r.blocked * 3 + (r.deadlinePassed ? 3 : 0) + (r.noPm ? 2 : 0) + (r.handover ? 1 : 0);
  return out.sort((a, b) => score(b) - score(a) || (a.project.title ?? "").localeCompare(b.project.title ?? "", "hu"));
}

// ---------------------------------------------------------------------------
// Szerződés-előkészítés (csak meglévő adat; nincs jóváhagyási adatmodell)
// ---------------------------------------------------------------------------
export function contractPrepWarnings(lead: OwnerLead, quotes: OwnerQuote[]): string[] {
  // Közös szerződés-előkészítési modell (contract-prep.ts); itt csak a lead/ajánlat
  // szintű tételek ismertek — cég/kapcsolattartó rekord nincs betöltve, ezért csak a hiányzó ID számít hiánynak.
  const own: ContractQuote[] = quotes.filter((q) => q.lead_id === lead.id).map((q) => ({
    id: q.id, title: q.title, status: q.status, sent_at: null, is_current: q.is_current, valid_until: null, site_address: null,
    total_amount: q.net ?? null, manual_net_amount: null, template_terms: null, version: null, alternative_key: null,
  }));
  return contractWarningsFromPrep(contractPrepSummary({
    lead: { id: lead.id, status: lead.status, company_id: lead.company_id, contact_id: lead.contact_id, assigned_to: lead.assigned_to },
    company: undefined, contact: undefined, quotes: own, termsDocs: undefined, project: undefined, contractDocs: undefined,
  }));
}

// ---------------------------------------------------------------------------
// Teendőlista
// ---------------------------------------------------------------------------
export function ownerItems(input: OwnerInputs, now: Date = new Date()): OwnerItem[] {
  const company = input.companyName ?? (() => null);
  const person = input.personName ?? (() => null);
  const items: OwnerItem[] = [];
  const nowMs = now.getTime();

  // 1. Kritikus / döntést igénylő értesítések
  for (const n of sectionItems(input.facts, "immediate")) {
    items.push({
      key: `n:${n.id}`, kind: "notification", lane: "decide", title: n.label,
      detail: `${n.extra?.decision ? "Döntést igényel" : "Kritikus jelzés"}${Number(n.extra?.occurrences ?? 1) > 1 ? ` · ${n.extra?.occurrences}× észlelve` : ""}`,
      source: "Értesítési központ", sourceId: n.id, at: n.at ?? null, who: null,
      link: parseInternalLink(n.link) ?? { to: "/notifications" }, button: "Megnyitás", warnings: [],
      severity: n.extra?.severity === "critical" ? "critical" : "warning",
    });
  }

  // 2. Saját, jóváhagyásra váró AI-műveletek (le nem járt)
  for (const a of input.approvals ?? []) {
    if (a.approval_expires_at && Date.parse(a.approval_expires_at) <= nowMs) continue;
    items.push({
      key: `a:${a.id}`, kind: "ai_approval", lane: "decide",
      title: `AI-művelet a döntésedre vár${a.tool_name ? `: ${a.tool_name}` : ""}`,
      detail: `Csak a jóváhagyási kártyán, abban a beszélgetésben dönthető el, ahol a kérés indult.${a.approval_expires_at ? ` Lejár: ${shortDate(a.approval_expires_at)}.` : ""}`,
      source: "AI jóváhagyás (saját futás)", sourceId: a.id, at: a.created_at, who: null,
      link: { to: "/ai-assistant" }, button: "AI-asszisztens", warnings: [], severity: "warning",
    });
  }

  // 3. Szerződés szakasz — tulajdonosi döntés előkészítése
  const leads = input.leads ?? [];
  const quotes = input.quotes ?? [];
  const contractIds = new Set<string>();
  for (const l of leads.filter((x) => x.status === "contract")) {
    contractIds.add(l.id);
    const name = company(l.company_id) ?? l.summary ?? "Ügy";
    items.push({
      key: `c:${l.id}`, kind: "contract", lane: "deals", title: `Szerződés előkészítése: ${name}`,
      detail: "Szerződés szakasz. A teljes szerződés-előkészítési lista (ügyfél, adószám, elfogadott verzió, összeg, érvényesség, feltételek, tulajdonosi döntések) és a Megnyertük → projektátadás a Pipeline adatlapon. Jóváhagyási lépés és e-aláírás a CRM-ben nincs.",
      source: "Pipeline-ügy", sourceId: l.id, at: l.next_step_due_at, who: person(l.assigned_to),
      link: leadLink(l), button: "Pipeline adatlap", warnings: contractPrepWarnings(l, quotes), severity: "warning",
    });
  }
  // 4. Elfogadott ajánlat, de az ügy még nincs Szerződés szakaszban
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const acceptedSeen = new Set<string>();
  for (const q of quotes) {
    if (q.status !== "accepted" || q.is_current === false || !q.lead_id) continue;
    const l = leadById.get(q.lead_id);
    if (!l || l.status === "contract" || l.status === "won" || l.status === "lost" || acceptedSeen.has(l.id)) continue;
    acceptedSeen.add(l.id);
    items.push({
      key: `q:${q.id}`, kind: "accepted_quote", lane: "deals",
      title: `Elfogadott ajánlat: ${company(l.company_id) ?? q.title ?? "Ajánlat"}`,
      detail: "Az ügyfél elfogadta, de az ügy még nincs Szerződés szakaszban. A léptetést a Pipeline adatlapon a felelős végzi.",
      source: "Ajánlat", sourceId: q.id, at: q.updated_at ?? null, who: person(l.assigned_to),
      link: leadLink(l), button: "Pipeline adatlap", warnings: [], severity: "warning",
    });
  }

  // 5. Kritikus projektek (feladat-, határidő- és felelősi kockázat)
  const risks = projectRisks(input.projects ?? [], input.tasks ?? [], now);
  const riskIds = new Set(risks.map((r) => r.project.id));
  for (const r of risks) {
    items.push({
      key: `p:${r.project.id}`, kind: "critical_project", lane: "projects",
      title: `${r.project.title ?? "Projekt"} — ${r.reasons[0]}`,
      detail: [company(r.project.company_id ?? null), PROJECT_STATUS_LABEL[r.project.status as keyof typeof PROJECT_STATUS_LABEL] ?? r.project.status, r.project.deadline ? `Határidő: ${dayLabel(r.project.deadline)}` : null].filter(Boolean).join(" · "),
      source: "Projekt és feladatai", sourceId: r.project.id, at: null,
      who: r.noPm ? null : person(projectManagerOf(r.project)),
      link: { to: `/projects/${r.project.id}`, search: { tab: r.tab } }, button: r.tab === "tasks" ? "Feladatok" : r.tab === "handover" ? "Átadás" : "Projekt",
      warnings: r.reasons.slice(1), severity: r.overdue || r.blocked ? "critical" : "warning",
    });
  }

  // 6. Elmaradt teendők (tulajdonosi tényekből) — a fentiekkel átfedőt összevonjuk
  for (const f of sectionItems(input.facts, "overdue")) {
    const projectId = typeof f.extra?.project_id === "string" ? f.extra.project_id : null;
    const leadId = typeof f.extra?.lead_id === "string" ? f.extra.lead_id : null;
    if (f.type === "task" && projectId && riskIds.has(projectId)) continue;
    if (f.type === "lead" && contractIds.has(f.id)) continue;
    if (f.type === "followup" && leadId && contractIds.has(leadId)) continue;
    const kind: OwnerItemKind = f.type === "lead" ? "overdue_lead" : f.type === "followup" ? "overdue_followup" : f.type === "task" ? "overdue_task" : "web_request";
    const lead = f.type === "lead" ? leadById.get(f.id) : leadId ? leadById.get(leadId) : undefined;
    const link = lead ? leadLink(lead) : f.type === "lead" ? { to: "/leads", search: { lead: f.id } } : f.type === "followup" && leadId ? { to: "/leads", search: { lead: leadId } } : parseInternalLink(f.link);
    items.push({
      key: `o:${f.type}:${f.id}`, kind, lane: "overdue", title: f.label,
      detail: f.at ? `Határidő / beérkezés: ${shortDate(f.at)}` : "",
      source: kind === "overdue_lead" ? "Lead következő lépés" : kind === "overdue_followup" ? "Utánkövetés" : kind === "overdue_task" ? "Feladat" : "Webes ajánlatkérés",
      sourceId: f.id, at: f.at ?? null, who: lead ? person(lead.assigned_to) : null,
      link, button: kind === "web_request" ? "Webes kérések" : "Megnyitás", warnings: [],
      severity: "warning",
    });
  }

  // 7. Küldésre előkészített ajánlat (Sales küldi; tájékoztató)
  for (const q of quotes) {
    if (q.status !== "ready" || q.is_current === false) continue;
    const l = q.lead_id ? leadById.get(q.lead_id) : undefined;
    items.push({
      key: `r:${q.id}`, kind: "ready_quote", lane: "deals", title: `Küldésre előkészítve: ${q.title ?? "Ajánlat"}`,
      detail: "Kiküldés csak az ajánlat 3. lépésében, a küldő saját Gmail-fiókjából; a CRM nem küldi automatikusan.",
      source: "Ajánlat", sourceId: q.id, at: q.updated_at ?? null, who: l ? person(l.assigned_to) : null,
      link: { to: `/quotes/${q.id}` }, button: "Ajánlat", warnings: [], severity: "info",
    });
  }

  // 8. Dolgozói jelzések és AI-hibajegyek (új + nyitott, egyszer)
  const seenIssue = new Set<string>();
  for (const i of [...sectionItems(input.facts, "new_issues"), ...sectionItems(input.facts, "open_issues")]) {
    if (seenIssue.has(i.id)) continue;
    seenIssue.add(i.id);
    const ai = i.label.startsWith("AI-felülvizsgálat");
    items.push({
      key: `i:${i.id}`, kind: ai ? "ai_signal" : "issue", lane: ai ? "ai" : "team",
      title: ai ? `George-vizsgálat hibajegye: ${i.label}` : `Dolgozói jelzés: ${i.label}`,
      detail: typeof i.extra?.reporter_role === "string" ? `Bejelentő szerepköre: ${roleLabel(i.extra.reporter_role)}` : "Hibajegy a közös hibaközpontban",
      source: "Hibaközpont", sourceId: i.id, at: i.at ?? null, who: null,
      link: { to: "/help" }, button: "Hibaközpont", warnings: [], severity: "info",
    });
  }

  // 9. Automatikus AI-jelzések (gyanú, nem igazolt hiba) és dokumentumhibák
  for (const s of sectionItems(input.facts, "ai_signals")) {
    items.push({
      key: `s:${s.id}`, kind: "ai_signal", lane: "ai", title: `AI-jelzés (gyanú): ${s.label}`,
      detail: `${Number(s.extra?.occurrences ?? 1)}× észlelve · nem igazolt hiba; George célzott vizsgálata külön, fizetős lépés.`,
      source: "Automatikus AI-felülvizsgálat", sourceId: s.id, at: s.at ?? null, who: null,
      link: { to: "/settings/ai-review" }, button: "AI-felülvizsgálat", warnings: [],
      severity: s.extra?.severity === "critical" ? "critical" : "info",
    });
  }
  for (const d of sectionItems(input.facts, "processing")) {
    items.push({
      key: `d:${d.id}`, kind: "doc_problem", lane: "ai", title: d.label, detail: "Dokumentumfeldolgozás — a tudásbázis ezt a fájlt nem vagy csak részben olvasta be.",
      source: "Dokumentumfeldolgozás", sourceId: d.id, at: d.at ?? null, who: null,
      link: { to: "/settings/knowledge-graph" }, button: "Tudásbázis", warnings: [], severity: "info",
    });
  }

  const rank = (k: OwnerItemKind) => OWNER_KIND_ORDER.indexOf(k);
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => rank(a.it.kind) - rank(b.it.kind) || a.i - b.i)
    .map(({ it }) => ({ ...it, lane: LANE_OF[it.kind] }));
}

const ROLE_HU: Record<string, string> = { owner: "Tulajdonos", sales: "Sales", marketing: "Marketing", project_manager: "Projektvezető" };
export const roleLabel = (r: string) => ROLE_HU[r] ?? r;

// ---------------------------------------------------------------------------
// Fókusz, sávok, forrásállapot
// ---------------------------------------------------------------------------
export type SourceState = { key: string; label: string; state: "ok" | "loading" | "error" | "not_connected"; note?: string };
export type OwnerFocus =
  | { state: "loading" }
  | { state: "error" }
  | { state: "calm"; partial: boolean }
  | { state: "item"; item: OwnerItem; partial: boolean; more: number };

export function ownerFocus(items: OwnerItem[], sources: SourceState[]): OwnerFocus {
  const loadable = sources.filter((s) => s.state !== "not_connected");
  if (loadable.length && loadable.every((s) => s.state === "error")) return { state: "error" };
  if (loadable.some((s) => s.state === "loading") && !items.length) return { state: "loading" };
  const partial = loadable.some((s) => s.state !== "ok");
  if (!items.length) return { state: "calm", partial };
  return { state: "item", item: items[0], partial, more: items.length - 1 };
}

export type OwnerStage = { key: OwnerLane; label: string; count: number | string; to: string; search: { lane: OwnerLane }; hint: string };
export function ownerStages(items: OwnerItem[], ready: boolean): OwnerStage[] {
  return OWNER_LANES.map((lane) => ({
    key: lane, label: OWNER_LANE_SHORT[lane], hint: OWNER_LANE_HINT[lane],
    count: ready ? items.filter((i) => i.lane === lane).length : "…",
    to: "/today", search: { lane },
  }));
}

/** A „Ma történt” rész a tények üzleti szakaszából — darabszám, nem pénzügyi adat. */
export function todayBusiness(facts: OwnerInputs["facts"]) {
  const items = sectionItems(facts, "business");
  const count = (pred: (i: FactItem) => boolean) => items.filter(pred).length;
  return {
    total: sectionTotal(facts, "business"),
    won: count((i) => i.type === "lead" && i.label.startsWith("Megnyert")),
    lost: count((i) => i.type === "lead" && i.label.startsWith("Elveszett")),
    sent: count((i) => i.type === "quote_send"),
    web: count((i) => i.type === "web_request"),
    items,
  };
}

/** A tényszakasz több tételt tartalmaz, mint amennyi látszik (legfeljebb 25 / szakasz). */
export function truncatedSections(facts: OwnerInputs["facts"]): { key: string; title: string; shown: number; total: number }[] {
  return (facts?.sections ?? [])
    .filter((s) => ["immediate", "overdue", "new_issues", "open_issues", "ai_signals", "processing"].includes(s.key) && s.total > s.items.length)
    .map((s) => ({ key: s.key, title: s.title, shown: s.items.length, total: s.total }));
}
