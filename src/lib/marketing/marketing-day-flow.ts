/**
 * Marketing Ma — tisztán megjelenítési modell (nincs DB-hívás, nincs írás).
 *
 * Bemenet a meglévő `loadMarketingDaily` eredménye és a már lekért
 * kampánytervezet-lista. Nem hoz létre új üzleti állapotot: a prioritási
 * sorrend a Scarlet napi utasításában rögzített sorrendet követi
 * (válaszjelzés → lejárt/esedékes teendő → átadható cég → új megkeresés),
 * a kampány-életút pedig kizárólag a mentett status / prechecked_at /
 * delivery_state mezőkből olvas.
 */
import type { loadMarketingDaily } from "../marketing-daily";
import { marketingDayBucket } from "../marketing-daily";

export type MarketingDaily = Awaited<ReturnType<typeof loadMarketingDaily>>;

export type CompanyTab = "overview" | "contacts" | "emails" | "sales-note" | "followups" | "docs" | "campaigns";
export const COMPANY_TABS: readonly CompanyTab[] = ["overview", "contacts", "emails", "sales-note", "followups", "docs", "campaigns"];

export type MarketingTarget =
  | { kind: "company"; companyId: string; tab?: CompanyTab }
  | { kind: "tasks" };

export type MarketingPriorityKind =
  | "reply"
  | "followup-overdue"
  | "callback"
  | "followup-today"
  | "task-overdue"
  | "task-today"
  | "handoff-ready"
  | "missing-contact"
  | "new-contact";

export type MarketingPriorityRow = {
  id: string;
  kind: MarketingPriorityKind;
  title: string;
  label: string;
  reason: string;
  due: string | null;
  responsible: string;
  target: MarketingTarget;
  /** Ugyanannál a cégnél összevont további teendők címkéi. */
  also: string[];
};

const KIND_ORDER: MarketingPriorityKind[] = [
  "reply", "followup-overdue", "callback", "followup-today", "task-overdue", "task-today",
  "handoff-ready", "missing-contact", "new-contact",
];

