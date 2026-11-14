/**
 * Szerződés-előkészítés (Sales ajánlat → szerződés → tulajdonosi döntés-előkészítés → PM átadás)
 * — kizárólag megjelenítési modell.
 *
 * Egyetlen szabályforrás a szerződés-előkészítési ellenőrzőlistához: a Pipeline
 * ügy-adatlap (Szerződés szakasz / elfogadott ajánlat), az elfogadott ajánlat
 * 4. Utánkövetés lépése, a megnyert ügy projektkártyája, a projekt Átadás füle
 * és a Mai vezetői munka figyelmeztetései (`contractPrepWarnings`) ezt használják.
 *
 * Bemenet csak meglévő, a hívó jogosultságával (RLS) olvasott adat: leads,
 * companies (név, típus, adószám), contacts, aktuális quotes (állapot, kiküldés,
 * érvényesség, helyszín, összeg, sablonfeltételek), quote_documents
 * („Szerződési / fizetési feltételek”), projects + project_documents („Szerződés”).
 *
 * NEM ír adatot, NEM vált állapotot, NEM jelöl jóváhagyást vagy aláírást.
 * Szerződés-nyilvántartás, jóváhagyási munkafolyamat és e-aláírás a CRM-ben
 * NINCS (CONTRACT_RECORD_AVAILABLE = false): ezek „Nincs a CRM-ben” listán
 * szerepelnek, soha nem „Rendben”-ként. A „kész” fázis is csak annyit jelent,
 * hogy a források szerint nincs hiány.
 */
