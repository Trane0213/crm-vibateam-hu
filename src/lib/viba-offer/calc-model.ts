/**
 * P6 — Saját VIBA-ajánlat kalkulációs profiljai (családi ház m², rezsióradíj, egyedi/VBF).
 * Tiszta, determinisztikus motor: ugyanazt használja az ajánlat „Kalkuláció” panelje és Timothy.
 * Pénz belül fillérben, százalék bázispontban (P3 `money.ts`). A motor SOHA nem tölt ki árat, normát vagy
 * felárat magától: minden díjat a felhasználó ad meg forrásmegjelöléssel; hiányzó díj = hiányzó ár.
 *
 * Fogalmak (ne keverd):
 *  - eladási ár (basis "sell"): változatlanul kerül az ajánlatba, tartalék/árrés/fedezet nem kerül rá;
 *  - önköltség (basis "cost"): tartalék (külön lépés), majd KIFEJEZETTEN megadott árrés VAGY fedezet;
 *  - árrés (markup) = haszon / önköltség → eladás = önköltség × (1 + árrés);
 *  - fedezet (margin) = haszon / eladási ár → eladás = önköltség / (1 − fedezet).
 */
import { addPct, fromFiller, grossUpMargin, roundToStep, toBp, toFiller, type RoundingMode } from "@/lib/pricing/money";

export type OfferProfile = "house_sqm" | "hourly" | "custom";
export type OfferMode = "material_labor" | "labor_only";
export type RateBasis = "sell" | "cost";
export type RateSource = "manual" | "historical_quote" | "reference";
export type QtyStatus = "measured" | "estimated" | "unknown";
export type Rate = { huf: number; basis: RateBasis; source: RateSource; note: string };

export const PROFILE_LABEL: Record<OfferProfile, string> = { house_sqm: "Családi ház – m² csomag", hourly: "Rezsióradíjas munka", custom: "Egyedi / VBF-hibajavítás" };
export const MODE_LABEL: Record<OfferMode, string> = { material_labor: "Teljes kivitelezés (anyag + munkadíj)", labor_only: "Alvállalkozói / csak munkadíj" };
export const SOURCE_LABEL: Record<RateSource, string> = { manual: "Saját megadás", historical_quote: "Korábbi VIBA-ajánlat", reference: "Nem igazolt referencia" };
export const QTY_LABEL: Record<QtyStatus, string> = { measured: "felmért / tervből", estimated: "becsült", unknown: "ismeretlen" };

export type LineInput = { id: string; group?: string; name: string; unit: string; qty: number | null; qtyStatus: QtyStatus; material?: Rate | null; labor?: Rate | null; ref?: string };

export type Uplift = { kind: "none" } | { kind: "markup"; pct: number } | { kind: "margin"; pct: number };
export type Commercial = { contingencyPct: number; uplift: Uplift; roundingStepHuf: number; roundingMode: RoundingMode };

export const HOUSE_CONTENT = [
  { key: "outlets", label: "Kiállások (dugalj, kapcsoló, lámpahely)" },
  { key: "distribution", label: "Elosztó (lakáselosztó, védelmek)" },
  { key: "cabling", label: "Kábelezés, csövezés, vésés" },
  { key: "devices", label: "Szerelvények (dugaljak, kapcsolók)" },
  { key: "low_voltage", label: "Gyengeáram (adat, TV, kaputelefon, riasztó)" },
  { key: "metering", label: "Mérőhely, hálózati bővítés, szolgáltatói ügyintézés" },
] as const;
export type HouseContentKey = (typeof HOUSE_CONTENT)[number]["key"];
export type ContentDecision = "included" | "excluded" | "unknown";

