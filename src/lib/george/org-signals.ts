/**
 * George központi szervezeti jelzései — 1. ütem (tisztán determinisztikus, 0 AI-hívás, írás nélkül).
 *
 * A meglévő, a Tulajdonos RLS-jogosultságával olvasott rekordokból rekordonként EGY tételt képez
 * (Sales→PM átadási hiány, elmaradt/hiányos Sales-ügy, lejárt projektteendő, bizonyíték nélküli
 * küldés, dolgozói panasz, automatikus jelzés, importdöntés). Minden tételnél külön látszik:
 *  - bizonyíték-osztály: forrásrekord által igazolt TÉNY ≠ dolgozói PANASZ ≠ tulajdonos által
 *    javítandónak jelölt HIBA ≠ automatikus ÉSZLELÉS (gyanú) ≠ AI-FELTÉTELEZÉS (forrás nélkül);
 *  - állapot: nyitott / ellenőrizendő / lezárt — kizárólag a forrásrekordok állapotából számolva;
 *  - felelős szerepkör és (ha látható) név, következő konkrét teendő, ellenőrzési/tesztjavaslat;
 *  - forráshivatkozás(ok) rekord-azonosítóval és a valódi CRM-oldalra mutató linkkel.
 * Azonos rekordra vonatkozó jelzések (pl. lejárt lépés + lejárt utánkövetés + korábbi automatikus
 * jelzés) egy tételbe olvadnak; a kulcs determinisztikus, így az eredmény ismételt futtatásra azonos.
 */
import { routeSpecialist, ISSUE_SPECIALIST } from "@/lib/issue-reports-model";
import { LEAD_STATUS_LABEL } from "@/lib/sales/constants";
import { PROJECT_STATUS_LABEL } from "@/lib/viba-constants";

export type OrgLink = { to: string; search?: Record<string, string> };
export type OrgDomain = "handoff" | "sales" | "projects" | "evidence" | "complaint" | "signal" | "decision" | "documents" | "import";
export type OrgEvidence = "fact" | "signal" | "complaint" | "confirmed_bug" | "assumption";
export type OrgStatus = "open" | "verify" | "closed";
export type OrgRole = "owner" | "sales" | "project_manager" | "marketing";
export type OrgSeverity = "critical" | "warning" | "info";
export type OrgSource = { table: string; id: string; label: string; link: OrgLink | null };
export type OrgItem = {
  key: string;
  domain: OrgDomain;
  severity: OrgSeverity;
  evidence: OrgEvidence;
  status: OrgStatus;
  title: string;
  detail: string;
  gaps: string[];
  role: OrgRole;
  responsibleId: string | null;
  responsibleName: string | null;
  nextAction: string;
  testHint: string;
  link: OrgLink | null;
  sources: OrgSource[];
  at: string | null;
  occurrences: number | null;
  notes: string[];
};

export const DOMAIN_LABEL: Record<OrgDomain, string> = {
  handoff: "Sales→PM átadás", sales: "Sales-ügyek", projects: "Projektteendők", evidence: "Bizonyíték nélküli állapot",
  complaint: "Dolgozói jelzések", signal: "Automatikus jelzések", decision: "Döntésre váró értesítés", documents: "Dokumentumfeldolgozás", import: "Adatminőség / import",
};
export const DOMAIN_ORDER: OrgDomain[] = ["evidence", "handoff", "sales", "projects", "decision", "complaint", "signal", "documents", "import"];
export const EVIDENCE_LABEL: Record<OrgEvidence, string> = {
  fact: "Tény (forrásrekord igazolja)",
  signal: "Automatikus észlelés — gyanú, nem igazolt hiba",
  complaint: "Dolgozói jelzés — nem igazolt",
  confirmed_bug: "Javítandó hiba (tulajdonosi besorolás)",
  assumption: "AI-feltételezés — forrás nélkül",
};
export const STATUS_LABEL: Record<OrgStatus, string> = { open: "Nyitott", verify: "Ellenőrizendő", closed: "Lezárt" };
export const ROLE_LABEL: Record<OrgRole, string> = { owner: "Tulajdonos", sales: "Sales", project_manager: "Projektvezető", marketing: "Marketing" };

/** Valódi adatkapcsolat nélküli részfolyamatok — a felület „NINCS ADAT”-ként mutatja, nem becsül. */
export const NO_DATA_AREAS: { key: string; label: string; note: string }[] = [
  { key: "attendance_link", label: "Jelenlét ↔ CRM-projekt kapcsolat", note: "Nincs mentett kapcsolat a jelenléti projekt és a CRM-projekt között; létszámból nem képzünk jelzést." },
  { key: "tig", label: "TIG / teljesítésigazolás", note: "Nincs TIG-adatmodell vagy aláírt dokumentum-nyilvántartás." },
  { key: "materials", label: "Anyagigény", note: "Nincs anyagigény-nyilvántartás." },
  { key: "contract", label: "Szerződés-jóváhagyás / e-aláírás", note: "Nincs szerződés-jóváhagyási adatmodell; a CRM nem szimulál jóváhagyást." },
  { key: "finance", label: "Számla, banki beérkezés, Billingo", note: "Nincs pénzügyi adatkapcsolat; követelést nem állítunk." },
  { key: "web_requests", label: "Webes ajánlatkérések feldolgozottsága", note: "Csak szerveroldali (admin) útvonalon olvasható; ez a nézet nem használ admin klienst. Számuk a George-jelentés tényei között látszik." },
];

