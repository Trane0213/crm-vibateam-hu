/**
 * Sales munkafolyamat — kizárólag megjelenítési modell.
 *
 * A meglévő lead-státuszokból, ajánlat-állapotokból és mentett mezőkből
 * számolja, melyik lépésnél tart egy ügy és mi a következő értelmes teendő.
 * Nem vált státuszt, nem ír adatot; a tényleges szabályokat továbbra is a
 * DB triggerek és a meglévő mutációk (STATUS_TRANSITIONS,
 * sales_mark_won_with_project, /api/gmail/send) érvényesítik.
 */
import { STATUS_TRANSITIONS, type LeadStatus } from "./constants";

export const SALES_FLOW_STEPS = [
  { key: "inquiry", label: "Érdeklődő", hint: "Első kapcsolat, aktivitás és következő lépés" },
  { key: "customer", label: "Ügyféladatok", hint: "Cég vagy magánszemély és kapcsolattartó" },
  { key: "quote", label: "Ajánlat", hint: "Ajánlat létrehozása és összeállítása" },
  { key: "check", label: "Ellenőrzés", hint: "Kiküldés előtti ellenőrzés" },
  { key: "send", label: "Kiküldés", hint: "Küldés CRM-ből vagy Gmailben küldött levél rögzítése" },
  { key: "followup", label: "Utánkövetés", hint: "Válasz követése, pontosítás" },
  { key: "contract", label: "Szerződés és átadás", hint: "Szerződés-előkészítés, Megnyertük → projekt" },
] as const;
export type SalesFlowStep = (typeof SALES_FLOW_STEPS)[number]["key"];

export type FlowQuote = {
  id: string;
  status: string | null;
  sent_at?: string | null;
  is_current?: boolean | null;
};

export type FlowLead = {
  status: string | null;
  pipeline_entered_at: string | null;
  company_id: string | null;
  contact_id?: string | null;
  next_step_type: string | null;
  next_step_due_at: string | null;
};

export type NextActionKind =
  | "open_prep"        // Sales-előkészítés munkafelület
  | "create_quote"     // új ajánlat (munkamód választással)
  | "open_quote"       // meglévő ajánlat megnyitása
  | "change_status"    // engedélyezett Pipeline-átmenet javaslata
  | "win"              // Megnyertük → projekt (meglévő RPC)
  | "none";

export type NextAction = {
  step: SalesFlowStep | "done" | "closed";
  kind: NextActionKind;
  title: string;
  detail: string;
  quoteId?: string;
  suggestStatus?: LeadStatus;
  warnings: string[];
};

const SENT_STATES = new Set(["sent", "negotiation", "accepted", "rejected"]);
const isSent = (q: FlowQuote) => !!q.sent_at || SENT_STATES.has(q.status ?? "");
const isOpenDraft = (q: FlowQuote) => !q.sent_at && (q.status === "draft" || q.status === "ready" || q.status == null);

/** Az aktuális (nem visszavont) ajánlatverziók egy ügyhöz. */
export function currentQuotes<T extends FlowQuote>(quotes: T[]): T[] {
  return quotes.filter((q) => q.is_current !== false && q.status !== "withdrawn");
}

/** Csak akkor javasol státuszt, ha a meglévő állapotgép engedi. */
function allowedSuggestion(from: string | null, to: LeadStatus): LeadStatus | undefined {
  const list = STATUS_TRANSITIONS[(from ?? "new") as LeadStatus] ?? [];
  return list.includes(to) ? to : undefined;
}

export function leadWarnings(lead: FlowLead, now = new Date()): string[] {
  const w: string[] = [];
  if (lead.status === "won" || lead.status === "lost") return w;
  if (!lead.next_step_type || !lead.next_step_due_at) w.push("Nincs mentett következő lépés határidővel.");
  else if (Date.parse(lead.next_step_due_at) < now.getTime()) w.push("A következő lépés határideje lejárt.");
  if (!lead.company_id) w.push("Nincs ügyfél (cég vagy magánszemély) az ügyhöz rendelve.");
  if (lead.contact_id === null) w.push("Nincs kapcsolattartó megadva.");
  return w;
}

