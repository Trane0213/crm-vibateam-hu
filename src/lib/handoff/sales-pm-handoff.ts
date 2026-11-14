/**
 * Sales → projektvezető (PM) átadás — kizárólag megjelenítési modell.
 *
 * Egyetlen szabályforrás az átadási ellenőrzőlistához: a Megnyert lépés
 * előnézete, a projekt Átadás füle, a lead munkafelület projektkártyája, a PM
 * Mai projektmunka és George szervezeti jelzései ugyanezt használják.
 *
 * Bemenet csak meglévő, a hívó jogosultságával olvasott adat:
 *  - projects (lead_id, project_manager_user_id, handoff_payload, handoff_at, address, deadline, status)
 *  - quotes.project_id (a `projects_link_lead_records` trigger köti át megnyeréskor)
 *  - project_contacts, project_documents (document_type), tasks.project_id
 * Nem ír adatot, nem vált állapotot, nem jelöl „kész” átadást. Szerződés-
 * jóváhagyás, elektronikus aláírás, TIG és anyagigény NINCS a CRM-ben: ezek
 * külön, „NINCS A CRM-BEN” jelöléssel szerepelnek, soha nem „rendben”-ként.
 */
import type { PmTab } from "@/lib/pm/pm-day-flow";

export type HandoffRole = "owner" | "sales" | "project_manager";
/**
 * ok = a forrásrekord szerint megvan · missing = hiányzik, pótolni kell ·
 * pending = még nem esedékes / ellenőrizendő (nem hiba, de nem is kész) ·
 * not_linked = NINCS ÖSSZEKÖTVE (a projekt nem Sales-megnyerésből jött) ·
 * unknown = a forrás nem tölthető be (NINCS ADAT) — sosem számít rendben-nek.
 */
export type HandoffState = "ok" | "missing" | "pending" | "not_linked" | "unknown";
export type HandoffFix =
  | { kind: "tab"; tab: PmTab }
  | { kind: "basics"; field: "address" | "deadline" | "pm" }
  | { kind: "status" }
  | { kind: "lead" }
  | { kind: "none" };
export type HandoffItem = {
  key: HandoffKey;
  label: string;
  state: HandoffState;
  role: HandoffRole;
  /** Forrás: tábla + emberi név, hogy a tétel visszavezethető legyen. */
  source: { table: string; label: string };
  detail: string;
  fix: HandoffFix;
};
export type HandoffKey =
  | "pm" | "lead" | "summary" | "quote" | "accepted" | "contact" | "contract_doc"
  | "address" | "deadline" | "tasks" | "start";

export type HandoffProject = {
  id: string;
  status: string | null;
  lead_id: string | null;
  address?: string | null;
  deadline?: string | null;
  project_manager_user_id?: string | null;
  handoff_payload?: unknown;
  handoff_at?: string | null;
};
export type HandoffInput = {
  project: HandoffProject;
  /** A projekthez kötött ajánlatok száma; null = nem tölthető be. */
  quoteCount: number | null;
  /** „Elfogadott” állapotú ajánlatok száma; null = nem ismert. */
  acceptedCount: number | null;
  contactCount: number | null;
  /** „Szerződés” kategóriájú projekt-dokumentumok; null = nem ismert. */
  contractDocCount: number | null;
  /** A projekt összes feladata (lezártak is); null = nem tölthető be. */
  taskCount: number | null;
  now?: Date | string;
};

export const HANDOFF_SUMMARY_MIN_CHARS = 20;
export const HANDOFF_TASK_GRACE_MS = 48 * 3600_000;
/** Nincs adatmodell / integráció a CRM-ben — a felület csak jelzi, nem szimulálja. */
export const HANDOFF_NOT_IN_CRM = [
  { key: "contract_approval", label: "Szerződés-jóváhagyás és elektronikus aláírás", detail: "A CRM nem rögzít jóváhagyást és nem írat alá; csak a feltöltött szerződésfájl látszik." },
  { key: "tig", label: "Teljesítésigazolás (TIG)", detail: "Nem készül és nem írható alá a CRM-ben; az aláírt példány dokumentumként tölthető fel." },
  { key: "materials", label: "Anyagigény-nyilvántartás", detail: "Nincs adatmodell; anyagigényt feladatként („Akadályozott” állapot) lehet rögzíteni." },
] as const;