export type HouseInput = {
  profile: "house_sqm"; areaM2: number | null; areaStatus: QtyStatus; packageLabel: string; packageVersion: string;
  content: Partial<Record<HouseContentKey, ContentDecision>>; exclusionsNote: string;
  materialPerM2: Rate | null; laborPerM2: Rate | null; conditionsNote: string; detailedPlan: boolean; extras: LineInput[];
};
export type Band = "workday" | "night" | "weekend";
export const BAND_LABEL: Record<Band, string> = { workday: "munkanap", night: "éjszaka", weekend: "hétvége/ünnep" };
export type HourlyInput = {
  profile: "hourly"; period: string;
  roles: { id: string; label: string; headcount: number; rate: Rate | null }[];
  bands: { band: Band; hours: number | null; qtyStatus: QtyStatus; surchargePct: number | null }[];
  visits: number; minHoursPerVisit: number | null;
  travel: { include: boolean; unit: "alkalom" | "km"; qty: number | null; rate: Rate | null };
  urgency: { include: boolean; pct: number | null };
  materialsAllowed: boolean; extras: LineInput[];
};
export type Priority = "urgent" | "scheduled" | "unknown";
export const PRIORITY_SECTION: Record<Priority, string> = { urgent: "Sürgős javítások", scheduled: "Ütemezhető javítások", unknown: "Besorolandó javítások" };
export type Defect = { id: string; ref: string; text: string; priority: Priority; evidence?: string };
export type Scenario = "preliminary" | "post_survey" | "itemized";
export const SCENARIO_LABEL: Record<Scenario, string> = { preliminary: "Előzetes (bejárás előtt)", post_survey: "Bejárás utáni", itemized: "Tételes hibajavítás" };
export type CustomInput = {
  profile: "custom"; scenario: Scenario; surveyDone: boolean; surveyNote: string;
  defects: Defect[]; tasks: (LineInput & { defectId: string | null })[];
  surveyFee: { include: boolean; qty: number | null; rate: Rate | null };
  measurement: { include: boolean; qty: number | null; rate: Rate | null; note: string };
  expertRequired: boolean; outageNote: string;
};
export type ProfileInput = HouseInput | HourlyInput | CustomInput;
export type CalcInput = { mode: OfferMode; commercial: Commercial; profile: ProfileInput };

export type LineStatus = "priced" | "estimated" | "review" | "missing_price" | "unknown_qty" | "zero_qty" | "blocked" | "excluded_mode";
export const STATUS_LABEL: Record<LineStatus, string> = {
  priced: "árazva", estimated: "árazva, becsült mennyiség", review: "nem igazolt referencia – tudomásul veendő", missing_price: "hiányzó ár",
  unknown_qty: "ismeretlen mennyiség", zero_qty: "0 mennyiség – nem kerül az ajánlatba", blocked: "hibás/hiányos díjadat", excluded_mode: "anyagtétel – munkadíjas módban kimarad",
};
export const WRITABLE: readonly LineStatus[] = ["priced", "estimated", "review"];

export type Component = { unitFiller: number; costFiller: number | null; contingencyFiller: number; basis: RateBasis; source: RateSource; note: string } | null;
export type LineResult = {
  id: string; section: string; name: string; unit: string; qty: number | null; qtyStatus: QtyStatus; ref: string | null; status: LineStatus;
  material: Component; labor: Component; unitHuf: number; totalHuf: number; materialTotalHuf: number; laborTotalHuf: number; trace: string[]; issues: string[];
};
export type Issue = { level: "blocking" | "warning" | "info"; text: string };
export type CalcResult = {
  profile: OfferProfile; mode: OfferMode; lines: LineResult[]; sections: { name: string; totalHuf: number }[];
  totals: { netHuf: number; materialHuf: number; laborHuf: number; reviewHuf: number; writableLines: number; openLines: number; zeroLines: number };
  commercial: { sellBasisHuf: number; costBasisSellHuf: number; costHuf: number; contingencyHuf: number; profitHuf: number; marginBp: number | null; markupBp: number | null; uplift: Uplift; contingencyPct: number };
  issues: Issue[]; scope: { included: string[]; excluded: string[]; conditional: string[]; questions: string[] }; calcId: string;
};

const huf = (f: number) => `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(fromFiller(f))} Ft`;
const pct = (bp: number) => `${(bp / 100).toLocaleString("hu-HU", { maximumFractionDigits: 2 })}%`;