// ---------- bemenetek (a szerver a Tulajdonos RLS-kliensével olvassa) ----------
export type InLead = { id: string; status: string | null; assigned_to: string | null; next_step_type: string | null; next_step_due_at: string | null; company_id: string | null; created_at: string | null };
export type InProject = { id: string; title: string | null; status: string | null; lead_id: string | null; company_id: string | null; project_manager_user_id: string | null; handoff_payload: unknown; handoff_at: string | null; start_date: string | null; deadline: string | null; address: string | null };
export type InTask = { id: string; title: string | null; status: string | null; due_date: string | null; project_id: string | null; assigned_user: string | null };
export type InFollowup = { id: string; lead_id: string | null; project_id: string | null; due_date: string | null; followup_type: string | null; assigned_to: string | null };
export type InQuote = { id: string; status: string | null; lead_id: string | null; project_id: string | null; title: string | null };
export type InIssue = { id: string; category: string; status: string; page_path: string; reporter_role: string | null; created_at: string; updated_at: string | null; technical_code: string | null; ai_analyzed_at: string | null; reporter_verdict: string | null };
export type InFinding = { issue_id: string; verified_source_count: number | null; unverified_claim_count: number | null };
export type InSignal = { id: string; signal_key: string; domain: string; agent: string; severity: string; title: string; source_table: string | null; source_id: string | null; occurrences: number; first_seen_at: string; last_seen_at: string; review_status: string; issue_id: string | null };
export type InNotice = { id: string; title: string; severity: string; requires_decision: boolean; link_path: string | null; source_table: string | null; source_id: string | null; last_occurred_at: string; occurrences: number };
export type InImport = { kind: string; count: number };
export type InDocument = { id: string; title: string | null; processing_status: string; error_code: string | null; source_table: string | null };

export type OrgInputs = {
  now: string;
  leads: InLead[];
  projects: InProject[];
  tasks: InTask[];
  followups: InFollowup[];
  sentQuotes: InQuote[];
  provenQuoteIds: string[];
  projectQuoteIds: { project_id: string }[];
  projectContacts: { project_id: string }[];
  issues: InIssue[];
  findings: InFinding[];
  signals: InSignal[];
  notices: InNotice[];
  imports: InImport[];
  documentErrors: InDocument[];
  documentsNeedReview: number;
  people: Record<string, string>;
  companies: Record<string, string>;
};

const CLOSED_PROJECT = new Set(["lezart", "felfuggesztve"]);
const CLOSED_TASK = new Set(["done", "completed", "cancelled"]);
const HANDOFF_GRACE_MS = 48 * 3600_000;
const NO_NEXT_GRACE_MS = 24 * 3600_000;
const SEV_RANK: Record<OrgSeverity, number> = { critical: 0, warning: 1, info: 2 };
const STATUS_RANK: Record<OrgStatus, number> = { open: 0, verify: 1, closed: 2 };
const UUID_SEG = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

const short = (id: string) => id.slice(0, 8);
const leadLink = (id: string): OrgLink => ({ to: `/leads/${id}` });
const projectLink = (id: string, tab?: string): OrgLink => ({ to: `/projects/${id}`, ...(tab ? { search: { tab } } : {}) });
const issueLink = (id: string): OrgLink => ({ to: "/help", search: { issue: id } });
const name = (inp: OrgInputs, id: string | null) => (id ? inp.people[id] ?? null : null);