export const HANDOFF_ROLE_LABEL: Record<HandoffRole, string> = { owner: "Tulajdonos", sales: "Sales", project_manager: "Projektvezető" };
export const HANDOFF_STATE_LABEL: Record<HandoffState, string> = {
  ok: "Rendben", missing: "Hiányzik", pending: "Ellenőrizendő", not_linked: "NINCS ÖSSZEKÖTVE", unknown: "NINCS ADAT",
};

export function handoffPmOf(p: HandoffProject): string | null {
  if (p.project_manager_user_id) return p.project_manager_user_id;
  const v = (p.handoff_payload as Record<string, unknown> | null)?.project_manager_user_id;
  return typeof v === "string" && v ? v : null;
}
/** A Sales által átadott szöveg hossza (összefoglaló + megnyerési jegyzet). */
export function handoffTextLength(p: HandoffProject): number {
  const pl = (p.handoff_payload ?? {}) as Record<string, unknown>;
  return ["summary", "notes"].reduce((n, k) => n + (typeof pl[k] === "string" ? (pl[k] as string).trim().length : 0), 0);
}
export type HandoffOrigin = "sales_rpc" | "legacy_lead" | "no_lead";
export function handoffOrigin(p: HandoffProject): HandoffOrigin {
  if (!p.lead_id) return "no_lead";
  const via = (p.handoff_payload as Record<string, unknown> | null)?.created_via;
  return via === "sales_mark_won_with_project" ? "sales_rpc" : "legacy_lead";
}
export const HANDOFF_ORIGIN_LABEL: Record<HandoffOrigin, string> = {
  sales_rpc: "Megnyert ügyből, atomi átadással",
  legacy_lead: "Megnyert ügyből (korábbi átadás)",
  no_lead: "NINCS ÖSSZEKÖTVE Sales-ügyhöz",
};

const count = (n: number | null, okText: (n: number) => string, missingText: string) =>
  n == null ? "A forrás nem tölthető be." : n > 0 ? okText(n) : missingText;