export function validQty(q: number | null): boolean {
  return q == null || (Number.isFinite(q) && q >= 0 && q <= 1_000_000 && Math.abs(q * 100 - Math.round(q * 100)) < 1e-6);
}

type Ctx = { c: Commercial; mode: OfferMode };
function component(rate: Rate | null | undefined, label: string, ctx: Ctx, multipliersBp: { label: string; bp: number }[], trace: string[], issues: string[]): { comp: Component; state: "ok" | "missing" | "blocked" | "review" } {
  if (!rate) { issues.push(`${label}: nincs megadott díj`); return { comp: null, state: "missing" }; }
  if (!Number.isFinite(rate.huf) || rate.huf <= 0 || rate.huf > 100_000_000) { issues.push(`${label}: érvénytelen díj`); return { comp: null, state: "blocked" }; }
  if (!rate.note.trim()) { issues.push(`${label}: a díj forrása (megjegyzés) hiányzik`); return { comp: null, state: "blocked" }; }
  const src = `${SOURCE_LABEL[rate.source]}: ${rate.note.trim()}`;
  let unit: number, cost: number | null = null, cont = 0;
  if (rate.basis === "sell") {
    unit = toFiller(rate.huf);
    trace.push(`${label}: ${huf(unit)} eladási egységár (${src}); tartalék/árrés/fedezet nem kerül rá`);
  } else {
    const u = ctx.c.uplift;
    if (u.kind === "none") { issues.push(`${label}: önköltség-alapú díjhoz kifejezett árrés vagy fedezet kell`); return { comp: null, state: "blocked" }; }
    cost = toFiller(rate.huf);
    const withCont = addPct(cost, toBp(ctx.c.contingencyPct)); cont = withCont - cost;
    unit = u.kind === "markup" ? addPct(withCont, toBp(u.pct)) : grossUpMargin(withCont, toBp(u.pct));
    trace.push(`${label}: önköltség ${huf(cost)} (${src}) → tartalék ${pct(toBp(ctx.c.contingencyPct))} = ${huf(withCont)} → ${u.kind === "markup" ? `árrés ${pct(toBp(u.pct))} (× (1 + árrés))` : `fedezet ${pct(toBp(u.pct))} (÷ (1 − fedezet))`} = ${huf(unit)}`);
  }
  for (const m of multipliersBp) { const before = unit; unit = addPct(unit, m.bp); trace.push(`${label}: ${m.label} ${pct(m.bp)}: ${huf(before)} → ${huf(unit)}`); }
  const rounded = roundToStep(unit, ctx.c.roundingStepHuf, ctx.c.roundingMode);
  if (rounded !== unit) trace.push(`${label}: kerekítés ${ctx.c.roundingStepHuf} Ft-ra (${ctx.c.roundingMode}): ${huf(unit)} → ${huf(rounded)}`);
  return { comp: { unitFiller: rounded, costFiller: cost, contingencyFiller: cont, basis: rate.basis, source: rate.source, note: rate.note.trim() }, state: rate.source === "reference" ? "review" : "ok" };
}