/** A napi lista sorai prioritási sorrendben; egy cég egyszer szerepel, a többi teendője `also`. */
export function marketingPriorityRows(daily: MarketingDaily | undefined | null, now = new Date()): MarketingPriorityRow[] {
  if (!daily) return [];
  const rows: MarketingPriorityRow[] = [];
  for (const c of daily.reply_pending) rows.push({
    id: `reply-${c.id}`, kind: "reply", title: c.name, label: "Válasz érkezett",
    reason: "Külső válasz érkezett a saját megkeresésedre; olvasd el a szálat, mielőtt állapotot váltasz.",
    due: null, responsible: "Saját postafiók", target: { kind: "company", companyId: c.id, tab: "emails" }, also: [],
  });
  for (const f of daily.followups) {
    if (f.bucket !== "overdue" && f.bucket !== "today" || !f.company_id) continue;
    const overdue = f.bucket === "overdue";
    rows.push({
      id: `followup-${f.id}`, kind: overdue ? "followup-overdue" : "followup-today", title: f.company_name,
      label: overdue ? "Lejárt utánkövetés" : "Mai utánkövetés",
      reason: overdue ? "A saját utánkövetésed határideje lejárt." : "Mára ütemezett saját utánkövetés.",
      due: f.due_date ?? null, responsible: "Saját", target: { kind: "company", companyId: f.company_id, tab: "followups" }, also: [],
    });
  }
  for (const c of daily.callbacks) {
    const b = marketingDayBucket(c.callback_date, now);
    if ((b !== "overdue" && b !== "today") || !c.company_id) continue;
    rows.push({
      id: `callback-${c.id}`, kind: "callback", title: c.company_name, label: "Visszahívás",
      reason: "Közösen látható visszahívási kérés; nem kizárólag saját feladat.",
      due: c.callback_date ?? null, responsible: "Közös visszahívás", target: { kind: "company", companyId: c.company_id }, also: [],
    });
  }
  for (const t of daily.tasks) {
    if (t.bucket !== "overdue" && t.bucket !== "today") continue;
    const overdue = t.bucket === "overdue";
    rows.push({
      id: `task-${t.id}`, kind: overdue ? "task-overdue" : "task-today", title: t.title,
      label: overdue ? "Lejárt saját feladat" : "Mai saját feladat",
      reason: overdue ? "Saját feladat, lejárt határidővel." : "Mára esedékes saját feladat.",
      due: t.due_date ?? null, responsible: "Saját", target: { kind: "tasks" }, also: [],
    });
  }
  for (const c of daily.qualified) rows.push({
    id: `handoff-${c.id}`, kind: "handoff-ready", title: c.name, label: "Salesnek átadható",
    reason: "Minősített cég. Ellenőrizd az összefoglalót és a felelőst; az átadás csak a megerősítő gombbal történik.",
    due: null, responsible: "Saját döntés", target: { kind: "company", companyId: c.id, tab: "sales-note" }, also: [],
  });
  for (const c of daily.missing_contacts) rows.push({
    id: `missing-${c.id}`, kind: "missing-contact", title: c.name, label: "Hiányzó elérhetőség",
    reason: "Nincs használható telefon vagy email; megkeresés előtt pótold a kapcsolattartót.",
    due: null, responsible: "Saját", target: { kind: "company", companyId: c.id, tab: "contacts" }, also: [],
  });
  for (const c of daily.to_contact) rows.push({
    id: `new-${c.id}`, kind: "new-contact", title: c.name, label: "Első megkeresés",
    reason: c.contact_state.email_available || c.contact_state.phone_available
      ? "Aktív kampánycég, még nincs megkeresésként jelölve."
      : "Aktív kampánycég, de nincs használható elérhetőség.",
    due: null, responsible: "Saját", target: { kind: "company", companyId: c.id, tab: c.contact_state.email_available || c.contact_state.phone_available ? "overview" : "contacts" }, also: [],
  });
  rows.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.due ?? "9").localeCompare(b.due ?? "9"));
  const byCompany = new Map<string, MarketingPriorityRow>();
  const out: MarketingPriorityRow[] = [];
  for (const r of rows) {
    if (r.target.kind === "company") {
      const first = byCompany.get(r.target.companyId);
      if (first) { if (!first.also.includes(r.label) && first.label !== r.label) first.also.push(r.label); continue; }
      byCompany.set(r.target.companyId, r);
    }
    out.push(r);
  }
  return out;
}

/** Csak az esedékes/sürgős teendők (új megkeresés és hiányzó adat nélkül) — a napi „Mai prioritások” fő listája. */
export function isUrgent(row: MarketingPriorityRow) {
  return row.kind !== "new-contact" && row.kind !== "missing-contact";
}

export type MarketingFocus = {
  eyebrow: string;
  title: string;
  detail: string;
  warnings: string[];
  actionLabel: string;
  target: MarketingTarget | { kind: "campaigns" };
};

const ACTION_LABEL: Record<MarketingPriorityKind, string> = {
  reply: "Levélszál megnyitása",
  "followup-overdue": "Utánkövetés megnyitása",
  callback: "Cég megnyitása",
  "followup-today": "Utánkövetés megnyitása",
  "task-overdue": "Feladat megnyitása",
  "task-today": "Feladat megnyitása",
  "handoff-ready": "Átadás előkészítése",
  "missing-contact": "Kapcsolattartó pótlása",
  "new-contact": "Cég megnyitása",
};