/** Oldalútvonal azonosítók nélkül — az azonos képernyőre vonatkozó panaszok összevonásához. */
export function normalizePagePath(path: string): string {
  const p = (path || "/").split(/[?#]/)[0].replace(UUID_SEG, "/:id").replace(/\/+$/, "");
  return p || "/";
}

function pmOf(p: InProject): string | null {
  if (p.project_manager_user_id) return p.project_manager_user_id;
  const v = (p.handoff_payload as Record<string, unknown> | null)?.project_manager_user_id;
  return typeof v === "string" && v ? v : null;
}
function payloadText(p: InProject): number {
  const pl = (p.handoff_payload ?? {}) as Record<string, unknown>;
  return ["summary", "notes"].reduce((n, k) => n + (typeof pl[k] === "string" ? (pl[k] as string).trim().length : 0), 0);
}
function projectLabel(inp: OrgInputs, p: InProject) {
  const company = p.company_id ? inp.companies[p.company_id] : null;
  return `${p.title?.trim() || `Projekt ${short(p.id)}`}${company ? ` · ${company}` : ""}`;
}
function leadLabel(inp: OrgInputs, l: InLead) {
  const company = l.company_id ? inp.companies[l.company_id] : null;
  return `${company ?? `Ügy ${short(l.id)}`} · ${LEAD_STATUS_LABEL[l.status as keyof typeof LEAD_STATUS_LABEL] ?? l.status ?? "—"}`;
}

/** Jelzéstábla-kulcs → az élő tétel kulcsa (összevonáshoz). Ismeretlen előtag = önálló tétel. */
export function signalMergeKey(s: Pick<InSignal, "signal_key" | "source_id" | "issue_id">, issueGroup: Map<string, string>): string | null {
  const prefix = s.signal_key.split(":")[0];
  const sid = s.source_id;
  if (["sales_overdue", "sales_no_next_step", "sales_unassigned"].includes(prefix) && sid) return `lead:${sid}`;
  if (prefix === "quote_sent_unproven" && sid) return `quote_unproven:${sid}`;
  if (["project_overdue", "task_overdue"].includes(prefix) && sid) return `project_due:${sid}`;
  if (prefix === "project_no_pm" && sid) return `handoff:${sid}`;
  if (prefix === "document_error" && sid) return `document:${sid}`;
  if (prefix === "document_needs_review") return "documents:needs_review";
  if (prefix.startsWith("issue_")) {
    const id = s.issue_id ?? s.signal_key.split(":")[1] ?? null;
    return id ? issueGroup.get(id) ?? null : null;
  }
  return null;
}

type Draft = Omit<OrgItem, "responsibleName"> & { responsibleName?: string | null };

export function buildOrgSignals(inp: OrgInputs): OrgItem[] {
  const now = new Date(inp.now).getTime();
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const items = new Map<string, Draft>();
  const put = (d: Draft) => { items.set(d.key, d); return d; };

  // ---- Sales→PM átadás és projekt-alapadatok (aktív projektek) ----
  const tasksByProject = new Map<string, InTask[]>();
  for (const t of inp.tasks) if (t.project_id) tasksByProject.set(t.project_id, [...(tasksByProject.get(t.project_id) ?? []), t]);
  const contactsOf = new Set(inp.projectContacts.map((c) => c.project_id));
  const quotesOf = new Set(inp.projectQuoteIds.map((q) => q.project_id));
  const projectById = new Map(inp.projects.map((p) => [p.id, p]));
  const activeProjects = [...inp.projects].filter((p) => !CLOSED_PROJECT.has(p.status ?? "")).sort((a, b) => a.id.localeCompare(b.id));
  for (const p of activeProjects) {
    const pm = pmOf(p);
    const gaps: string[] = [];
    if (!pm) gaps.push("Nincs projektvezető kijelölve");
    const handoffAge = p.handoff_at ? now - new Date(p.handoff_at).getTime() : null;
    const noTasks = (tasksByProject.get(p.id) ?? []).length === 0 && handoffAge != null && handoffAge > HANDOFF_GRACE_MS;
    if (noTasks) gaps.push("Az átadás óta (48 óránál régebben) nincs projektfeladat felvéve");
    if (!p.address?.trim()) gaps.push("Hiányzik a helyszín címe");
    if (!p.deadline) gaps.push("Nincs határidő");
    if (!contactsOf.has(p.id)) gaps.push("Nincs projekt-kapcsolattartó");
    if (p.lead_id && !quotesOf.has(p.id)) gaps.push("Nincs ajánlat a projekthez kötve");
    if (p.lead_id && payloadText(p) < 20) gaps.push("Rövid vagy hiányzó Sales átadási összefoglaló (20 karakternél kevesebb)");
    if (!gaps.length) continue;
    const viaSales = !!p.lead_id;
    put({
      key: `handoff:${p.id}`, domain: "handoff", severity: !pm || noTasks ? "warning" : "info", evidence: "fact", status: "open",
      title: `${viaSales ? "Hiányos Sales→PM átadás" : "Hiányos projekt-alapadatok"}: ${projectLabel(inp, p)}`,
      detail: `${PROJECT_STATUS_LABEL[p.status ?? ""] ?? p.status ?? "—"} · ${gaps.length} hiányzó elem${p.handoff_at ? ` · átadva ${p.handoff_at.slice(0, 10)}` : ""}`,
      gaps, role: pm ? "project_manager" : "owner", responsibleId: pm ?? null,
      nextAction: !pm
        ? "Tulajdonos: jelölj ki projektvezetőt a projekt adatlapján, utána a PM pótolja a többi hiányt."
        : `Projektvezető: pótold a projekt Átadás fülén${viaSales ? "; a hiányzó összefoglalót / kapcsolattartót / ajánlatot a Sales-felelőssel egyeztesd" : ""}. Amit nem lehet pótolni, írd projektjegyzetbe.`,
      testHint: "Ellenőrzés: a hiány pótlása után az oldal frissítésekor a tétel eltűnik vagy a hiánylista rövidül; a projekt Átadás fülének ellenőrzőlistája ugyanezt mutatja.",
      link: projectLink(p.id, "handover"),
      sources: [
        { table: "projects", id: p.id, label: "Projekt adatlap", link: projectLink(p.id, "handover") },
        ...(p.lead_id ? [{ table: "leads", id: p.lead_id, label: "Megnyert Sales-ügy", link: leadLink(p.lead_id) }] : []),
      ],
      at: p.handoff_at, occurrences: null, notes: [],
    });
  }
  // Megnyert ügy projekt nélkül (adatintegritás; a DB-szabály elvileg kizárja).
  const projectLeadIds = new Set(inp.projects.map((p) => p.lead_id).filter(Boolean) as string[]);
  for (const l of inp.leads) {
    if (l.status !== "won" || projectLeadIds.has(l.id)) continue;
    put({
      key: `handoff_missing:${l.id}`, domain: "handoff", severity: "critical", evidence: "fact", status: "open",
      title: `Megnyert ügy projekt nélkül: ${leadLabel(inp, l)}`, detail: "A megnyerés csak projekt-létrehozással együtt lehetséges — adatintegritási eltérés vagy nem látható projekt.",
      gaps: ["Nincs a Tulajdonos által látható projekt ehhez a megnyert ügyhöz"], role: "owner", responsibleId: null,
      nextAction: "Tulajdonos: nyisd meg az ügyet és ellenőrizd az idővonalat. Kézzel ne hozz létre projektet; az eltérést fejlesztői vizsgálatra jelezd a hibaközpontban.",
      testHint: "Ellenőrzés: a projektek listájában keresd az ügy cégét; adatbázis-szinten a projects.lead_id kapcsolat.",
      link: leadLink(l.id), sources: [{ table: "leads", id: l.id, label: "Megnyert Sales-ügy", link: leadLink(l.id) }], at: null, occurrences: null, notes: [],
    });
  }

  // ---- Sales-ügyek: lejárt / hiányzó következő lépés, felelős nélküli ügy, lejárt utánkövetés ----
  const openLeads = inp.leads.filter((l) => l.status !== "won" && l.status !== "lost");
  const leadById = new Map(inp.leads.map((l) => [l.id, l]));
  const fuByLead = new Map<string, InFollowup[]>();
  const fuByProject = new Map<string, InFollowup[]>();
  for (const f of inp.followups) {
    if (!f.due_date || new Date(f.due_date).getTime() >= now) continue;
    if (f.lead_id) fuByLead.set(f.lead_id, [...(fuByLead.get(f.lead_id) ?? []), f]);
    else if (f.project_id) fuByProject.set(f.project_id, [...(fuByProject.get(f.project_id) ?? []), f]);
  }
  const leadIds = new Set([...openLeads.map((l) => l.id), ...[...fuByLead.keys()].filter((id) => leadById.get(id) && leadById.get(id)!.status !== "won" && leadById.get(id)!.status !== "lost")]);
  for (const id of [...leadIds].sort()) {
    const l = leadById.get(id)!;
    const gaps: string[] = [];
    let at: string | null = null;
    const overdue = !!l.next_step_due_at && new Date(l.next_step_due_at).getTime() < now;
    if (overdue) { gaps.push(`Lejárt következő lépés (${l.next_step_type ?? "—"}, ${l.next_step_due_at!.slice(0, 10)})`); at = l.next_step_due_at; }
    if (!l.next_step_due_at && l.created_at && now - new Date(l.created_at).getTime() > NO_NEXT_GRACE_MS) gaps.push("Nincs következő lépés rögzítve");
    if (!l.assigned_to) gaps.push("Nincs Sales-felelős (csak a Tulajdonos látja az ügyet)");
    const fus = (fuByLead.get(id) ?? []).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    if (fus.length) { gaps.push(`${fus.length} lejárt utánkövetés`); at = at && at < fus[0].due_date! ? at : fus[0].due_date; }
    if (!gaps.length) continue;
    put({
      key: `lead:${id}`, domain: "sales", severity: "warning", evidence: "fact", status: "open",
      title: `Sales-ügy teendője elmaradt vagy hiányos: ${leadLabel(inp, l)}`, detail: gaps.join(" · "), gaps,
      role: l.assigned_to ? "sales" : "owner", responsibleId: l.assigned_to,
      nextAction: !l.assigned_to
        ? "Tulajdonos: adj Sales-felelőst az ügynek (csak Tulajdonos adhat át felelőst), utána a felelős rögzíti a következő lépést."
        : "Sales-felelős: végezd el vagy ütemezd át a lépést az ügy adatlapján, és rögzíts új következő lépést. Tulajdonos csak ellenőriz, nem ír helyette.",
      testHint: "Ellenőrzés: új, jövőbeli következő lépés mentése után a tétel eltűnik; a Sales „Ma” lista ugyanezt az ügyet mutatja a felelősnél.",
      link: leadLink(id),
      sources: [{ table: "leads", id, label: "Sales-ügy", link: leadLink(id) }, ...fus.map((f) => ({ table: "followups", id: f.id, label: `Utánkövetés (${f.followup_type ?? "—"})`, link: leadLink(id) }))],
      at, occurrences: null, notes: [],
    });
  }

  // ---- Projektteendők: lejárt feladat, határidőn túli projekt, lejárt projekt-utánkövetés ----
  const dueTasks = inp.tasks.filter((t) => t.due_date && !CLOSED_TASK.has(t.status ?? "") && new Date(t.due_date).getTime() < now);
  const dueByProject = new Map<string, InTask[]>();
  for (const t of dueTasks) {
    if (t.project_id) { dueByProject.set(t.project_id, [...(dueByProject.get(t.project_id) ?? []), t]); continue; }
    put({
      key: `task:${t.id}`, domain: "projects", severity: "warning", evidence: "fact", status: "open",
      title: `Lejárt feladat projekt nélkül: ${(t.title ?? "Feladat").slice(0, 120)}`, detail: `Határidő ${t.due_date!.slice(0, 10)}`, gaps: ["Lejárt, nyitott feladat"],
      role: "owner", responsibleId: t.assigned_user,
      nextAction: "Felelős: zárd le vagy ütemezd át a feladatot a Feladatok oldalon.",
      testHint: "Ellenőrzés: a feladat „Kész” állapota után a tétel eltűnik.",
      link: { to: "/tasks" }, sources: [{ table: "tasks", id: t.id, label: "Feladat", link: { to: "/tasks" } }], at: t.due_date, occurrences: null, notes: [],
    });
  }
  const projIds = new Set([...dueByProject.keys(), ...fuByProject.keys(), ...activeProjects.filter((p) => p.deadline && p.deadline < todayYmd).map((p) => p.id)]);
  for (const pid of [...projIds].sort()) {
    const p = projectById.get(pid);
    if (p && CLOSED_PROJECT.has(p.status ?? "")) continue;
    const ts = (dueByProject.get(pid) ?? []).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
    const fs = fuByProject.get(pid) ?? [];
    const gaps: string[] = [];
    if (p?.deadline && p.deadline < todayYmd) gaps.push(`A projekt határideje lejárt (${p.deadline})`);
    if (ts.length) gaps.push(`${ts.length} lejárt, nyitott feladat`);
    if (fs.length) gaps.push(`${fs.length} lejárt utánkövetés`);
    if (!gaps.length) continue;
    const pm = p ? pmOf(p) : null;
    put({
      key: `project_due:${pid}`, domain: "projects", severity: "warning", evidence: "fact", status: "open",
      title: `Lejárt projektteendő: ${p ? projectLabel(inp, p) : `Projekt ${short(pid)}`}`, detail: gaps.join(" · "), gaps,
      role: pm ? "project_manager" : "owner", responsibleId: pm,
      nextAction: "Projektvezető: zárd le vagy ütemezd át a lejárt feladatokat a projekt Feladatok fülén; határidő-módosításnál jegyzetben rögzítsd az okot.",
      testHint: "Ellenőrzés: a feladat „Kész” mentése után a darabszám csökken; a PM „Mai projektmunka” lejárt listája egyezik.",
      link: projectLink(pid, "tasks"),
      sources: [
        { table: "projects", id: pid, label: "Projekt", link: projectLink(pid, "tasks") },
        ...ts.map((t) => ({ table: "tasks", id: t.id, label: `Feladat: ${(t.title ?? "").slice(0, 80)}`, link: projectLink(pid, "tasks") })),
        ...fs.map((f) => ({ table: "followups", id: f.id, label: `Utánkövetés (${f.followup_type ?? "—"})`, link: projectLink(pid, "followups") })),
      ],
      at: ts[0]?.due_date ?? p?.deadline ?? null, occurrences: null, notes: [],
    });
  }

  // ---- Bizonyíték nélküli állapot: „kiküldött” ajánlat küldési bizonyíték nélkül ----
  const proven = new Set(inp.provenQuoteIds);
  for (const q of [...inp.sentQuotes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (q.status !== "sent" || proven.has(q.id)) continue;
    const lead = q.lead_id ? leadById.get(q.lead_id) : null;
    put({
      key: `quote_unproven:${q.id}`, domain: "evidence", severity: "critical", evidence: "fact", status: "open",
      title: `Kiküldöttnek jelölt ajánlat igazolt küldés nélkül: ${(q.title ?? `Ajánlat ${short(q.id)}`).slice(0, 120)}`,
      detail: "Tény: nincs sikeres küldési napló (quote_sends) ehhez az ajánlathoz. Ez nem bizonyítja, hogy nem ment ki — csak azt, hogy a CRM nem tudja igazolni.",
      gaps: ["Hiányzó küldési bizonyíték"], role: lead?.assigned_to ? "sales" : "owner", responsibleId: lead?.assigned_to ?? null,
      nextAction: "Sales-felelős: ha a levél Gmailből ment ki, kapcsold az elküldött levelet az ajánlathoz az ajánlat adatlapján; ha nem ment ki, jelezd a Tulajdonosnak. Kézzel ne jelöld elküldöttnek.",
      testHint: "Ellenőrzés: összekapcsolás után az ajánlat Kiküldés részén megjelenik a Gmail-bizonyíték, és a tétel eltűnik.",
      link: { to: `/quotes/${q.id}` },
      sources: [{ table: "quotes", id: q.id, label: "Ajánlat", link: { to: `/quotes/${q.id}` } }, ...(q.lead_id ? [{ table: "leads", id: q.lead_id, label: "Sales-ügy", link: leadLink(q.lead_id) }] : [])],
      at: null, occurrences: null, notes: [],
    });
  }

  // ---- Dolgozói jelzések: képernyőnként + kategóriánként összevonva; panasz ≠ javítandó hiba ----
  const findingsByIssue = new Map<string, { verified: number; unverified: number }>();
  for (const f of inp.findings) {
    const cur = findingsByIssue.get(f.issue_id) ?? { verified: 0, unverified: 0 };
    cur.verified += f.verified_source_count ?? 0; cur.unverified += f.unverified_claim_count ?? 0;
    findingsByIssue.set(f.issue_id, cur);
  }
  const issueGroup = new Map<string, string>();
  const groups = new Map<string, InIssue[]>();
  for (const i of [...inp.issues].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    const key = i.technical_code === "AI_REVIEW" ? `ai_issue:${i.id}` : `complaint:${normalizePagePath(i.page_path)}:${i.category}`;
    issueGroup.set(i.id, key);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  for (const [key, list] of groups) {
    const aiTicket = key.startsWith("ai_issue:");
    const statuses = list.map((i) => i.status);
    const open = list.filter((i) => !["closed", "usage_question"].includes(i.status));
    const status: OrgStatus = !open.length ? "closed" : open.some((i) => i.status === "awaiting_fix") ? "open" : "verify";
    const confirmed = list.some((i) => ["awaiting_fix", "checking"].includes(i.status) || i.reporter_verdict === "resolved" || i.reporter_verdict === "not_resolved");
    const reopened = open.some((i) => i.reporter_verdict === "not_resolved");
    const unreviewed = open.filter((i) => !i.ai_analyzed_at && i.status === "new").length;
    const f = list.reduce((acc, i) => { const x = findingsByIssue.get(i.id); return x ? { verified: acc.verified + x.verified, unverified: acc.unverified + x.unverified } : acc; }, { verified: 0, unverified: 0 });
    const evidence: OrgEvidence = aiTicket ? (f.verified > 0 ? "signal" : "assumption") : confirmed ? "confirmed_bug" : "complaint";
    const path = normalizePagePath(list[0].page_path);
    const roles = [...new Set(list.map((i) => i.reporter_role).filter(Boolean))] as string[];
    const specialist = ISSUE_SPECIALIST[routeSpecialist(path, roles[0] ?? "")];
    const catLabel = { bug: "működési hiba", ux: "UX-panasz", feature: "fejlesztési igény", usage: "használati kérdés" }[list[0].category] ?? list[0].category;
    const notes: string[] = [];
    if (f.verified > 0) notes.push(`George-vizsgálat ${f.verified} ellenőrzött forrással — AI-eredmény, önmagában nem bizonyíték.`);
    if (f.unverified > 0) notes.push(`${f.unverified} forrás nélküli AI-állítás (feltételezés).`);
    if (reopened) notes.push("A bejelentő szerint a javítás nem oldotta meg.");
    const gaps = [
      `${list.length} bejelentés${list.length > 1 ? " ugyanarra a képernyőre" : ""}`,
      ...(roles.length ? [`Bejelentő szerepkör: ${roles.join(", ")}`] : []),
      ...(unreviewed ? [`${unreviewed} még nincs besorolva / vizsgálva`] : []),
      `Állapotok: ${[...new Set(statuses)].join(", ")}`,
    ];
    put({
      key, domain: aiTicket ? "signal" : "complaint", severity: reopened || (list.length > 1 && status !== "closed") ? "warning" : "info", evidence, status,
      title: aiTicket ? `Automatikus AI-felülvizsgálati hibajegy (${path})` : `${list.length > 1 ? "Ismétlődő " : ""}${catLabel}: ${path}`,
      detail: `Illetékes szakértő: ${specialist}`, gaps, role: "owner", responsibleId: null,
      nextAction: status === "closed" ? "Nincs teendő — lezárt bejelentés (30 napig látszik visszakeresésre)."
        : reopened ? "Tulajdonos: a javítás nem oldotta meg — állítsd vissza Vizsgálat alatt állapotba, és a hibaközpontban kérj újravizsgálatot (fizetős, megerősítéssel)."
        : open.some((i) => i.status === "awaiting_fix") ? "Javítás után állítsd Ellenőrzés alatt állapotra, hogy a bejelentő visszaigazolhassa."
        : open.some((i) => i.status === "checking") ? "A bejelentő visszaigazolására vár; ha 48 órán túl sincs válasz, kérdezd meg személyesen."
        : "Tulajdonos: sorold be (használati kérdés / javítandó hiba / fejlesztési igény). Vizsgálathoz a hibaközpontban indíthatsz George-vizsgálatot (fizetős, megerősítéssel).",
      testHint: `Reprodukálás TESZT-adattal: nyisd meg a(z) ${path} oldalt ${roles[0] ? `${roles[0]} szerepkörrel ` : ""}és hasonlítsd össze a bejelentés „elvárt” és „tapasztalt” leírását; javításkor erre a képernyőre készüljön regressziós teszt.`,
      link: issueLink(list[list.length - 1].id),
      sources: list.map((i) => ({ table: "issue_reports", id: i.id, label: `Bejelentés ${i.created_at.slice(0, 10)}`, link: issueLink(i.id) })),
      at: list[0].created_at, occurrences: list.length, notes,
    });
  }

  // ---- Döntésre váró / súlyos értesítések (forrás szerint összevonva) ----
  for (const n of [...inp.notices].sort((a, b) => a.id.localeCompare(b.id))) {
    const merge = n.source_table === "issue_reports" && n.source_id ? issueGroup.get(n.source_id)
      : n.source_table === "leads" && n.source_id ? `lead:${n.source_id}`
      : n.source_table === "quotes" && n.source_id ? `quote_unproven:${n.source_id}` : null;
    const target = merge ? items.get(merge) : null;
    const src: OrgSource = { table: "crm_notifications", id: n.id, label: `Értesítés: ${n.title.slice(0, 80)}`, link: { to: "/notifications" } };
    if (target) { target.sources.push(src); target.notes.push(`Kapcsolódó nyitott értesítés (${n.occurrences}×).`); continue; }
    put({
      key: `notice:${n.id}`, domain: "decision", severity: n.severity === "critical" ? "critical" : "warning", evidence: "fact", status: "open",
      title: n.title.slice(0, 160), detail: n.requires_decision ? "Tulajdonosi döntést igényel" : "Súlyos értesítés", gaps: [],
      role: "owner", responsibleId: null,
      nextAction: "Tulajdonos: nyisd meg az értesítést és a forrásrekordot, döntsd el a teendőt. Az értesítés a forrás megszűnésekor magától lezárul.",
      testHint: "Ellenőrzés: a forrás rendezése után az Értesítések oldalon a tétel lezártként jelenik meg.",
      link: { to: "/notifications" }, sources: [src], at: n.last_occurred_at, occurrences: n.occurrences, notes: [],
    });
  }

  // ---- Dokumentumfeldolgozás (közös tudásbázis): hiba = tény, ellenőrzést igénylő = összesítve ----
  for (const d of [...inp.documentErrors].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `document:${d.id}`;
    const src: OrgSource = { table: "knowledge_documents", id: d.id, label: `Dokumentum: ${(d.title ?? "névtelen").slice(0, 80)}`, link: { to: "/settings/knowledge-graph" } };
    put({
      key, domain: "documents", severity: "warning", evidence: "fact", status: "open",
      title: `Dokumentumfeldolgozási hiba: ${(d.title ?? `Dokumentum ${short(d.id)}`).slice(0, 120)}`,
      detail: `Hibakód: ${d.error_code ?? "—"}${d.source_table ? ` · forrás: ${d.source_table}` : ""}`, gaps: [], role: "owner", responsibleId: null,
      nextAction: "Tulajdonos: nézd meg a dokumentumot a Knowledge Graph oldalon; ha a fájl sérült vagy nem támogatott, töltsd fel újra a forrásrekordnál. Újrafeldolgozás csak a meglévő dokumentumsoron.",
      testHint: "Ellenőrzés: újrafeltöltés után a dokumentum állapota „Feldolgozva” vagy „Ellenőrzést igényel”, és a tétel eltűnik.",
      link: { to: "/settings/knowledge-graph" }, sources: [src], at: null, occurrences: null, notes: [],
    });
  }
  if (inp.documentsNeedReview > 0) {
    put({
      key: "documents:needs_review", domain: "documents", severity: "info", evidence: "fact", status: "verify",
      title: `${inp.documentsNeedReview} dokumentum ellenőrzést igényel`, detail: "Jellemzően szkennelt PDF vagy kép: szöveg nem nyerhető ki (OCR jelenleg nincs bekapcsolva).", gaps: [],
      role: "owner", responsibleId: null,
      nextAction: "Tulajdonos: döntsd el, kell-e ezekből kereshető szöveg; az OCR bekapcsolása külön, költségjóváhagyásos döntés.",
      testHint: "Ellenőrzés: a Knowledge Graph oldalon az „Ellenőrzést igényel” szűrő ugyanennyi dokumentumot mutat.",
      link: { to: "/settings/knowledge-graph" }, sources: [{ table: "knowledge_documents", id: "status:needs_review", label: "Knowledge Graph", link: { to: "/settings/knowledge-graph" } }],
      at: null, occurrences: inp.documentsNeedReview, notes: [],
    });
  }

  // ---- Automatikus jelzéstábla (ai_review_signals): összevonás az élő tétellel, vagy önálló gyanú ----
  for (const s of [...inp.signals].sort((a, b) => a.signal_key.localeCompare(b.signal_key))) {
    const merge = signalMergeKey(s, issueGroup);
    const target = merge ? items.get(merge) : null;
    const src: OrgSource = { table: "ai_review_signals", id: s.id, label: `Automatikus jelzés: ${s.title}`, link: { to: "/settings/ai-review" } };
    if (target) {
      target.sources.push(src);
      target.occurrences = Math.max(target.occurrences ?? 0, s.occurrences);
      target.notes.push(`Az óránkénti ellenőrzés is észlelte (${s.occurrences}×, először ${s.first_seen_at.slice(0, 10)}).`);
      continue;
    }
    const resolved = s.review_status === "resolved";
    // Leképezhető állapotjelzés, de az élő adatban már nem áll fenn → megszűnt, a jelzéstáblában még nyitott.
    const gone = !!merge && !resolved;
    const key = `signal:${s.signal_key}`;
    if (items.has(key)) continue;
    put({
      key, domain: "signal", severity: resolved || gone ? "info" : (s.severity as OrgSeverity) ?? "warning", evidence: "signal",
      status: resolved ? "closed" : "verify",
      title: s.title, detail: gone ? "Az élő forrásellenőrzés szerint már nem áll fenn; a jelzéstábla a következő AI nélküli ellenőrzésnél zárja." : `Terület: ${s.domain} · ${s.agent}`,
      gaps: [], role: s.domain === "marketing" ? "marketing" : s.domain === "sales" ? "sales" : s.domain === "projects" ? "project_manager" : "owner", responsibleId: null,
      nextAction: resolved ? "Nincs teendő — a jelzés megszűnt." : gone ? "Tulajdonos: futtasd az „Ellenőrzés most (AI nélkül)” gombot, ha a jelzéstáblát is frissíteni szeretnéd." : "Tulajdonos: nézd meg a forrást; vizsgálathoz George célzott vizsgálata indítható (fizetős, megerősítéssel).",
      testHint: "Ellenőrzés: az AI nélküli ellenőrzés újrafuttatása után a jelzés állapota frissül (észlelésszám vagy Megszűnt).",
      link: { to: "/settings/ai-review" }, sources: [src], at: s.first_seen_at, occurrences: s.occurrences, notes: [],
    });
  }

  // ---- Importdöntések (Adatellenőrzés oldal) ----
  const IMPORT_LABEL: Record<string, string> = { company: "bizonytalan cégegyezés", email_thread: "vitatott levélszál-hozzárendelés", invalid_email: "hibás e-mail-cím", project_candidate: "importált projektjelölt" };
  for (const im of [...inp.imports].sort((a, b) => a.kind.localeCompare(b.kind))) {
    if (im.count <= 0) continue;
    put({
      key: `import:${im.kind}`, domain: "import", severity: "info", evidence: "fact", status: "verify",
      title: `${im.count} ${IMPORT_LABEL[im.kind] ?? im.kind} vár kézi döntésre`, detail: "Az adatimport nyitott ellenőrzési tételei.", gaps: [],
      role: "owner", responsibleId: null,
      nextAction: "Tulajdonos: az Adatellenőrzés oldalon tételenként dönts. Céget, levélszálat vagy ügyfelet automatikusan ne vonj össze; duplikátumot csak jelölj.",
      testHint: "Ellenőrzés: tételenkénti döntés után a darabszám csökken; tömeges átkötés csak külön, visszaállítási tervvel jóváhagyott műveletben.",
      link: { to: "/import-review" }, sources: [{ table: im.kind === "project_candidate" ? "project_candidates" : "import_review_items", id: `kind:${im.kind}`, label: "Adatellenőrzés", link: { to: "/import-review" } }],
      at: null, occurrences: im.count, notes: [],
    });
  }

  // Felelős neve + stabil sorrend
  const out: OrgItem[] = [...items.values()].map((d) => ({ ...d, responsibleName: d.responsibleName ?? name(inp, d.responsibleId), notes: [...new Set(d.notes)] }));
  return out.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || SEV_RANK[a.severity] - SEV_RANK[b.severity]
    || DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) || (a.at ?? "9").localeCompare(b.at ?? "9") || a.key.localeCompare(b.key));
}

export type OrgSummary = { total: number; byStatus: Record<OrgStatus, number>; byDomain: Partial<Record<OrgDomain, number>>; byEvidence: Partial<Record<OrgEvidence, number>>; critical: number };
export function summarizeOrgSignals(items: OrgItem[]): OrgSummary {
  const s: OrgSummary = { total: items.length, byStatus: { open: 0, verify: 0, closed: 0 }, byDomain: {}, byEvidence: {}, critical: 0 };
  for (const i of items) {
    s.byStatus[i.status]++;
    s.byDomain[i.domain] = (s.byDomain[i.domain] ?? 0) + 1;
    s.byEvidence[i.evidence] = (s.byEvidence[i.evidence] ?? 0) + 1;
    if (i.severity === "critical" && i.status !== "closed") s.critical++;
  }
  return s;
}