type BuildLine = LineInput & { section: string; multipliers?: { label: string; bp: number }[]; materialsBlocked?: string | null; extraIssues?: string[]; blockedReasons?: string[]; forceEstimated?: boolean };
function priceLine(l: BuildLine, ctx: Ctx): LineResult {
  const trace: string[] = [], issues: string[] = [...(l.extraIssues ?? [])];
  const qtyStatus: QtyStatus = l.forceEstimated && l.qtyStatus === "measured" ? "estimated" : l.qtyStatus;
  const base = { id: l.id, section: l.section, name: l.name.trim(), unit: l.unit.trim(), qty: l.qty, qtyStatus, ref: l.ref?.trim() || null };
  const empty = { material: null, labor: null, unitHuf: 0, totalHuf: 0, materialTotalHuf: 0, laborTotalHuf: 0 };
  if (l.blockedReasons?.length) return { ...base, ...empty, status: "blocked", trace, issues: [...issues, ...l.blockedReasons] };
  if (!base.name || !base.unit) return { ...base, ...empty, status: "blocked", trace, issues: [...issues, "Megnevezés vagy mértékegység hiányzik"] };
  if (!validQty(l.qty)) return { ...base, ...empty, status: "blocked", trace, issues: [...issues, "Érvénytelen mennyiség (0 vagy pozitív, legfeljebb 2 tizedes)"] };
  if (qtyStatus === "unknown" || l.qty == null) return { ...base, ...empty, status: "unknown_qty", trace, issues: [...issues, "A mennyiség nem ismert — felmérés/terv szükséges"] };
  if (l.qty === 0) return { ...base, ...empty, status: "zero_qty", trace: ["0 mennyiség: a sor nem kerül az ajánlatba, árat nem számolunk"], issues };
  const hasMat = !!l.material, wantsMat = ctx.mode === "material_labor" && !l.materialsBlocked;
  if (hasMat && !wantsMat) trace.push(ctx.mode === "labor_only" ? "Anyag: alvállalkozói (csak munkadíjas) módban nem része az árnak" : `Anyag: ${l.materialsBlocked}`);
  if (!l.labor && (!hasMat || !wantsMat)) {
    if (hasMat && !wantsMat) return { ...base, ...empty, status: "excluded_mode", trace, issues };
    return { ...base, ...empty, status: "missing_price", trace, issues: [...issues, "Nincs megadott anyag- vagy munkadíj"] };
  }
  const states: string[] = [];
  let material: Component = null, labor: Component = null;
  if (hasMat && wantsMat) { const r = component(l.material, "Anyag", ctx, [], trace, issues); material = r.comp; states.push(r.state); }
  if (l.labor !== undefined && l.labor !== null) { const r = component(l.labor, "Munkadíj", ctx, l.multipliers ?? [], trace, issues); labor = r.comp; states.push(r.state); }
  const status: LineStatus = states.includes("blocked") ? "blocked" : states.includes("missing") ? "missing_price" : states.includes("review") ? "review" : qtyStatus === "estimated" ? "estimated" : "priced";
  const q = l.qty;
  const tot = (c: Component) => (c ? Math.round(c.unitFiller * q) : 0);
  const mt = tot(material), lt = tot(labor), unit = (material?.unitFiller ?? 0) + (labor?.unitFiller ?? 0);
  if (states.every((s) => s === "ok" || s === "review")) trace.push(`Sorösszeg: ${q} ${base.unit} × ${huf(unit)} = ${huf(mt + lt)}${qtyStatus === "estimated" ? " (becsült mennyiség)" : ""}`);
  const priced = WRITABLE.includes(status);
  return { ...base, status, material, labor, unitHuf: priced ? fromFiller(unit) : 0, totalHuf: priced ? fromFiller(mt + lt) : 0, materialTotalHuf: priced ? fromFiller(mt) : 0, laborTotalHuf: priced ? fromFiller(lt) : 0, trace, issues };
}