/** „Most ezzel kezdj”: a lista első sora; részleges adatnál figyelmeztetéssel. */
export function marketingFocus(rows: MarketingPriorityRow[], daily: MarketingDaily | undefined | null): MarketingFocus | null {
  if (!daily) return null;
  const warnings = daily.partial ? ["A napi lista részleges; lehet további, itt nem látható teendő."] : [];
  const first = rows[0];
  if (!first) return {
    eyebrow: "Most ezzel kezdj", title: "Nincs esedékes marketingteendő",
    detail: "Nézd át a kampánytervezeteket vagy a webes érdeklődéseket. Az üres lista nem jelenti, hogy minden levél meg van válaszolva.",
    warnings, actionLabel: "Kampányok megnyitása", target: { kind: "campaigns" },
  };
  const more = first.also.length ? ` Ugyanitt: ${first.also.join(", ")}.` : "";
  return {
    eyebrow: "Most ezzel kezdj", title: `${first.label}: ${first.title}`,
    detail: first.reason + more, warnings, actionLabel: ACTION_LABEL[first.kind], target: first.target,
  };
}

export type MarketingFlowStage = { key: string; label: string; count: number | string; to: string; hint: string };

/** A marketing teljes napi útja egy sorban, a meglévő oldalakra mutató belépőkkel. */
export function marketingFlowStages(input: {
  daily: MarketingDaily | undefined | null;
  dailyReady: boolean;
  webRecent: number | null;
  handoff30: number | null;
  activeCampaigns: number | null;
}): MarketingFlowStage[] {
  const d = input.dailyReady ? input.daily : null;
  const n = (v: number | null | undefined) => (v == null ? "—" : v);
  return [
    { key: "inbound", label: "Új érdeklődés", count: n(input.webRecent), to: "/web-quote-requests", hint: "Webes igény · 7 nap" },
    { key: "campaign", label: "Kampányok", count: n(input.activeCampaigns), to: "/campaign-list", hint: "Nem archivált tervezet" },
    { key: "to-contact", label: "Megkeresendő", count: n(d?.to_contact.length), to: "/campaign-list", hint: "Aktív kampánycég" },
    { key: "awaiting", label: "Válaszra vár", count: n(d?.awaiting_reply.length), to: "/emails", hint: "Tárolt saját megkeresés" },
    { key: "reply", label: "Válasz érkezett", count: n(d?.reply_pending.length), to: "/emails", hint: "Szál elolvasandó" },
    { key: "handoff-ready", label: "Átadható", count: n(d?.qualified.length), to: "/customers", hint: "Minősített cég" },
    { key: "handoff", label: "Saleshez átadva", count: n(input.handoff30), to: "/customers", hint: "30 nap · mentett állapot" },
  ];
}

// ───────────── Kampány-életút ─────────────

export type CampaignListRow = {
  id: string; name: string; status: string; updated_at: string;
  prechecked_at?: string | null; approved_at?: string | null; delivery_state?: string | null;
  created_by?: string | null;
};

export type CampaignStage = "draft" | "prechecked" | "scheduled" | "paused" | "stopped" | "archived";

export const CAMPAIGN_STAGE_LABEL: Record<CampaignStage, string> = {
  draft: "Tervezet",
  prechecked: "Címzettek ellenőrizve",
  scheduled: "Ütemezésre jóváhagyva",
  paused: "Ütemezés szüneteltetve",
  stopped: "Ütemezés leállítva",
  archived: "Archivált",
};