export function handoffItems(inp: HandoffInput): HandoffItem[] {
  const p = inp.project;
  const now = inp.now ? new Date(inp.now).getTime() : Date.now();
  const viaSales = !!p.lead_id;
  const pm = handoffPmOf(p);
  const st = (n: number | null, missing: HandoffState = "missing"): HandoffState => (n == null ? "unknown" : n > 0 ? "ok" : missing);
  const textLen = handoffTextLength(p);
  const handoffAge = p.handoff_at ? now - new Date(p.handoff_at).getTime() : null;
  const taskState: HandoffState = inp.taskCount == null ? "unknown" : inp.taskCount > 0 ? "ok"
    : handoffAge != null && handoffAge > HANDOFF_TASK_GRACE_MS ? "missing" : "pending";

  return [
    {
      key: "pm", label: "Projektvezető kijelölve", role: "owner", state: pm ? "ok" : "missing",
      source: { table: "projects", label: "Projekt · projektvezető" },
      detail: pm ? "A megnyeréskor (vagy később a Tulajdonos által) kijelölt projektvezető." : "Nincs projektvezető — a projekt senkinél nincs napi munkában.",
      fix: { kind: "basics", field: "pm" },
    },
    {
      key: "lead", label: "Megnyert Sales-ügy kapcsolva", role: "owner", state: viaSales ? "ok" : "not_linked",
      source: { table: "projects", label: "Projekt · lead kapcsolat" },
      detail: viaSales ? HANDOFF_ORIGIN_LABEL[handoffOrigin(p)] + "." : "A projekt nem a Pipeline „Megnyertük” lépéséből jött létre; Sales-átadási adat nincs. Utólag nem köthető (csak a megnyerés hozza létre).",
      fix: viaSales ? { kind: "lead" } : { kind: "none" },
    },
    {
      key: "summary", label: "Sales átadási összefoglaló", role: "sales",
      state: !viaSales ? "not_linked" : textLen >= HANDOFF_SUMMARY_MIN_CHARS ? "ok" : "missing",
      source: { table: "projects.handoff_payload", label: "Megnyeréskor mentett összefoglaló és jegyzet" },
      detail: !viaSales ? "Nincs Sales-ügy, így átadási összefoglaló sincs." : textLen >= HANDOFF_SUMMARY_MIN_CHARS ? "Az összefoglaló és a megnyerési jegyzet az Átadás fülön olvasható."
        : `Rövid vagy hiányzó (${textLen} karakter, legalább ${HANDOFF_SUMMARY_MIN_CHARS} kell). Utólag nem írható át: a Sales projektjegyzetben pótolja.`,
      fix: { kind: "tab", tab: "notes" },
    },
    {
      key: "quote", label: "Ajánlat a projekthez kötve", role: "sales",
      state: inp.quoteCount == null ? "unknown" : inp.quoteCount > 0 ? "ok" : viaSales ? "missing" : "not_linked",
      source: { table: "quotes", label: "Ajánlatok (megnyeréskor automatikusan átkötve)" },
      detail: count(inp.quoteCount, (n) => `${n} ajánlat(verzió) kapcsolódik.`, viaSales ? "Az ügyhöz nem volt ajánlat, vagy nem a Sales-ügyhöz készült." : "Sales-ügy nélkül nincs átkötött ajánlat."),
      fix: { kind: "tab", tab: "quotes" },
    },
    {
      key: "accepted", label: "Elfogadott ajánlatverzió", role: "sales",
      state: inp.acceptedCount == null ? "unknown" : inp.acceptedCount > 0 ? "ok" : (inp.quoteCount ?? 0) > 0 ? "pending" : viaSales ? "pending" : "not_linked",
      source: { table: "quotes.status", label: "Ajánlat állapota" },
      detail: inp.acceptedCount == null ? "A forrás nem tölthető be." : inp.acceptedCount > 0 ? "Van „Elfogadott” állapotú ajánlat — ez a kivitelezés tartalmi alapja."
        : "Nincs „Elfogadott” állapotú ajánlat: egyeztesd a Sales-szel, melyik verzió az érvényes. A CRM ezt nem dönti el helyetted.",
      fix: { kind: "tab", tab: "quotes" },
    },
    {
      key: "contact", label: "Ügyfél-kapcsolattartó", role: viaSales ? "sales" : "project_manager", state: st(inp.contactCount),
      source: { table: "project_contacts", label: "Projekt kapcsolattartói" },
      detail: count(inp.contactCount, (n) => `${n} kapcsolattartó a projektnél.`, "Nincs kapcsolattartó — a helyszíni egyeztetéshez kell."),
      fix: { kind: "tab", tab: "contacts" },
    },
    {
      key: "contract_doc", label: "Aláírt szerződés feltöltve", role: viaSales ? "sales" : "project_manager",
      state: inp.contractDocCount == null ? "unknown" : inp.contractDocCount > 0 ? "ok" : "pending",
      source: { table: "project_documents", label: "Dokumentumok · Szerződés kategória" },
      detail: inp.contractDocCount == null ? "A forrás nem tölthető be." : inp.contractDocCount > 0
        ? `${inp.contractDocCount} szerződésfájl feltöltve. A CRM nem igazolja az aláírást vagy a jóváhagyást.`
        : "Nincs „Szerződés” kategóriájú fájl. Szerződés-jóváhagyás és e-aláírás a CRM-ben nincs — az aláírt példányt kell feltölteni.",
      fix: { kind: "tab", tab: "docs" },
    },
    {
      key: "address", label: "Helyszín címe", role: "project_manager", state: p.address?.trim() ? "ok" : "missing",
      source: { table: "projects", label: "Projekt · helyszín" },
      detail: p.address?.trim() ? p.address.trim() : "A megnyerés nem kéri be — a projektvezető pótolja itt.",
      fix: { kind: "basics", field: "address" },
    },
    {
      key: "deadline", label: "Határidő", role: "project_manager", state: p.deadline ? "ok" : "missing",
      source: { table: "projects", label: "Projekt · határidő" },
      detail: p.deadline ? p.deadline.slice(0, 10) : "A megnyerés nem kéri be — a projektvezető pótolja itt.",
      fix: { kind: "basics", field: "deadline" },
    },
    {
      key: "tasks", label: "Első projektfeladat felvéve", role: "project_manager", state: taskState,
      source: { table: "tasks", label: "Projekt feladatai" },
      detail: inp.taskCount == null ? "A forrás nem tölthető be." : inp.taskCount > 0 ? `${inp.taskCount} feladat a projektnél.`
        : taskState === "missing" ? "Az átadás óta több mint 48 óra telt el, és nincs feladat." : "Az átadás után 48 órán belül vedd fel az első feladatot (pl. felmérés).",
      fix: { kind: "tab", tab: "tasks" },
    },
    {
      key: "start", label: "Projektvezető átvette (állapot továbblépett)", role: "project_manager",
      state: p.status === "atadas" || !p.status ? "pending" : "ok",
      source: { table: "projects.status", label: "Projekt állapota" },
      detail: p.status === "atadas" || !p.status ? "Az állapot még „Átadás / előkészítés”. Ha átvetted, állítsd Felmérésre vagy Munka-előkészítésre a fejlécben."
        : "Az állapot már túl van az Átadás / előkészítésen.",
      fix: { kind: "status" },
    },
  ];
}