function houseLines(p: HouseInput, issues: Issue[], scope: CalcResult["scope"]): BuildLine[] {
  const label = p.packageLabel.trim(), version = p.packageVersion.trim();
  const unknown = HOUSE_CONTENT.filter((c) => (p.content[c.key] ?? "unknown") === "unknown");
  const lineIssues: string[] = [];
  if (!label || !version) lineIssues.push("A VIBA m²-csomag neve és változata kötelező (nincs jóváhagyott csomagtörzs)");
  if (unknown.length) lineIssues.push(`Csomagtartalom nincs rögzítve: ${unknown.map((u) => u.label).join(", ")}`);
  if (!p.conditionsNote.trim()) lineIssues.push("A fajlagos m²-ár csak dokumentált feltételekkel használható — feltételek hiányoznak");
  for (const c of HOUSE_CONTENT) {
    const d = p.content[c.key] ?? "unknown";
    if (d === "included") scope.included.push(c.label); else if (d === "excluded") scope.excluded.push(c.label); else scope.questions.push(`Tartalmazza-e az ajánlat: ${c.label}?`);
  }
  if (p.exclusionsNote.trim()) scope.excluded.push(p.exclusionsNote.trim());
  if (p.areaStatus === "estimated") scope.conditional.push("Az alapterület becsült; a végleges ár a felmért alapterület szerint módosulhat.");
  if (p.detailedPlan) issues.push({ level: "warning", text: "Részletes villamos terv áll rendelkezésre: a m²-szorzat becslés, tételes ellenőrzés javasolt." });
  scope.conditional.push("A m²-alapú ár becslés; a tételes műszaki tartalom eltérése esetén az ár módosulhat.");
  const name = `Villamos szerelés – ${label || "m² csomag"}${version ? ` (${version})` : ""}`;
  return [
    { id: "house_m2", section: "Alapcsomag (m²)", name, unit: "m2", qty: p.areaM2, qtyStatus: p.areaStatus, material: p.materialPerM2, labor: p.laborPerM2, blockedReasons: lineIssues, ref: "m² csomag" },
    ...p.extras.map((e) => ({ ...e, section: e.group?.trim() || "Többlettételek" })),
  ];
}

function hourlyLines(p: HourlyInput, issues: Issue[], scope: CalcResult["scope"]): BuildLine[] {
  const out: BuildLine[] = [];
  if (!p.roles.length) issues.push({ level: "blocking", text: "Legalább egy szerepkört (pl. villanyszerelő) meg kell adni óradíjjal." });
  if (!Number.isInteger(p.visits) || p.visits < 1 || p.visits > 1000) issues.push({ level: "blocking", text: "A kiszállások száma 1 és 1000 közötti egész szám." });
  const totalHours = p.bands.reduce((a, b) => a + (b.hours ?? 0), 0);
  const unknownBand = p.bands.some((b) => b.qtyStatus === "unknown" || b.hours == null);
  const urgencyBp = p.urgency.include ? (p.urgency.pct == null ? null : toBp(p.urgency.pct)) : 0;
  if (p.urgency.include && urgencyBp == null) issues.push({ level: "blocking", text: "Sürgősségi felár be van kapcsolva, de mértéke nincs megadva." });
  let minTopUp = 0;
  if (p.minHoursPerVisit != null && !unknownBand) {
    const min = p.minHoursPerVisit * Math.max(1, p.visits);
    if (totalHours < min) minTopUp = Math.round((min - totalHours) * 100) / 100;
  }
  for (const r of p.roles) {
    const hc = Number.isInteger(r.headcount) && r.headcount >= 1 && r.headcount <= 100 ? r.headcount : null;
    for (const b of p.bands) {
      if (b.hours === 0) continue;
      const blocked: string[] = [], ex: string[] = [];
      if (hc == null) blocked.push("Érvénytelen létszám (1–100 fő)");
      const mult: { label: string; bp: number }[] = [];
      let missingSurcharge = false;
      if (b.band !== "workday") { if (b.surchargePct == null) { missingSurcharge = true; ex.push(`${BAND_LABEL[b.band]} felár nincs megadva`); } else mult.push({ label: `${BAND_LABEL[b.band]} felár`, bp: toBp(b.surchargePct) }); }
      if (urgencyBp) mult.push({ label: "sürgősségi felár", bp: urgencyBp });
      if (urgencyBp == null) { missingSurcharge = true; ex.push("sürgősségi felár mértéke hiányzik"); }
      const qty = b.hours == null || hc == null ? null : Math.round(b.hours * hc * 100) / 100;
      out.push({ id: `role_${r.id}_${b.band}`, section: "Rezsióradíj", name: `Rezsióradíj – ${r.label.trim() || "szerepkör"} – ${BAND_LABEL[b.band]}${hc && hc > 1 ? ` (${hc} fő)` : ""}`, unit: "óra", qty, qtyStatus: b.qtyStatus,
        labor: missingSurcharge ? null : r.rate, multipliers: mult, extraIssues: ex, blockedReasons: blocked });
    }
    if (minTopUp > 0 && hc != null) out.push({ id: `role_${r.id}_min`, section: "Rezsióradíj", name: `Minimális kiszállási időkeret kiegészítése – ${r.label.trim() || "szerepkör"}`, unit: "óra", qty: Math.round(minTopUp * hc * 100) / 100, qtyStatus: "measured", labor: r.rate, multipliers: urgencyBp ? [{ label: "sürgősségi felár", bp: urgencyBp }] : [] });
  }
  if (minTopUp > 0) scope.included.push(`Minimális kiszállási időkeret: ${p.minHoursPerVisit} óra/kiszállás.`);
  if (p.travel.include) out.push({ id: "travel", section: "Kiszállás", name: p.travel.unit === "km" ? "Kiszállási díj (km)" : "Kiszállási díj", unit: p.travel.unit, qty: p.travel.qty, qtyStatus: p.travel.qty == null ? "unknown" : "measured", labor: p.travel.rate });
  for (const e of p.extras) out.push({ ...e, section: e.group?.trim() || "Anyag és egyéb", materialsBlocked: p.materialsAllowed ? null : "a szerződés szerint az anyag nem számolható külön" });
  if (p.period.trim()) scope.included.push(`Elszámolási időszak: ${p.period.trim()}.`);
  scope.included.push("Elszámolás a ténylegesen igazolt munkaórák alapján, a megadott óradíjakkal.");
  if (unknownBand || p.bands.some((b) => b.qtyStatus === "estimated")) scope.conditional.push("Az óraszám becsült; a számla a ténylegesen igazolt órák szerint készül.");
  if (!p.materialsAllowed) scope.excluded.push("Anyag – külön megrendelés vagy megrendelői biztosítás szerint.");
  return out;
}