/** Egy ügy következő teendője a mentett állapot alapján. */
export function leadNextAction(lead: FlowLead, quotes: FlowQuote[], now = new Date()): NextAction {
  const warnings = leadWarnings(lead, now);
  const status = lead.status ?? "new";
  if (status === "won") return { step: "done", kind: "none", title: "Megnyert ügy", detail: "A projekt átadva — a további munka a projekt adatlapján folyik.", warnings };
  if (status === "lost") return { step: "closed", kind: "none", title: "Elveszett ügy", detail: "Lezárt ügy. Újranyitás az Elveszett leadek oldalon lehetséges.", warnings };

  if (!lead.pipeline_entered_at) {
    if (!lead.company_id) return { step: "customer", kind: "open_prep", title: "Ügyféladatok pótlása", detail: "Rendeld hozzá a céget vagy magánszemélyt, majd rögzítsd az első kapcsolatot.", warnings };
    return { step: "inquiry", kind: "open_prep", title: "Első kapcsolat és következő lépés", detail: "Rögzíts egy hívást vagy e-mailt és egy határidős következő lépést, utána léptetheted Pipeline-ba.", warnings };
  }

  const cur = currentQuotes(quotes);
  const accepted = cur.find((q) => q.status === "accepted");
  const sent = cur.find(isSent);
  const draft = cur.find(isOpenDraft);

  if (status === "contract") {
    return { step: "contract", kind: "win", title: "Szerződés-előkészítés, majd Megnyertük", detail: "Ellenőrizd a szerződés feltételeit. A „Megnyertük → projektátadás” egy lépésben létrehozza a projektet.", quoteId: accepted?.id, warnings };
  }
  if (accepted && (status === "quote_sent" || status === "follow_up")) {
    return { step: "contract", kind: "change_status", title: "Elfogadott ajánlat — Szerződés szakasz", detail: "Az ügyfél elfogadta az ajánlatot. Léptesd az ügyet a Szerződés szakaszba.", quoteId: accepted.id, suggestStatus: allowedSuggestion(status, "contract"), warnings };
  }
  if (status === "quote_prep") {
    if (sent) return { step: "followup", kind: "change_status", title: "Az ajánlat kiment", detail: "Igazolt kiküldés van. Léptesd az ügyet „Ajánlat kiadva” szakaszba.", quoteId: sent.id, suggestStatus: allowedSuggestion(status, "quote_sent"), warnings };
    if (draft) return { step: "check", kind: "open_quote", title: "Ajánlat befejezése és ellenőrzése", detail: "Van piszkozat. Töltsd ki, ellenőrizd, majd küldd ki vagy rögzítsd a Gmailben küldött levelet.", quoteId: draft.id, warnings };
    return { step: "quote", kind: "create_quote", title: "Ajánlat létrehozása", detail: "Ehhez az ügyhöz még nincs aktuális ajánlat.", warnings };
  }
  if (status === "quote_sent" || status === "follow_up") {
    if (!sent) {
      return { step: "send", kind: draft ? "open_quote" : "create_quote", title: "Kiküldés nincs igazolva", detail: "A Pipeline szakasz „ajánlat kiadva”, de a CRM-ben nincs igazolt kiküldés. Küldd ki vagy rögzítsd a Gmailben küldött levelet.", quoteId: draft?.id, warnings: [...warnings, "Kiküldés bizonyíték nélkül."] };
    }
    return { step: "followup", kind: "open_quote", title: "Utánkövetés", detail: "Kérdezz rá az ajánlatra, és rögzítsd a választ vagy a következő utánkövetést.", quoteId: sent.id, warnings };
  }
  // contacted/new a Pipeline-ban (régi adat) — nincs új szabály.
  return { step: "inquiry", kind: "none", title: "Következő lépés rögzítése", detail: "Rögzítsd a következő lépést.", warnings };
}

export type Check = { key: string; label: string; ok: boolean; blocking: boolean; hint?: string };
export type Readiness = { checks: Check[]; ready: boolean; missingBlocking: number; done: number };

const summarize = (checks: Check[]): Readiness => ({
  checks,
  ready: checks.every((c) => c.ok || !c.blocking),
  missingBlocking: checks.filter((c) => !c.ok && c.blocking).length,
  done: checks.filter((c) => c.ok).length,
});