import { STATUS_TRANSITIONS, type LeadStatus } from "@/lib/sales/constants";
import { quoteAmounts } from "@/lib/quotes/amounts";
import { budapestYmd, type PmTab } from "@/lib/pm/pm-day-flow";
import { COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { formatHuf } from "@/lib/format";
import type { HandoffItem, HandoffKey, HandoffRole, HandoffState, HandoffSummary } from "@/lib/handoff/sales-pm-handoff";

/** Nincs szerződés-nyilvántartás, jóváhagyási lépés, e-aláírás vagy döntésnapló (2026-11-14). */
export const CONTRACT_RECORD_AVAILABLE = false as const;

export type ContractState = HandoffState;
export type ContractRole = HandoffRole;
export type ContractKey =
  | "stage" | "responsible" | "customer" | "customer_identity" | "contact" | "accepted"
  | "sent" | "amount" | "validity" | "site" | "terms" | "contract_doc";

export type ContractTarget =
  | { kind: "pipeline"; leadId: string }
  | { kind: "lead"; leadId: string }
  | { kind: "customer"; companyId: string }
  | { kind: "contact"; contactId: string }
  | { kind: "quote"; quoteId: string }
  | { kind: "project"; projectId: string; tab: PmTab }
  | { kind: "none" };

export type ContractItem = {
  key: ContractKey;
  label: string;
  state: ContractState;
  role: ContractRole;
  source: { table: string; label: string };
  detail: string;
  target: ContractTarget;
  /** Csak a Tulajdonos dönthet (pl. felelős kijelölése, több elfogadott verzió). */
  ownerDecision: boolean;
};

export type ContractLead = {
  id: string; status: string | null; company_id: string | null; contact_id: string | null;
  assigned_to: string | null; pipeline_entered_at?: string | null;
};
export type ContractCompany = { id: string; name: string | null; company_type: string | null; tax_number: string | null };
export type ContractContact = { id: string; name: string | null; email: string | null; email_invalid?: boolean | null };
export type ContractQuote = {
  id: string; title: string | null; status: string | null; sent_at: string | null; is_current: boolean | null;
  valid_until: string | null; site_address: string | null; total_amount: number | null; manual_net_amount: number | null;
  tax_percent?: number | null; template_terms: unknown; version: number | null; alternative_key: string | null;
};
export type ContractDoc = { id: string; name: string | null; file_url: string | null; created_at: string | null; parent_id: string; table: "quote_documents" | "project_documents" };
export type ContractProject = { id: string; title: string | null; address: string | null; status: string | null; lead_id: string | null; company_id?: string | null };

/**
 * `undefined` = nem töltöttük be / nem olvasható → NINCS ADAT;
 * `null` = a forrás szerint nincs ilyen (pl. nincs projekt még).
 */
export type ContractPrepInput = {
  lead: ContractLead | null | undefined;
  company: ContractCompany | null | undefined;
  contact: ContractContact | null | undefined;
  quotes: ContractQuote[] | null | undefined;
  termsDocs: ContractDoc[] | null | undefined;
  project: ContractProject | null | undefined;
  contractDocs: ContractDoc[] | null | undefined;
  now?: Date | string;
};

/** A szerződéshez kellene, de a CRM-ben nincs mezője / adatmodellje — nem szimuláljuk. */
export const CONTRACT_NOT_IN_CRM = [
  { key: "record", label: "Szerződés-nyilvántartás (szerződésszám, verzió, állapot)", detail: "Nincs adatmodell; a szerződés csak feltöltött fájlként létezik." },
  { key: "approval", label: "Tulajdonosi szerződés-jóváhagyás", detail: "Nincs jóváhagyási lépés és napló — a CRM nem jelöl „jóváhagyva” állapotot. Döntési terv: docs/system-map/szerzodes-elokeszites-7-csomag-2026-11-14.md." },
  { key: "esign", label: "Elektronikus aláírás és aláírók", detail: "Nincs integráció; az aláírt példányt a projekt Dokumentumai közé, Szerződés kategóriában kell feltölteni." },
  { key: "address", label: "Megrendelő székhelye / számlázási címe", detail: "A cégadatlapon nincs cím mező — NINCS ADAT." },
  { key: "private", label: "Magánszemély személyes szerződéses adatai", detail: "Lakcím, azonosító adatok a CRM-ben nincsenek — NINCS ADAT." },
] as const;

export const CONTRACT_KEY_TO_HANDOFF: Partial<Record<ContractKey, HandoffKey>> = {
  contact: "contact", accepted: "accepted", contract_doc: "contract_doc",
};

const termText = (terms: unknown, k: string): string | null => {
  if (!terms || typeof terms !== "object") return null;
  const v = (terms as Record<string, unknown>)[k];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
export const TEMPLATE_TERM_LABEL: Record<string, string> = { payment: "Fizetési feltételek", warranty: "Garancia", schedule: "Ütemezés" };

export function quoteNetOf(q: Pick<ContractQuote, "total_amount" | "manual_net_amount" | "tax_percent">) {
  const total = q.total_amount != null ? Number(q.total_amount) : null;
  return quoteAmounts({ itemCount: total != null && total > 0 ? 1 : 0, totalAmount: total, manualNetAmount: q.manual_net_amount, taxPercent: q.tax_percent ?? null });
}
const quoteLabel = (q: ContractQuote) => `${q.title?.trim() || "Ajánlat"} · v${q.version ?? 1} · ${q.alternative_key ?? "A"} alt.`;

/** Az aktuális, elfogadott verziók (visszavont/nem aktuális kizárva). */
export function acceptedQuotes(quotes: ContractQuote[]): ContractQuote[] {
  return quotes.filter((q) => q.is_current !== false && q.status === "accepted");
}

/** Akkor releváns a szerződés-előkészítés, ha az ügy Szerződés szakaszban / megnyert, vagy van elfogadott ajánlat. */
export function contractPrepRelevant(inp: Pick<ContractPrepInput, "lead" | "quotes" | "project">): boolean {
  const st = inp.lead?.status;
  if (st === "contract" || st === "won") return true;
  if (inp.project) return true;
  return acceptedQuotes(inp.quotes ?? []).length > 0 && st !== "lost";
}

export function contractPrepItems(inp: ContractPrepInput): ContractItem[] {
  const now = inp.now ? new Date(inp.now) : new Date();
  const lead = inp.lead;
  const leadId = lead?.id ?? null;
  const projectId = inp.project?.id ?? null;
  const won = lead?.status === "won" || !!inp.project;
  const quotesKnown = Array.isArray(inp.quotes);
  const accepted = quotesKnown ? acceptedQuotes(inp.quotes!) : [];
  const one = accepted.length === 1 ? accepted[0] : null;
  const pipeTarget: ContractTarget = leadId ? (won ? { kind: "lead", leadId } : { kind: "pipeline", leadId }) : { kind: "none" };
  const quoteTarget = (q: ContractQuote | null): ContractTarget => (q ? { kind: "quote", quoteId: q.id } : pipeTarget);
  const noAccepted = "NINCS ADAT: nincs egyértelmű elfogadott ajánlatverzió, amiből ellenőrizhető.";
  const items: ContractItem[] = [];

  // 1. Szakasz
  items.push({
    key: "stage", label: "Ügy szakasza", role: "sales", ownerDecision: false,
    source: { table: "leads.status", label: "Pipeline-ügy szakasza" }, target: pipeTarget,
    ...(lead === undefined ? { state: "unknown" as const, detail: "A Sales-ügy nem tölthető be (NINCS ADAT)." }
      : lead === null ? { state: "not_linked" as const, detail: "NINCS ÖSSZEKÖTVE Sales-ügyhöz." }
      : lead.status === "won" ? { state: "ok" as const, detail: "Megnyert — a projekt létrejött; a szerződésfájl a projektnél kezelendő." }
      : lead.status === "contract" ? { state: "ok" as const, detail: "Szerződés szakasz — a „Megnyertük → projektátadás” a Pipeline adatlapon érhető el." }
      : lead.status === "lost" ? { state: "pending" as const, detail: "Elveszett ügy — szerződés nem készül." }
      : { state: "pending" as const, detail: accepted.length && (STATUS_TRANSITIONS[(lead.status ?? "new") as LeadStatus] ?? []).includes("contract")
          ? "Van elfogadott ajánlat, de az ügy még nincs Szerződés szakaszban — a felelős Sales léptesse a Pipeline adatlapon."
          : "Az ügy még nincs Szerződés szakaszban." }),
  });

  // 2. Felelős Sales — kijelölni csak a Tulajdonos tud
  items.push({
    key: "responsible", label: "Felelős Sales", role: "owner", ownerDecision: true,
    source: { table: "leads.assigned_to", label: "Pipeline-ügy felelőse" }, target: leadId ? { kind: "lead", leadId } : { kind: "none" },
    ...(lead === undefined ? { state: "unknown" as const, detail: "A Sales-ügy nem tölthető be (NINCS ADAT)." }
      : lead === null ? { state: "not_linked" as const, detail: "NINCS ÖSSZEKÖTVE Sales-ügyhöz." }
      : lead.assigned_to ? { state: "ok" as const, detail: "Van felelős Sales." }
      : { state: "missing" as const, detail: "Nincs felelős Sales — felelőst csak a Tulajdonos jelölhet ki (Leadek munkafelület)." }),
  });

  // 3. Megrendelő
  // Sales-ügy nélküli projektnél a projekt ügyfele a megrendelő.
  const companyId = lead?.company_id ?? inp.project?.company_id ?? null;
  const co = inp.company;
  const isPrivate = co?.company_type === "maganszemely";
  items.push({
    key: "customer", label: "Megrendelő (cég vagy magánszemély)", role: "sales", ownerDecision: false,
    source: { table: "companies", label: "Ügyfél adatlap" }, target: companyId ? { kind: "customer", companyId } : pipeTarget,
    ...(lead === undefined && !companyId ? { state: "unknown" as const, detail: "A Sales-ügy nem tölthető be (NINCS ADAT)." }
      : !companyId ? { state: "missing" as const, detail: "Nincs ügyfél az ügyhöz rendelve — szerződés és megnyerés nélküle nem lehetséges." }
      : co === undefined || co === null || co.id !== companyId ? { state: "unknown" as const, detail: "Az ügyfél adatlapja nem olvasható (NINCS ADAT)." }
      : { state: "ok" as const, detail: `${co.name ?? "Névtelen ügyfél"} · ${co.company_type ? COMPANY_TYPE_LABEL[co.company_type] ?? co.company_type : "típus nincs megadva"}` }),
  });

  // 4. Azonosító adat: cégnél adószám; magánszemélynél a CRM-ben nincs mező
  const coOk = !!co && !!companyId && co.id === companyId;
  items.push({
    key: "customer_identity", label: isPrivate ? "Magánszemély szerződéses adatai" : "Megrendelő adószáma", role: "sales", ownerDecision: false,
    source: { table: "companies.tax_number", label: "Ügyfél adatlap · adószám" }, target: companyId ? { kind: "customer", companyId } : pipeTarget,
    ...(!coOk ? { state: "unknown" as const, detail: "Ügyfél nélkül nem ellenőrizhető (NINCS ADAT)." }
      : isPrivate ? { state: "pending" as const, detail: "Magánszemély: lakcím és azonosító adatok a CRM-ben nincsenek (NINCS ADAT) — a szerződésben kell rögzíteni." }
      : !co!.company_type ? { state: "pending" as const, detail: `Az ügyfél típusa nincs megadva (cég vagy magánszemély?).${co!.tax_number?.trim() ? ` Adószám: ${co!.tax_number.trim()}.` : ""}` }
      : co!.tax_number?.trim() ? { state: "ok" as const, detail: `Adószám: ${co!.tax_number.trim()}` }
      : { state: "missing" as const, detail: "Nincs adószám a cégadatlapon — a szerződéshez szükséges." }),
  });

  // 5. Kapcsolattartó
  const contactId = lead?.contact_id ?? null;
  const ct = inp.contact;
  items.push({
    key: "contact", label: "Megrendelői kapcsolattartó", role: "sales", ownerDecision: false,
    source: { table: "contacts", label: "Ügy kapcsolattartója" }, target: contactId ? { kind: "contact", contactId } : pipeTarget,
    ...(lead === undefined ? { state: "unknown" as const, detail: "A Sales-ügy nem tölthető be (NINCS ADAT)." }
      : !contactId ? { state: "missing" as const, detail: "Nincs kapcsolattartó az ügyön." }
      : !ct || ct.id !== contactId ? { state: "unknown" as const, detail: "A kapcsolattartó nem olvasható (NINCS ADAT)." }
      : !ct.email?.trim() ? { state: "pending" as const, detail: `${ct.name ?? "Kapcsolattartó"} — nincs e-mail címe.` }
      : ct.email_invalid ? { state: "pending" as const, detail: `${ct.name ?? "Kapcsolattartó"} — az e-mail cím hibásnak jelölt.` }
      : { state: "ok" as const, detail: `${ct.name ?? "Kapcsolattartó"} · ${ct.email.trim()}` }),
  });

  // 6. Elfogadott ajánlatverzió
  items.push({
    key: "accepted", label: "Elfogadott ajánlatverzió (szerződés alapja)", role: accepted.length > 1 ? "owner" : "sales", ownerDecision: accepted.length > 1,
    source: { table: "quotes.status", label: "Ajánlat állapota (aktuális verziók)" }, target: quoteTarget(one ?? accepted[0] ?? null),
    ...(!quotesKnown ? { state: "unknown" as const, detail: "Az ajánlatok nem tölthetők be (NINCS ADAT)." }
      : accepted.length === 0 ? { state: "missing" as const, detail: "Nincs „Elfogadott” aktuális ajánlatverzió. Ha az ügyfél elfogadta, a Sales jelölje az ajánlat 4. Utánkövetés lépésében." }
      : accepted.length > 1 ? { state: "pending" as const, detail: `${accepted.length} elfogadott aktuális verzió (${accepted.map((q) => `v${q.version ?? 1}/${q.alternative_key ?? "A"}`).join(", ")}) — tulajdonosi döntés kell, melyik a szerződés alapja. A CRM nem dönt.` }
      : { state: "ok" as const, detail: quoteLabel(one!) }),
  });

  // 7. Igazolt kiküldés
  items.push({
    key: "sent", label: "Az elfogadott ajánlat igazoltan kiküldve", role: "sales", ownerDecision: false,
    source: { table: "quotes.sent_at", label: "Ajánlat kiküldési bizonyítéka" }, target: quoteTarget(one),
    ...(!quotesKnown ? { state: "unknown" as const, detail: "Az ajánlatok nem tölthetők be (NINCS ADAT)." }
      : !one ? { state: "unknown" as const, detail: noAccepted }
      : one.sent_at ? { state: "ok" as const, detail: `Kiküldve: ${budapestYmd(one.sent_at)}.` }
      : { state: "pending" as const, detail: "Nincs igazolt kiküldés ezen a verzión — ellenőrizd, hogy az ügyfél ezt a változatot kapta-e meg." }),
  });

  // 8. Nettó összeg
  const amt = one ? quoteNetOf(one) : null;
  items.push({
    key: "amount", label: "Ismert nettó ajánlati összeg", role: "sales", ownerDecision: false,
    source: { table: "quotes", label: "Ajánlat összege (tételes vagy megadott nettó)" }, target: quoteTarget(one),
    ...(!quotesKnown ? { state: "unknown" as const, detail: "Az ajánlatok nem tölthetők be (NINCS ADAT)." }
      : !one ? { state: "unknown" as const, detail: noAccepted }
      : amt!.net == null || amt!.net <= 0 ? { state: "missing" as const, detail: "Az elfogadott ajánlat nettó összege nincs rögzítve." }
      : amt!.mismatch ? { state: "pending" as const, detail: `Tételes (${formatHuf(amt!.itemsNet)}) és megadott (${formatHuf(amt!.manualNet)}) nettó eltér — tisztázandó.` }
      : { state: "ok" as const, detail: `Nettó ${formatHuf(amt!.net)} (${amt!.source === "items" ? "tételes" : "megadott"}).` }),
  });

  // 9. Érvényesség
  const today = budapestYmd(now);
  items.push({
    key: "validity", label: "Ajánlat érvényessége", role: "sales", ownerDecision: false,
    source: { table: "quotes.valid_until", label: "Ajánlat érvényességi dátuma" }, target: quoteTarget(one),
    ...(!quotesKnown ? { state: "unknown" as const, detail: "Az ajánlatok nem tölthetők be (NINCS ADAT)." }
      : !one ? { state: "unknown" as const, detail: noAccepted }
      : !one.valid_until ? { state: "pending" as const, detail: "Nincs érvényességi dátum az ajánlaton." }
      : one.valid_until.slice(0, 10) < today ? { state: "pending" as const, detail: `Az érvényesség lejárt (${one.valid_until.slice(0, 10)}) — az árakat az ügyféllel meg kell erősíteni.` }
      : { state: "ok" as const, detail: `Érvényes: ${one.valid_until.slice(0, 10)}-ig.` }),
  });

  // 10. Kivitelezés helyszíne
  const siteQ = one?.site_address?.trim() || null;
  const siteP = inp.project?.address?.trim() || null;
  items.push({
    key: "site", label: "Kivitelezés helyszíne", role: won ? "project_manager" : "sales", ownerDecision: false,
    source: siteQ ? { table: "quotes.site_address", label: "Ajánlat · helyszín" } : { table: "projects.address", label: "Projekt · helyszín" },
    target: projectId ? { kind: "project", projectId, tab: "handover" } : quoteTarget(one),
    ...(siteQ ? { state: "ok" as const, detail: `${siteQ} (az ajánlatból).` }
      : siteP ? { state: "ok" as const, detail: `${siteP} (a projektből).` }
      : !quotesKnown && !projectId ? { state: "unknown" as const, detail: "Az ajánlatok nem tölthetők be (NINCS ADAT)." }
      : { state: "pending" as const, detail: won ? "Sem az ajánlaton, sem a projekten nincs helyszín — a projektvezető pótolja az Átadás fülön." : "Az ajánlaton nincs helyszín; megnyerés után a projektvezető is pótolhatja." }),
  });

  // 11. Szerződési / fizetési feltételek
  const tKeys = one ? Object.keys(TEMPLATE_TERM_LABEL).filter((k) => termText(one.template_terms, k)) : [];
  const termDocs = Array.isArray(inp.termsDocs) ? inp.termsDocs.filter((d) => !one || d.parent_id === one.id) : null;
  const termParts = [...tKeys.map((k) => TEMPLATE_TERM_LABEL[k]), ...(termDocs?.length ? [`${termDocs.length} feltétel-dokumentum`] : [])];
  items.push({
    key: "terms", label: "Szerződési / fizetési feltételek", role: "sales", ownerDecision: false,
    source: { table: "quotes.template_terms + quote_documents", label: "Ajánlat feltételei és „Szerződési / fizetési feltételek” fájl" }, target: quoteTarget(one),
    ...(!quotesKnown ? { state: "unknown" as const, detail: "Az ajánlatok nem tölthetők be (NINCS ADAT)." }
      : !one ? { state: "unknown" as const, detail: noAccepted }
      : tKeys.includes("payment") || (termDocs?.length ?? 0) > 0 ? { state: "ok" as const, detail: `${termParts.join(" · ")} az elfogadott ajánlaton.` }
      : termDocs == null ? { state: "unknown" as const, detail: "A feltétel-dokumentumok nem tölthetők be (NINCS ADAT)." }
      : { state: "pending" as const, detail: tKeys.length ? `${termParts.join(" · ")} rögzítve, de fizetési feltétel nincs.` : "Nincs fizetési feltétel az ajánlaton és nincs „Szerződési / fizetési feltételek” fájl." }),
  });

  // 12. Szerződésfájl a projektnél
  const docs = Array.isArray(inp.contractDocs) ? inp.contractDocs : null;
  items.push({
    key: "contract_doc", label: "Szerződésfájl a projekt dokumentumai között", role: "sales", ownerDecision: false,
    source: { table: "project_documents", label: "Projekt dokumentumai · Szerződés kategória" },
    target: projectId ? { kind: "project", projectId, tab: "docs" } : { kind: "none" },
    ...(inp.project === undefined ? { state: "unknown" as const, detail: "A projekt nem tölthető be (NINCS ADAT)." }
      : inp.project === null ? { state: "pending" as const, detail: "Még nincs projekt: a megnyerés után a projekt Dokumentumai közé, Szerződés kategóriában tölthető fel." }
      : docs == null ? { state: "unknown" as const, detail: "A projekt dokumentumai nem tölthetők be (NINCS ADAT)." }
      : docs.length ? { state: "ok" as const, detail: `${docs.length} szerződésfájl feltöltve. A CRM nem igazolja az aláírást vagy a jóváhagyást.` }
      : { state: "pending" as const, detail: "Nincs „Szerződés” kategóriájú fájl a projektnél." }),
  });
  return items;
}

export type ContractPhase = "not_relevant" | "unknown" | "owner_gap" | "sales_gap" | "pm_gap" | "check" | "ready";
export const CONTRACT_PHASE_LABEL: Record<ContractPhase, string> = {
  not_relevant: "Még nem szerződéses szakasz",
  unknown: "Nem ellenőrizhető (hiányzó forrás)",
  owner_gap: "Tulajdonosi döntésre vár",
  sales_gap: "Sales-pótlásra vár",
  pm_gap: "Projektvezetői pótlásra vár",
  check: "Ellenőrizendő tételek",
  ready: "Előkészítve a források szerint (nem jóváhagyás)",
};

export type ContractPrepSummary = {
  items: ContractItem[];
  phase: ContractPhase;
  relevant: boolean;
  missing: number; pending: number; unknown: number;
  ownerDecisions: ContractItem[];
  /** Megnyertük gomb meglévő feltétele (Szerződés szakasz + ügyfél) — csak tájékoztató, a DB dönt. */
  canWin: boolean;
};

export function contractPrepSummary(inp: ContractPrepInput): ContractPrepSummary {
  const items = contractPrepItems(inp);
  const relevant = contractPrepRelevant(inp);
  const open = (i: ContractItem) => i.state === "missing" || i.state === "pending";
  const missing = items.filter((i) => i.state === "missing").length;
  const pending = items.filter((i) => i.state === "pending").length;
  const unknown = items.filter((i) => i.state === "unknown").length;
  const ownerDecisions = items.filter((i) => i.ownerDecision && open(i));
  const miss = (r: ContractRole) => items.some((i) => i.role === r && i.state === "missing");
  const phase: ContractPhase = !relevant ? "not_relevant"
    : ownerDecisions.length || miss("owner") ? "owner_gap"
    : miss("sales") ? "sales_gap" : miss("project_manager") ? "pm_gap"
    : unknown ? "unknown" : pending ? "check" : "ready";
  const canWin = (STATUS_TRANSITIONS[(inp.lead?.status ?? "new") as LeadStatus] ?? []).includes("won") && !!inp.lead?.company_id;
  return { items, phase, relevant, missing, pending, unknown, ownerDecisions, canWin };
}

const viewerRole = (r: string | null | undefined): ContractRole | null =>
  r === "owner" || r === "sales" || r === "project_manager" ? r : null;

export type ContractNext = { title: string; detail: string; item: ContractItem | null; mine: boolean; waitingFor: ContractRole | null };
const ROLE_LABEL: Record<ContractRole, string> = { owner: "Tulajdonos", sales: "Sales", project_manager: "Projektvezető" };

/** A néző következő konkrét lépése: saját hiány → saját ellenőrizendő → kire vár. */
export function contractNext(s: ContractPrepSummary, viewer: string | null | undefined): ContractNext {
  const me = viewerRole(viewer);
  const find = (state: ContractState, role?: ContractRole) => s.items.find((i) => i.state === state && (!role || i.role === role)) ?? null;
  const ownStep = (own: ContractItem): ContractNext => ({ title: `${own.label} — ${own.state === "missing" ? "pótolandó" : own.ownerDecision ? "döntés szükséges" : "ellenőrizendő"}`, detail: own.detail, item: own, mine: true, waitingFor: null });
  // Sorrend: saját hiány → saját tulajdonosi döntés → más hiánya / tulajdonosi döntés → saját ellenőrizendő.
  const ownMissing = me ? find("missing", me) ?? (me === "owner" ? s.ownerDecisions[0] ?? null : null) : null;
  if (ownMissing) return ownStep(ownMissing);
  const other = find("missing") ?? s.ownerDecisions[0] ?? null;
  const ownPending = me ? find("pending", me) : null;
  if (!other && ownPending) return ownStep(ownPending);
  if (other) return { title: `${ROLE_LABEL[other.role]} teendője: ${other.label}`, detail: `${other.detail}${me && me !== "owner" && me !== other.role ? " Ez nem a te szerepköröd feladata — jelezd a felelősnek." : me === "owner" ? ` Felelős: ${ROLE_LABEL[other.role]}.` : ""}`, item: other, mine: false, waitingFor: other.role };
  if (s.unknown) return { title: "Egyes források nem ellenőrizhetők (NINCS ADAT)", detail: "Amíg ezek nincsenek meg, a szerződés-előkészítés nem tekinthető teljesnek.", item: find("unknown"), mine: false, waitingFor: null };
  const pend = find("pending");
  if (pend) return { title: `Ellenőrizendő: ${pend.label}`, detail: `${pend.detail} Felelős: ${ROLE_LABEL[pend.role]}.`, item: pend, mine: false, waitingFor: pend.role };
  return { title: "A szerződéshez szükséges CRM-adatok a források szerint megvannak", detail: "Ez nem jóváhagyás és nem aláírás: a szerződést a CRM-en kívül kell egyeztetni és aláírni, az aláírt példányt a projekthez feltölteni.", item: null, mine: false, waitingFor: null };
}

/** A projekt Átadás fülén a Sales→PM lista mellett: ami ott már szerepel, itt nem ismétlődik. */
export function contractItemsBesideHandoff(items: ContractItem[]): ContractItem[] {
  return items.filter((i) => !CONTRACT_KEY_TO_HANDOFF[i.key] && i.key !== "stage");
}

export type OwnerDecision = { topic: string; label: string; detail: string; origin: "contract" | "handoff"; state: ContractState; target: ContractTarget | null };
/**
 * Tulajdonosi döntésre előkészített hiányok — szerződés- és átadási listából,
 * témánként egyszer (duplikációmentes). Csak előkészítés: a CRM nem dönt és nem hagy jóvá.
 */
export function ownerDecisionPrep(contract: ContractPrepSummary | null | undefined, handoff: HandoffSummary | null | undefined): OwnerDecision[] {
  const out = new Map<string, OwnerDecision>();
  for (const i of contract?.ownerDecisions ?? []) {
    out.set(i.key === "accepted" ? "accepted_version" : i.key, { topic: i.key === "accepted" ? "accepted_version" : i.key, label: i.label, detail: i.detail, origin: "contract", state: i.state, target: i.target });
  }
  for (const h of (handoff?.items ?? []) as HandoffItem[]) {
    if (h.role !== "owner" || (h.state !== "missing" && h.state !== "pending")) continue;
    const topic = h.key === "accepted" ? "accepted_version" : h.key === "pm" ? "pm" : `handoff:${h.key}`;
    if (!out.has(topic)) out.set(topic, { topic, label: h.label, detail: h.detail, origin: "handoff", state: h.state, target: null });
  }
  return [...out.values()];
}

export type ContractLink = { to: string; params?: Record<string, string>; search?: Record<string, string>; label: string };
const ROUTES: Record<Exclude<ContractTarget["kind"], "none">, string> = {
  pipeline: "/sales/leads", lead: "/leads", customer: "/customers", contact: "/contacts", quote: "/quotes", project: "/projects",
};
/**
 * Hivatkozás a forrásra — csak ha a néző szerepköre az útvonalat megnyithatja
 * (`canAccess` a meglévő `canAccessRoute`). Az adatot az RLS továbbra is szűri.
 */
export function contractTargetLink(t: ContractTarget, canAccess: (path: string) => boolean): ContractLink | null {
  if (t.kind === "none" || !canAccess(ROUTES[t.kind])) return null;
  switch (t.kind) {
    case "pipeline": return { to: "/sales/leads", search: { lead: t.leadId }, label: "Pipeline adatlap" };
    case "lead": return { to: "/leads", search: { lead: t.leadId }, label: "Ügy adatlap" };
    case "customer": return { to: "/customers/$id", params: { id: t.companyId }, label: "Ügyfél adatlap" };
    case "contact": return { to: "/contacts/$id", params: { id: t.contactId }, label: "Kapcsolattartó" };
    case "quote": return { to: "/quotes/$id", params: { id: t.quoteId }, label: "Ajánlat" };
    case "project": return { to: "/projects/$id", params: { id: t.projectId }, search: { tab: t.tab }, label: t.tab === "docs" ? "Projekt dokumentumai" : "Projekt Átadás fül" };
  }
}

/**
 * Mai vezetői munka (Szerződés szakasz sora) rövid figyelmeztetései —
 * ugyanabból a modellből, a korábbi szövegekkel és sorrenddel.
 */
export function contractWarningsFromPrep(s: ContractPrepSummary): string[] {
  const by = new Map(s.items.map((i) => [i.key, i]));
  const w: string[] = [];
  if (by.get("customer")!.state === "missing") w.push("Nincs ügyfél megadva — Megnyertük nem lehetséges");
  if (by.get("accepted")!.state === "missing") w.push("Nincs elfogadottnak jelölt ajánlat");
  if (by.get("contact")!.state === "missing") w.push("Nincs kapcsolattartó");
  if (by.get("amount")!.state === "missing") w.push("Az elfogadott ajánlat nettó összege nincs rögzítve");
  if (by.get("responsible")!.state === "missing") w.push("Nincs felelős Sales");
  if (by.get("accepted")!.ownerDecision) w.push("Több elfogadott ajánlatverzió — tulajdonosi döntés: melyik a szerződés alapja");
  return w;
}