function customLines(p: CustomInput, issues: Issue[], scope: CalcResult["scope"]): BuildLine[] {
  const out: BuildLine[] = [];
  const preliminary = p.scenario === "preliminary";
  if (!preliminary && !p.surveyDone) issues.push({ level: "blocking", text: `${SCENARIO_LABEL[p.scenario]} forgatókönyvhöz megtörtént helyszíni bejárás kell; addig csak előzetes ajánlat adható.` });
  if (!preliminary && p.surveyDone && !p.surveyNote.trim()) issues.push({ level: "blocking", text: "A bejárás idejét/résztvevőit röviden rögzíteni kell (bizonyíték)." });
  const byId = new Map(p.defects.map((d) => [d.id, d]));
  for (const t of p.tasks) {
    const d = t.defectId ? byId.get(t.defectId) : undefined;
    const blocked: string[] = [];
    if (t.defectId && !d) blocked.push("A hivatkozott hibapont nem létezik");
    if (p.scenario === "itemized" && t.qtyStatus !== "measured") blocked.push("Tételes hibajavításnál felmért mennyiség kell");
    out.push({ ...t, ref: d ? `${d.ref}. pont` : t.ref, name: d ? `${d.ref}. pont – ${t.name}` : t.name, section: d ? PRIORITY_SECTION[d.priority] : t.group?.trim() || "Egyéb munkák", forceEstimated: preliminary, blockedReasons: blocked });
  }
  for (const d of p.defects) {
    const has = p.tasks.some((t) => t.defectId === d.id);
    if (!has) { scope.conditional.push(`${d.ref}. pont (${d.text.slice(0, 120)}): javítási tétel a felmérés után kerül meghatározásra.`); if (p.scenario === "itemized") issues.push({ level: "blocking", text: `${d.ref}. hibaponthoz nincs javítási tétel (tételes forgatókönyv).` }); }
    else scope.included.push(`${d.ref}. pont javítása (${PRIORITY_SECTION[d.priority].toLowerCase()}): ${d.text.slice(0, 160)}`);
    if (d.priority === "unknown") scope.questions.push(`${d.ref}. pont: sürgős (biztonsági) vagy ütemezhető javítás?`);
  }
  if (p.surveyFee.include) out.push({ id: "survey_fee", section: "Felmérés és kiszállás", name: "Helyszíni felmérés és kiszállás", unit: "alkalom", qty: p.surveyFee.qty, qtyStatus: p.surveyFee.qty == null ? "unknown" : "measured", labor: p.surveyFee.rate });
  if (p.measurement.include) out.push({ id: "measurement", section: "Mérés és dokumentáció", name: "Javítás utáni ellenőrző mérés és dokumentálás", unit: "alkalom", qty: p.measurement.qty, qtyStatus: p.measurement.qty == null ? "unknown" : "measured", labor: p.measurement.rate });
  if (p.measurement.include && p.measurement.note.trim()) scope.included.push(`Mérés és dokumentálás: ${p.measurement.note.trim()}`);
  if (preliminary) scope.conditional.push("Előzetes ajánlat: a végleges műszaki megoldás és mennyiség a helyszíni bejárás után véglegesíthető; a mennyiségek becsültek.");
  if (p.expertRequired) scope.conditional.push("A javítás utáni felülvizsgálatot erre jogosult villamos biztonsági felülvizsgáló végzi.");
  if (p.outageNote.trim()) scope.conditional.push(`Áramszünet: ${p.outageNote.trim()}`); else scope.questions.push("Szükséges-e és mikor biztosítható áramszünet a javításokhoz?");
  if (!p.defects.length) issues.push({ level: "warning", text: "Nincs rögzített hibapont: a jegyzőkönyv szövegéből a „Hibapontok kinyerése” vagy kézi rögzítés szükséges." });
  return out;
}