/**
 * George-kompatibilis hiánylista (rögzített sorrend és szöveg) — a szervezeti
 * jelzések és a projekt Átadás füle így nem mondhat ellent egymásnak.
 */
export function handoffGaps(inp: HandoffInput): string[] {
  const by = new Map(handoffItems(inp).map((i) => [i.key, i]));
  const viaSales = !!inp.project.lead_id;
  const gaps: string[] = [];
  if (by.get("pm")!.state === "missing") gaps.push("Nincs projektvezető kijelölve");
  if (by.get("tasks")!.state === "missing") gaps.push("Az átadás óta (48 óránál régebben) nincs projektfeladat felvéve");
  if (by.get("address")!.state === "missing") gaps.push("Hiányzik a helyszín címe");
  if (by.get("deadline")!.state === "missing") gaps.push("Nincs határidő");
  if (by.get("contact")!.state === "missing") gaps.push("Nincs projekt-kapcsolattartó");
  if (viaSales && by.get("quote")!.state === "missing") gaps.push("Nincs ajánlat a projekthez kötve");
  if (viaSales && by.get("summary")!.state === "missing") gaps.push(`Rövid vagy hiányzó Sales átadási összefoglaló (${HANDOFF_SUMMARY_MIN_CHARS} karakternél kevesebb)`);
  return gaps;
}

export type HandoffPhase = "unknown" | "owner_gap" | "sales_gap" | "pm_gap" | "pm_start" | "check" | "ok";
export const HANDOFF_PHASE_LABEL: Record<HandoffPhase, string> = {
  unknown: "Nem ellenőrizhető (hiányzó forrás)",
  owner_gap: "Tulajdonosi döntésre vár",
  sales_gap: "Sales-pótlásra vár",
  pm_gap: "Projektvezetői pótlásra vár",
  pm_start: "Átvételre vár",
  check: "Ellenőrizendő",
  ok: "Átvételi adatok rendben",
};
export type HandoffSummary = {
  items: HandoffItem[];
  phase: HandoffPhase;
  origin: HandoffOrigin;
  missing: number;
  pending: number;
  unknown: number;
  byRole: Record<HandoffRole, { missing: number; pending: number }>;
};
export function handoffSummary(inp: HandoffInput): HandoffSummary {
  const items = handoffItems(inp);
  const byRole: HandoffSummary["byRole"] = { owner: { missing: 0, pending: 0 }, sales: { missing: 0, pending: 0 }, project_manager: { missing: 0, pending: 0 } };
  for (const i of items) {
    if (i.state === "missing") byRole[i.role].missing++;
    if (i.state === "pending") byRole[i.role].pending++;
  }
  const missing = items.filter((i) => i.state === "missing").length;
  const pending = items.filter((i) => i.state === "pending").length;
  const unknown = items.filter((i) => i.state === "unknown").length;
  const startPending = items.find((i) => i.key === "start")!.state === "pending";
  const phase: HandoffPhase = byRole.owner.missing ? "owner_gap" : byRole.sales.missing ? "sales_gap" : byRole.project_manager.missing ? "pm_gap"
    : unknown ? "unknown" : startPending ? "pm_start" : pending ? "check" : "ok";
  return { items, phase, origin: handoffOrigin(inp.project), missing, pending, unknown, byRole };
}

export type ViewerRole = string | null | undefined;
const viewerHandoffRole = (r: ViewerRole): HandoffRole | null =>
  r === "owner" ? "owner" : r === "sales" ? "sales" : r === "project_manager" ? "project_manager" : null;

export type HandoffNext = { title: string; detail: string; item: HandoffItem | null; mine: boolean; waitingFor: HandoffRole | null };
/**
 * A néző következő konkrét lépése: először a saját hiánya, aztán a saját
 * ellenőrizendő tétele; ha nincs ilyen, megmondja, kire vár az átadás.
 * Tulajdonos minden szerepkör hiányát látja, de felelősnek a tétel szerepköre marad.
 */