/** Lépés-index a kampány 3 lépéses sávjához: 1 címzettek, 2 üzenet/előnézet/TESZT, 3 jóváhagyás/ütemezés. */
export function campaignLifecycle(c: Pick<CampaignListRow, "status" | "prechecked_at" | "delivery_state">): {
  stage: CampaignStage; label: string; step: 1 | 2 | 3; next: string; tone: "muted" | "info" | "warning" | "success";
} {
  if (c.status === "archived") return { stage: "archived", label: CAMPAIGN_STAGE_LABEL.archived, step: 1, next: "Archivált tervezet; szerkesztéshez előbb állítsd vissza.", tone: "muted" };
  if (c.delivery_state === "scheduled") return { stage: "scheduled", label: CAMPAIGN_STAGE_LABEL.scheduled, step: 3, next: "Mentett ütemezés. Automatikus ügyfélküldés nincs bekapcsolva; csak az esedékes TESZT küldhető kézi jóváhagyással.", tone: "success" };
  if (c.delivery_state === "paused") return { stage: "paused", label: CAMPAIGN_STAGE_LABEL.paused, step: 3, next: "Az ütemezés szünetel; a Folytatás gombbal állítható vissza.", tone: "warning" };
  if (c.delivery_state === "stopped") return { stage: "stopped", label: CAMPAIGN_STAGE_LABEL.stopped, step: 3, next: "Leállított ütemezés; módosítás után új jóváhagyás kell.", tone: "muted" };
  if (c.status === "prechecked" || c.prechecked_at) return { stage: "prechecked", label: CAMPAIGN_STAGE_LABEL.prechecked, step: 2, next: "Nézd át az előnézetet, küldj TESZT-levelet, majd mentsd az ütemezést. Az ellenőrzés nem küldési engedély.", tone: "info" };
  return { stage: "draft", label: CAMPAIGN_STAGE_LABEL.draft, step: 1, next: "Jelöld ki a címzetteket, majd az ellenőrzés gombbal mentsd őket.", tone: "muted" };
}

export function campaignOverview(rows: CampaignListRow[] | undefined | null) {
  const counts: Record<CampaignStage, number> = { draft: 0, prechecked: 0, scheduled: 0, paused: 0, stopped: 0, archived: 0 };
  const open: (CampaignListRow & ReturnType<typeof campaignLifecycle>)[] = [];
  for (const r of rows ?? []) {
    const l = campaignLifecycle(r);
    counts[l.stage]++;
    if (l.stage !== "archived") open.push({ ...r, ...l });
  }
  open.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return { counts, open, active: open.length };
}

// ───────────── Eredmények közérthetően ─────────────

export function marketingResultLines(input: {
  mail: { contacted: number; replied: number; rate: number | null } | null;
  newCompanies30: number | null;
  handoff30: number | null;
  emails7: number | null;
}): string[] {
  const lines: string[] = [];
  const m = input.mail;
  if (!m) lines.push("A heti válaszarány most nem igazolható (a napi adat hiányos vagy nem töltődött be).");
  else if (m.contacted === 0) lines.push("Az elmúlt 7 napban nincs tárolt saját megkeresés, ezért válaszarány sem számolható.");
  else lines.push(`Az elmúlt 7 napban ${m.contacted} saját megkeresésből ${m.replied} esetben érkezett külső válasz (${m.rate ?? 0}%). A szám a tárolt saját levelezésen alapul, nem teljes Gmail-történet.`);
  if (input.newCompanies30 != null && input.handoff30 != null)
    lines.push(`Az elmúlt 30 napban ${input.newCompanies30} új cég került a CRM-be, és ${input.handoff30} cég került át Saleshez.`);
  if (input.emails7 != null) lines.push(`Az elmúlt 7 napban ${input.emails7} tárolt email volt a rendszerben (bejövő és kimenő együtt).`);
  return lines;
}

// ───────────── Scarlet gyorskérdések ─────────────

/** Csak ezek az azonosítók tölthetnek elő kérdést a Scarlet chatbe; a kérdés nem indul el magától. */
export const SCARLET_QUICK_IDS = ["mkt-today", "mkt-replies", "mkt-handoff", "channels"] as const;
export type ScarletQuickId = (typeof SCARLET_QUICK_IDS)[number];
export function isScarletQuickId(v: unknown): v is ScarletQuickId {
  return typeof v === "string" && (SCARLET_QUICK_IDS as readonly string[]).includes(v);
}

export function companyTabFromSearch(v: unknown): CompanyTab | undefined {
  return typeof v === "string" && (COMPANY_TABS as readonly string[]).includes(v) ? (v as CompanyTab) : undefined;
}