/** Stabil, szinkron azonosító (FNV-1a 32 bit) — csak a számítás bemenetének azonosítására, nem biztonsági célra. */
export function stableId(v: unknown): string {
  const s = JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function calculateVibaOffer(input: CalcInput): CalcResult {
  const { commercial: c, mode } = input;
  const issues: Issue[] = [];
  if (!Number.isFinite(c.contingencyPct) || c.contingencyPct < 0 || c.contingencyPct > 100) throw new Error("A tartalék 0 és 100% közötti lehet.");
  if (c.uplift.kind !== "none" && (!Number.isFinite(c.uplift.pct) || c.uplift.pct < 0 || c.uplift.pct >= (c.uplift.kind === "margin" ? 95 : 500))) throw new Error(c.uplift.kind === "margin" ? "A fedezet 0 és 95% közötti lehet." : "Az árrés 0 és 500% közötti lehet.");
  if (!Number.isFinite(c.roundingStepHuf) || c.roundingStepHuf < 1 || c.roundingStepHuf > 100_000 || !Number.isInteger(c.roundingStepHuf)) throw new Error("Érvénytelen kerekítési lépcső.");
  const scope: CalcResult["scope"] = { included: [], excluded: [], conditional: [], questions: [] };
  const p = input.profile;
  const built = p.profile === "house_sqm" ? houseLines(p, issues, scope) : p.profile === "hourly" ? hourlyLines(p, issues, scope) : customLines(p, issues, scope);
  const ids = new Set<string>();
  for (const b of built) { if (ids.has(b.id)) throw new Error(`Ismétlődő sorazonosító: ${b.id}`); ids.add(b.id); }
  const ctx: Ctx = { c, mode };
  const lines = built.map((b) => priceLine(b, ctx));
  if (mode === "labor_only") scope.excluded.push("Anyag: a megrendelő biztosítja (az ajánlat csak munkadíjat tartalmaz).");
  if (lines.some((l) => l.status === "estimated")) scope.conditional.push("A „becsült mennyiség” jelölésű tételek elszámolása a tényleges mennyiség szerint történik.");
  const sectionMap = new Map<string, number>();
  let mat = 0, lab = 0, sellBasis = 0, costSell = 0, cost = 0, cont = 0;
  for (const l of lines) {
    if (!WRITABLE.includes(l.status)) continue;
    sectionMap.set(l.section, (sectionMap.get(l.section) ?? 0) + toFiller(l.totalHuf));
    mat += toFiller(l.materialTotalHuf); lab += toFiller(l.laborTotalHuf);
    for (const comp of [l.material, l.labor]) {
      if (!comp) continue;
      const t = Math.round(comp.unitFiller * (l.qty ?? 0));
      if (comp.costFiller == null) sellBasis += t;
      else { costSell += t; cost += Math.round(comp.costFiller * (l.qty ?? 0)); cont += Math.round(comp.contingencyFiller * (l.qty ?? 0)); }
    }
  }
  const profit = costSell - cost - cont;
  const open = lines.filter((l) => ["missing_price", "unknown_qty", "blocked"].includes(l.status));
  if (open.length) issues.push({ level: "warning", text: `${open.length} sor nem árazható (hiányzó ár, mennyiség vagy díjadat) — ezek nem kerülnek az ajánlatba, és a végösszeg nem teljes.` });
  if (lines.some((l) => l.status === "review")) issues.push({ level: "warning", text: "Nem igazolt referenciadíjat használó sor van: tételenként tudomásul kell venni, mielőtt az ajánlatba kerül." });
  if (lines.some((l) => l.status === "zero_qty")) issues.push({ level: "info", text: "0 mennyiségű sorok nem kerülnek az ajánlatba." });
  if (lines.some((l) => l.material?.source === "manual" || l.labor?.source === "manual")) issues.push({ level: "info", text: "A díjak saját megadásúak: jóváhagyott VIBA-ártörzs még nincs (tulajdonosi döntés)." });
  return {
    profile: p.profile, mode, lines,
    sections: [...sectionMap.entries()].map(([name, f]) => ({ name, totalHuf: fromFiller(f) })),
    totals: { netHuf: fromFiller(mat + lab), materialHuf: fromFiller(mat), laborHuf: fromFiller(lab), reviewHuf: lines.filter((l) => l.status === "review").reduce((a, l) => a + l.totalHuf * 100, 0) / 100, writableLines: lines.filter((l) => WRITABLE.includes(l.status)).length, openLines: open.length, zeroLines: lines.filter((l) => l.status === "zero_qty").length },
    commercial: { sellBasisHuf: fromFiller(sellBasis), costBasisSellHuf: fromFiller(costSell), costHuf: fromFiller(cost), contingencyHuf: fromFiller(cont), profitHuf: fromFiller(profit),
      marginBp: costSell > 0 ? Math.round((profit * 10000) / costSell) : null, markupBp: cost + cont > 0 ? Math.round((profit * 10000) / (cost + cont)) : null, uplift: c.uplift, contingencyPct: c.contingencyPct },
    issues, scope, calcId: stableId(input),
  };
}

export const blockingIssues = (r: CalcResult) => r.issues.filter((i) => i.level === "blocking");

/** Üres kiinduló bemenet: SEMMILYEN díj, felár, norma vagy csomagtartalom nincs előre kitöltve. */
export function emptyProfile(p: OfferProfile): ProfileInput {
  if (p === "house_sqm") return { profile: p, areaM2: null, areaStatus: "unknown", packageLabel: "", packageVersion: "", content: {}, exclusionsNote: "", materialPerM2: null, laborPerM2: null, conditionsNote: "", detailedPlan: false, extras: [] };
  if (p === "hourly") return { profile: p, period: "", roles: [{ id: "r1", label: "villanyszerelő", headcount: 1, rate: null }], bands: [{ band: "workday", hours: null, qtyStatus: "unknown", surchargePct: null }], visits: 1, minHoursPerVisit: null, travel: { include: false, unit: "alkalom", qty: null, rate: null }, urgency: { include: false, pct: null }, materialsAllowed: true, extras: [] };
  return { profile: p, scenario: "preliminary", surveyDone: false, surveyNote: "", defects: [], tasks: [], surveyFee: { include: true, qty: 1, rate: null }, measurement: { include: true, qty: 1, rate: null, note: "" }, expertRequired: false, outageNote: "" };
}
export const DEFAULT_COMMERCIAL: Commercial = { contingencyPct: 0, uplift: { kind: "none" }, roundingStepHuf: 1, roundingMode: "half_up" };