/** Kiküldés előtti ellenőrzés — a MENTETT ajánlat adatai alapján. */
export function quoteSendReadiness(i: {
  kind: string | null;
  title: string | null;
  companyId: string | null;
  contactId: string | null;
  contactEmail: string | null;
  net: number | null;
  mismatch: boolean;
  itemCount: number;
  pricedDocCount: number;
  sentOfferDocCount: number;
  validUntil: string | null;
  hasMailbox: boolean;
}): Readiness {
  const own = i.kind === "viba_offer";
  const checks: Check[] = [
    { key: "kind", label: "Ajánlat munkamódja kiválasztva", ok: !!i.kind, blocking: true },
    { key: "company", label: "Ügyfél (cég vagy magánszemély) megadva", ok: !!i.companyId, blocking: true, hint: "Az ügyhöz vagy projekthez kell ügyfelet rendelni." },
    { key: "contact", label: "Kapcsolattartó kiválasztva, e-mail címmel", ok: !!i.contactId && !!i.contactEmail, blocking: true, hint: i.contactId ? "A kapcsolattartónak nincs e-mail címe." : "1. lépés: Kapcsolattartó." },
    own
      ? { key: "content", label: "Legalább egy ajánlati tétel", ok: i.itemCount > 0, blocking: true, hint: "2. lépés: tételek." }
      : { key: "content", label: "Árazott költségvetés feltöltve", ok: i.pricedDocCount > 0, blocking: true, hint: "1. lépés: Excel és tervek." },
    { key: "amount", label: "Ismert nettó összeg", ok: i.net != null && i.net > 0, blocking: true, hint: own ? "A tételekből számolódik." : "2. lépés: megadott nettó összeg." },
    { key: "mismatch", label: "Tételes és megadott összeg egyezik", ok: !i.mismatch, blocking: true },
    { key: "title", label: "Ajánlat címe", ok: !!i.title?.trim(), blocking: false },
    { key: "valid", label: "Érvényesség dátuma", ok: !!i.validUntil, blocking: false },
    { key: "attachment", label: own ? "PDF vagy kiküldendő ajánlat-fájl csatolva" : "Kiküldendő ajánlat-fájl csatolva", ok: i.sentOfferDocCount > 0, blocking: false, hint: "„Kiküldött ajánlat” típusú dokumentum." },
    { key: "mailbox", label: "Saját Gmail-fiók csatlakoztatva (CRM-ből küldéshez)", ok: i.hasMailbox, blocking: false, hint: "Enélkül csak a Gmailben küldött levél rögzíthető." },
  ];
  return summarize(checks);
}

/**
 * Szerződés-előkészítés — nincs külön szerződés-adatmodell, ezért csak a
 * meglévő adatokból mutat állapotot. Elektronikus aláírás NINCS.
 */
export const ESIGN_AVAILABLE = false as const;
export function contractReadiness(i: {
  leadStatus: string | null;
  acceptedQuote: boolean;
  companyId: string | null;
  contactId: string | null;
  net: number | null;
  contractTermsDoc: boolean;
}): Readiness & { canWin: boolean } {
  const checks: Check[] = [
    { key: "stage", label: "Az ügy Szerződés szakaszban van", ok: i.leadStatus === "contract", blocking: true },
    { key: "accepted", label: "Az ügyfél elfogadta az ajánlatot", ok: i.acceptedQuote, blocking: false, hint: "Ajánlat → 4. Utánkövetés → Elfogadott." },
    { key: "company", label: "Ügyfél megadva", ok: !!i.companyId, blocking: true },
    { key: "contact", label: "Kapcsolattartó megadva", ok: !!i.contactId, blocking: false },
    { key: "amount", label: "Ismert nettó ajánlati összeg", ok: i.net != null && i.net > 0, blocking: false },
    { key: "terms", label: "Szerződési / fizetési feltételek dokumentum", ok: i.contractTermsDoc, blocking: false, hint: "Az ajánlat dokumentumai között." },
  ];
  const r = summarize(checks);
  return { ...r, canWin: (STATUS_TRANSITIONS[(i.leadStatus ?? "new") as LeadStatus] ?? []).includes("won") && r.ready };
}

/** A Pipeline státuszmenüben csak az engedélyezett köztes átmenetek. */
export function menuTransitions(status: string | null): LeadStatus[] {
  return (STATUS_TRANSITIONS[(status ?? "new") as LeadStatus] ?? []).filter((s) => s !== "won" && s !== "lost");
}

/** Napi lista: Pipeline-ügy a Pipeline adatlapjára, előkészítés a munkafelületre. */
export function dailyLeadTarget(lead: { id: string; pipeline_entered_at: string | null; status: string | null }) {
  return lead.pipeline_entered_at && lead.status !== "won" && lead.status !== "lost"
    ? ({ to: "/sales/leads", search: { lead: lead.id } } as const)
    : ({ to: "/leads", search: { lead: lead.id } } as const);
}