export function handoffNext(s: HandoffSummary, viewer: ViewerRole): HandoffNext {
  const me = viewerHandoffRole(viewer);
  const pick = (state: HandoffState, role?: HandoffRole) => s.items.find((i) => i.state === state && (!role || i.role === role)) ?? null;
  const own = me ? pick("missing", me) ?? (me !== "owner" ? pick("pending", me) : null) : null;
  if (own) {
    return { title: `${own.label}${own.state === "missing" ? " — pótolandó" : " — ellenőrizendő"}`, detail: own.detail, item: own, mine: true, waitingFor: null };
  }
  const other = pick("missing");
  if (other) {
    return {
      title: `${HANDOFF_ROLE_LABEL[other.role]} pótlására vár: ${other.label}`,
      detail: me === "owner" ? `${other.detail} Felelős: ${HANDOFF_ROLE_LABEL[other.role]}.` : `${other.detail} Ez nem a te szerepköröd feladata — jelezd a felelősnek.`,
      item: other, mine: me === "owner", waitingFor: other.role,
    };
  }
  if (s.unknown) return { title: "Egyes források nem tölthetők be", detail: "Amíg nem töltődnek be, az átadás nem nevezhető rendben lévőnek. Próbáld újra.", item: null, mine: false, waitingFor: null };
  const pend = pick("pending");
  if (pend) {
    return { title: `Ellenőrizendő: ${pend.label}`, detail: `${pend.detail} Felelős: ${HANDOFF_ROLE_LABEL[pend.role]}.`, item: pend, mine: me === pend.role, waitingFor: me === pend.role ? null : pend.role };
  }
  return { title: "Az átvételi adatok a források szerint rendben", detail: "A napi munka a Feladatok és az Áttekintés · napi lap fülön folytatódik. Ez nem jelent ügyfél-elfogadást vagy aláírt szerződést.", item: null, mine: false, waitingFor: null };
}

/**
 * Megnyerés ELŐTTI előnézet (Pipeline „Megnyertük” ablak): mi kerül át
 * automatikusan a `sales_mark_won_with_project` + `projects_link_lead_records`
 * alapján, és mit kell a projektvezetőnek utólag pótolnia. Nem ír.
 */
export type WinPreviewRow = { key: string; label: string; state: "auto" | "missing" | "later"; detail: string };
export function winHandoffPreview(lead: { summary: string | null; source: string | null; contact_id?: string | null }, currentQuoteCount: number | null): WinPreviewRow[] {
  const sumLen = (lead.summary ?? "").trim().length;
  return [
    { key: "summary", label: "Ügy-összefoglaló", state: sumLen >= HANDOFF_SUMMARY_MIN_CHARS ? "auto" : "missing",
      detail: sumLen >= HANDOFF_SUMMARY_MIN_CHARS ? "Automatikusan átkerül; az átadási jegyzetbe NEM kell újra beírni."
        : sumLen ? `Rövid (${sumLen} karakter) — az átadási jegyzetben egészítsd ki a lényeggel.` : "Az ügynek nincs összefoglalója — az átadási jegyzetben írd le a lényeget." },
    { key: "source", label: "Lead forrása", state: lead.source ? "auto" : "missing", detail: lead.source ? "Automatikusan átkerül." : "Nincs megadva az ügyön." },
    { key: "quotes", label: "Ajánlatok", state: currentQuoteCount == null ? "missing" : currentQuoteCount > 0 ? "auto" : "missing",
      detail: currentQuoteCount == null ? "Az ajánlatok nem tölthetők be." : currentQuoteCount > 0 ? `${currentQuoteCount} aktuális ajánlat — az ügy minden ajánlata automatikusan a projekthez kötődik.` : "Nincs ajánlat az ügyön — a projektnél „Nincs ajánlat” hiány lesz." },
    { key: "contact", label: "Kapcsolattartó", state: lead.contact_id ? "auto" : "missing",
      detail: lead.contact_id ? "Döntéshozóként automatikusan a projekthez kerül." : "Nincs kapcsolattartó az ügyön — a projekt Kapcsolatok fülén kell pótolni." },
    { key: "followups", label: "Utánkövetések", state: "auto", detail: "Az ügy utánkövetései automatikusan a projekthez kötődnek." },
    { key: "pm_fields", label: "Helyszín, határidő, első feladat", state: "later", detail: "A megnyerés nem kéri be: a projektvezető az Átadás fülön pótolja." },
  ];
}
