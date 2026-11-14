/**
 * P3 — determinisztikus, nyomon követhető árazási motor (kapott költségvetés).
 * Ugyanarra a bemenetre mindig ugyanaz a kimenet; minden lépés emberileg visszaszámolható nyomvonallal.
 * önköltség-alapú ár: alap → járulék → tartalék → célfedezet (önköltség / (1 − fedezet)) → kerekítés;
 * eladási referenciaár (korábbi ajánlat): alap → tartalék → kerekítés (fedezetet már tartalmaz, ráépítés nincs).
 * A tartalék és a fedezet külön, egyszer számolt tétel.
 */
import type { BudgetRow, PriceCell, SheetLayout } from "./budget-extract";
import { addPct, fromFiller, grossUpMargin, hoursTimesRate, lineTotal, roundToStep, toBp, toFiller } from "./money";
import { norm } from "./normalize";
import { eligibility, indexSources, matchRow, textSimilarity, SOURCE_LABEL, SOURCE_RANK, type Candidate, type MatchCategory, type PriceComponent, type PriceSourceItem, type SourceIndex } from "./price-sources";
import type { CalculationProfile } from "./profiles";

export type LineStatus = "priced" | "review" | "missing" | "blocked" | "zero_qty" | "excluded" | "excluded_review" | "existing_price";
export type Confidence = "source" | "reference" | "estimate" | "manual";
export type ComponentResult = {
  component: PriceComponent; status: "priced" | "review" | "missing" | "blocked" | "removed";
  reason: string | null; category: MatchCategory | "manual" | null; score: number | null;
  source: { id: string; kind: PriceSourceItem["kind"] | "manual_override"; rank: number | null; label: string; name: string; priceDate: string | null; provenance: PriceSourceItem["provenance"] | null; basis: "cost" | "sell" } | null;
  candidates: { id: string; kind: string; name: string; unitPriceHuf: number | null; score: number }[];
  hours: number | null; rateHuf: number | null;
  steps: { label: string; filler: number | null }[]; unitFiller: number | null; confidence: Confidence | null;
};
export type LineResult = {
  key: string; sheet: string; row: number; itemNo: string | null; name: string; section: string; qty: number | null; unit: string; unitRaw: string | null;
  status: LineStatus; reasons: string[]; flags: string[];
  material: ComponentResult | null; labor: ComponentResult | null;
  unitSellHuf: number | null; materialTotalHuf: number; laborTotalHuf: number; lineTotalHuf: number | null;
  writes: { address: string; role: PriceCell["role"]; valueHuf: number }[];
};
export type PricingTotals = { lines: number; byStatus: Record<LineStatus, number>; materialHuf: number; laborHuf: number; netHuf: number; existingHuf: number };
export type PricingResult = { profile: CalculationProfile; asOf: string; currency: "HUF"; vat: "net"; lines: LineResult[]; totals: PricingTotals; blockers: string[]; warnings: string[] };

export type Selector = { rows?: string[]; sheet?: string; section?: string; name?: string; status?: LineStatus[] };
export type Adjustment = {
  id: string; reason: string; requestedBy?: string | null; target: Selector;
  op: "contingency_pct" | "add_unit_amount" | "add_line_amount" | "set_unit_price" | "remove_component" | "exclude" | "include";
  component?: PriceComponent | "both"; pct?: number; amountHuf?: number;
};
export type AppliedAdjustment = { id: string; op: Adjustment["op"]; reason: string; requestedBy: string | null; rows: string[]; error: string | null };
export type PricingDiff = { changed: { key: string; name: string; before: { status: LineStatus; unitSellHuf: number | null; lineTotalHuf: number | null }; after: { status: LineStatus; unitSellHuf: number | null; lineTotalHuf: number | null } }[]; unchangedLines: number; before: PricingTotals; after: PricingTotals; deltaNetHuf: number };

type Directive = { contingencyBp: Partial<Record<PriceComponent, number>>; addUnit: Partial<Record<PriceComponent, number>>; setUnit: Partial<Record<PriceComponent, { filler: number; reason: string }>>; removed: Set<PriceComponent>; excluded: boolean; included: boolean };
const emptyDirective = (): Directive => ({ contingencyBp: {}, addUnit: {}, setUnit: {}, removed: new Set(), excluded: false, included: false });

const huf = (f: number) => `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(fromFiller(f))} Ft`;
const ALL_STATUS: LineStatus[] = ["priced", "review", "missing", "blocked", "zero_qty", "excluded", "excluded_review", "existing_price"];

function priceComponent(row: BudgetRow, comp: PriceComponent, idx: SourceIndex, p: CalculationProfile, asOf: string, d: Directive): ComponentResult {
  const base: ComponentResult = { component: comp, status: "missing", reason: null, category: null, score: null, source: null, candidates: [], hours: null, rateHuf: null, steps: [], unitFiller: null, confidence: null };
  if (d.removed.has(comp)) return { ...base, status: "removed", reason: "Kivéve kérésre (pl. már beszerzett).", unitFiller: 0, steps: [{ label: "Kivéve", filler: 0 }] };
  const manual = d.setUnit[comp];
  if (manual) {
    const unit = roundToStep(manual.filler, p.rounding.stepHuf, p.rounding.mode);
    return { ...base, status: "priced", category: "manual", score: 1, confidence: "manual", unitFiller: unit,
      source: { id: "manual", kind: "manual_override", rank: null, label: "Kézi egységár", name: manual.reason, priceDate: asOf, provenance: null, basis: "sell" },
      steps: [{ label: `Kézi egységár (${manual.reason})`, filler: manual.filler }, { label: `Kerekítés ${p.rounding.stepHuf} Ft-ra`, filler: unit }] };
  }
  const m = matchRow(idx, row.name, row.unitRaw ?? "", row.type, comp);
  const elig = (c: Candidate) => eligibility(c.item, asOf, p.maxPriceAgeDays, { allowHistorical: p.allowHistoricalAuto, allowUnapprovedTemplate: p.allowUnapprovedTemplate });
  const cands = m.candidates.map((c) => ({ id: c.item.id, kind: c.item.kind, name: c.item.name.slice(0, 160), unitPriceHuf: c.item.unitPriceHuf, score: Math.round(c.score * 1000) / 1000 }));
  const strong = m.candidates.filter((c) => c.score >= 0.925 && (c.item.unitPriceHuf != null || c.item.normHours != null));
  const accepted = strong.filter((c) => elig(c).ok);
  if (!accepted.length) {
    const top = m.candidates[0];
    if (!top) return { ...base, status: "missing", reason: "Nincs azonos mértékegységű, összevethető árforrás.", category: "missing", candidates: cands };
    const why = strong.length ? (elig(strong[0]) as { reason: string }).reason : m.category === "noPrice" ? "A legjobb egyezésnek nincs ára." : "Csak gyenge/javasolt egyezés — ellenőrizendő.";
    return { ...base, status: m.category === "missing" ? "missing" : "review", reason: why, category: m.category, score: top.score, candidates: cands };
  }
  const bestRank = Math.min(...accepted.map((c) => SOURCE_RANK[c.item.kind]));
  const group = accepted.filter((c) => SOURCE_RANK[c.item.kind] === bestRank).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const chosen = group[0];
  const priceKey = (c: Candidate) => `${c.item.unitPriceHuf ?? ""}|${c.item.normHours ?? ""}`;
  const rivals = group.filter((c) => c !== chosen && priceKey(c) !== priceKey(chosen) && (Math.abs(c.score - chosen.score) < 1e-5 || (chosen.score < 0.995 && chosen.score - c.score < 0.075)));
  let contextNote: string | null = null;
  if (rivals.length && row.context) {
    // Azonos nevű altételek (pl. „3x4 mm2”) szétválasztása a megelőző leíró tétel alapján — csak egyértelmű különbségnél.
    const scored = [chosen, ...rivals].map((c) => ({ c, s: c.item.context ? textSimilarity(row.context!, c.item.context) : 0 })).sort((a, b) => b.s - a.s);
    if (scored[0].s >= 0.6 && scored[0].s - (scored[1]?.s ?? 0) >= 0.2) { rivals.length = 0; contextNote = `Kontextus alapján választva (${row.context.slice(0, 80)} ↔ ${scored[0].c.item.context!.slice(0, 80)}, ${Math.round(scored[0].s * 100) / 100})`; group.splice(0, group.length, scored[0].c); }
  }
  if (rivals.length) return { ...base, status: "review", reason: `Azonos rangú, eltérő árú egyezések (${rivals.length + 1}) — választás szükséges.`, category: "ambiguous", score: chosen.score, candidates: cands };
  const it = group[0].item;
  const category: MatchCategory = group[0].score >= 0.995 ? "exact" : "strong";
  const src: ComponentResult["source"] = { id: it.id, kind: it.kind, rank: SOURCE_RANK[it.kind], label: SOURCE_LABEL[it.kind], name: it.name, priceDate: it.priceDate, provenance: it.provenance, basis: it.basis };
  const steps: ComponentResult["steps"] = [];
  if (contextNote) steps.push({ label: contextNote, filler: null });
  let filler: number, basis = it.basis, confidence: Confidence = SOURCE_RANK[it.kind] <= 2 ? "source" : "reference", hours: number | null = null, rate: number | null = null;
  if (comp === "labor" && it.unitPriceHuf == null && it.normHours != null) {
    if (p.laborRateHuf == null) return { ...base, status: "blocked", reason: "Normaórás tételhez óradíj szükséges a profilban.", category, score: group[0].score, source: src, candidates: cands };
    hours = it.normHours; rate = p.laborRateHuf; basis = p.laborRateBasis; filler = hoursTimesRate(hours, rate);
    if (it.normBasis !== "measured") confidence = "estimate";
    steps.push({ label: `${hours} óra/ME × ${rate} Ft/óra (${it.normBasis === "measured" ? "mért" : it.normBasis === "experience" ? "tapasztalati" : "visszaszámolt"} norma)`, filler });
  } else if (comp === "labor" && it.kind === "viba_historical_quote" && it.basis === "sell" && !it.fixed && p.historicalLaborPolicy === "rate_scaled") {
    if (p.laborRateHuf == null || p.historicalBaseRateHuf == null) return { ...base, status: "blocked", reason: "Óradíjas skálázáshoz óradíj és viszonyítási óradíj szükséges.", category, score: group[0].score, source: src, candidates: cands };
    hours = it.unitPriceHuf! / p.historicalBaseRateHuf; rate = p.laborRateHuf; filler = hoursTimesRate(hours, rate); confidence = "estimate";
    steps.push({ label: `Korábbi díj ${huf(toFiller(it.unitPriceHuf!))} ÷ ${p.historicalBaseRateHuf} Ft/óra feltételezett alapdíj = ${Math.round(hours * 10000) / 10000} óra (visszaszámolt, nem igazolt norma) × ${rate} Ft/óra`, filler });
  } else {
    filler = toFiller(it.unitPriceHuf!);
    steps.push({ label: `Alapár (${basis === "cost" ? "beszerzési/önköltség" : "eladási referencia"}): ${SOURCE_LABEL[it.kind]}`, filler });
  }
  const contBp = d.contingencyBp[comp] ?? toBp(p.contingencyPct);
  if (basis === "cost") {
    const surBp = toBp(comp === "material" ? p.materialSurchargePct : p.laborSurchargePct);
    if (surBp) { filler = addPct(filler, surBp); steps.push({ label: `${comp === "material" ? "Anyag" : "Munka"}járulék ${surBp / 100}%`, filler }); }
    if (contBp) { filler = addPct(filler, contBp); steps.push({ label: `Tartalék ${contBp / 100}%`, filler }); }
    if (p.marginPct == null) return { ...base, status: "blocked", reason: "Önköltség-alapú árhoz célfedezet szükséges a profilban.", category, score: group[0].score, source: src, candidates: cands, steps };
    const mBp = toBp(p.marginPct);
    if (mBp) { filler = grossUpMargin(filler, mBp); steps.push({ label: `Célfedezet ${mBp / 100}%: önköltség / (1 − ${mBp / 10000})`, filler }); }
  } else if (contBp) { filler = addPct(filler, contBp); steps.push({ label: `Tartalék ${contBp / 100}% (eladási referenciára, fedezet nem épül rá)`, filler }); }
  const add = d.addUnit[comp] ?? 0;
  if (add) { filler += add; steps.push({ label: `Egységár-módosítás ${add > 0 ? "+" : ""}${huf(add)}`, filler }); }
  const unit = roundToStep(filler, p.rounding.stepHuf, p.rounding.mode);
  steps.push({ label: `Kerekítés ${p.rounding.stepHuf} Ft-ra (${p.rounding.mode === "half_up" ? "félértéktől felfelé" : p.rounding.mode === "up" ? "felfelé" : "lefelé"})`, filler: unit });
  return { ...base, status: "priced", category, score: group[0].score, source: src, candidates: cands, hours, rateHuf: rate, steps, unitFiller: unit, confidence };
}

function priceLines(rows: BudgetRow[], layouts: SheetLayout[], idx: SourceIndex, p: CalculationProfile, asOf: string, directives: Map<string, Directive>): PricingResult {
  const layoutBySheet = new Map(layouts.map((l) => [l.sheet, l]));
  const blockers: string[] = [], warnings: string[] = [];
  const comps: PriceComponent[] = p.mode === "subcontractor_labor" ? ["labor"] : ["material", "labor"];
  const lines: LineResult[] = [];
  const exByKey = new Map<string, number>();
  for (const row of rows) {
    if (row.kind !== "item" && row.kind !== "zero_qty") continue;
    const d = directives.get(row.key) ?? emptyDirective();
    const layout = layoutBySheet.get(row.sheet)!;
    const line: LineResult = { key: row.key, sheet: row.sheet, row: row.row, itemNo: row.itemNo, name: row.name, section: row.section, qty: row.qty, unit: row.unit, unitRaw: row.unitRaw,
      status: "missing", reasons: [], flags: [...row.flags], material: null, labor: null, unitSellHuf: null, materialTotalHuf: 0, laborTotalHuf: 0, lineTotalHuf: null, writes: [] };
    lines.push(line);
    const cell = (role: PriceCell["role"]) => row.priceCells.find((c) => c.role === role);
    const matCell = cell("material_unit");
    if (p.mode === "subcontractor_labor" && matCell && matCell.state === "value" && (matCell.existing ?? 0) !== 0)
      blockers.push(`${row.key}: az anyagár cella nem üres (${matCell.existing}) munkadíjas módban — anyag nem kerülhet a végösszegbe.`);
    if (p.mode === "subcontractor_labor" && matCell && matCell.state === "formula") warnings.push(`${row.key}: az anyagár cella képlet; munkadíjas módban ellenőrizendő, hogy nullát ad.`);
    if (d.excluded) { line.status = "excluded"; line.reasons.push("Kizárva kérésre."); continue; }
    if (row.kind === "zero_qty") { line.status = "zero_qty"; line.reasons.push("0 mennyiség: alapértelmezésben nem árazott."); if (!p.priceZeroQty && !d.included) continue; }
    if (row.flags.includes("possible_exclusion") && !d.included) { line.status = "excluded_review"; line.reasons.push("Lehetséges kizárás/opció a szövegben — kézi döntés szükséges."); continue; }
    if (row.flags.includes("no_name")) { line.status = "missing"; line.reasons.push("Nincs megnevezés."); continue; }
    if (layout.ambiguous.length) { line.status = "review"; line.reasons.push("A lap oszlopértelmezése bizonytalan; automatikus írás nincs."); continue; }
    const results = comps.map((c) => priceComponent(row, c, idx, p, asOf, d));
    for (const r of results) line[r.component] = r;
    // Célcellák: külön anyag/díj oszlop, vagy egyetlen egységár oszlop az alkalmazandó összetevők összegével.
    const separate = !!(cell("material_unit") || cell("labor_unit"));
    const targets: { role: PriceCell["role"]; comps: PriceComponent[] }[] = [];
    if (separate) {
      for (const c of comps) { const role = c === "material" ? "material_unit" : "labor_unit"; if (cell(role)) targets.push({ role, comps: [c] }); else { line.reasons.push(`A munkafüzetben nincs ${c === "material" ? "anyag" : "munkadíj"} egységár oszlop.`); } }
    } else if (cell("unit_price")) targets.push({ role: "unit_price", comps });
    else line.reasons.push("Nincs írható egységár oszlop.");
    const missingTarget = comps.some((c) => !targets.some((t) => t.comps.includes(c)));
    const anyBlocked = results.some((r) => r.status === "blocked"), anyReview = results.some((r) => r.status === "review"), allMissing = results.every((r) => r.status === "missing");
    for (const r of results) if (r.reason && r.status !== "priced") line.reasons.push(`${r.component === "material" ? "Anyag" : "Munkadíj"}: ${r.reason}`);
    const priced = results.every((r) => r.status === "priced" || r.status === "removed");
    if (!priced || missingTarget) { line.status = anyBlocked ? "blocked" : allMissing && !missingTarget ? "missing" : "review"; continue; }
    const existing = targets.map((t) => cell(t.role)!).filter((c) => c.state === "value");
    const locked = targets.map((t) => cell(t.role)!).filter((c) => c.state === "formula" || c.state === "text");
    if (locked.length) { line.status = "review"; line.reasons.push(`Az árcella képlet vagy szöveg (${locked.map((c) => c.address).join(", ")}); nem írható felül.`); continue; }
    const unitOf = (c: PriceComponent) => results.find((r) => r.component === c)!.unitFiller ?? 0;
    const sell = comps.reduce((a, c) => a + unitOf(c), 0);
    line.unitSellHuf = fromFiller(sell);
    if (existing.length && !p.overwriteExistingPrices) {
      exByKey.set(row.key, existing.reduce((a, c) => a + lineTotal(toFiller(c.existing ?? 0), row.qty ?? 0), 0));
      line.status = "existing_price"; line.reasons.push(`Az eredeti fájlban már van ár (${existing.map((c) => `${c.address}=${c.existing}`).join(", ")}); nem írjuk felül.`);
      continue;
    }
    const q = row.qty ?? 0;
    line.materialTotalHuf = comps.includes("material") ? fromFiller(lineTotal(unitOf("material"), q)) : 0;
    line.laborTotalHuf = fromFiller(lineTotal(unitOf("labor"), q));
    line.lineTotalHuf = separate ? fromFiller(toFiller(line.materialTotalHuf) + toFiller(line.laborTotalHuf)) : fromFiller(lineTotal(sell, q));
    if (!separate) { line.materialTotalHuf = comps.includes("material") ? fromFiller(lineTotal(unitOf("material"), q)) : 0; line.laborTotalHuf = fromFiller(toFiller(line.lineTotalHuf) - toFiller(line.materialTotalHuf)); }
    line.writes = targets.map((t) => ({ address: cell(t.role)!.address, role: t.role, valueHuf: fromFiller(t.comps.reduce((a, c) => a + unitOf(c), 0)) }));
    line.status = "priced";
  }
  const byStatus = Object.fromEntries(ALL_STATUS.map((s) => [s, 0])) as Record<LineStatus, number>;
  let mat = 0, lab = 0, ex = 0;
  for (const l of lines) {
    byStatus[l.status]++;
    if (l.status === "priced") { mat += toFiller(l.materialTotalHuf); lab += toFiller(l.laborTotalHuf); }
    if (l.status === "existing_price") ex += exByKey.get(l.key) ?? 0;
  }
  if (p.mode === "subcontractor_labor" && mat !== 0) blockers.push("Munkadíjas módban anyagösszeg keletkezett — számítási hiba, export tiltva.");
  return { profile: p, asOf, currency: "HUF", vat: "net", lines, blockers: [...new Set(blockers)], warnings: [...new Set(warnings)],
    totals: { lines: lines.length, byStatus, materialHuf: fromFiller(mat), laborHuf: fromFiller(lab), netHuf: fromFiller(mat + lab), existingHuf: fromFiller(ex) } };
}

function selects(sel: Selector, l: LineResult): boolean {
  if (sel.rows && !sel.rows.includes(l.key)) return false;
  if (sel.sheet && l.sheet !== sel.sheet) return false;
  if (sel.section && !norm(l.section).includes(norm(sel.section))) return false;
  if (sel.name && !norm(l.name).includes(norm(sel.name))) return false;
  if (sel.status && !sel.status.includes(l.status)) return false;
  return !!(sel.rows || sel.sheet || sel.section || sel.name || sel.status);
}

export function diffPricing(a: PricingResult, b: PricingResult): PricingDiff {
  const before = new Map(a.lines.map((l) => [l.key, l]));
  const changed: PricingDiff["changed"] = []; let unchanged = 0;
  for (const l of b.lines) {
    const o = before.get(l.key); if (!o) continue;
    const same = o.status === l.status && o.unitSellHuf === l.unitSellHuf && o.lineTotalHuf === l.lineTotalHuf && JSON.stringify(o.writes) === JSON.stringify(l.writes);
    if (same) unchanged++; else changed.push({ key: l.key, name: l.name.slice(0, 160), before: { status: o.status, unitSellHuf: o.unitSellHuf, lineTotalHuf: o.lineTotalHuf }, after: { status: l.status, unitSellHuf: l.unitSellHuf, lineTotalHuf: l.lineTotalHuf } });
  }
  return { changed, unchangedLines: unchanged, before: a.totals, after: b.totals, deltaNetHuf: fromFiller(toFiller(b.totals.netHuf) - toFiller(a.totals.netHuf)) };
}

export type PricingInput = { rows: BudgetRow[]; layouts: SheetLayout[]; sources: PriceSourceItem[]; profile: CalculationProfile; asOf: string; adjustments?: Adjustment[] };
export type PricingRun = { baseline: PricingResult; result: PricingResult; adjustments: AppliedAdjustment[]; diff: PricingDiff | null };

/** Alapszámítás, majd (ha van) a kért módosítások alkalmazása csak az érintett sorokra, sorrendben. */
export function calculatePricing(input: PricingInput): PricingRun {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)) throw new Error("Értéknap (ÉÉÉÉ-HH-NN) szükséges.");
  const idx = indexSources(input.sources);
  const baseline = priceLines(input.rows, input.layouts, idx, input.profile, input.asOf, new Map());
  const adjustments = input.adjustments ?? [];
  if (!adjustments.length) return { baseline, result: baseline, adjustments: [], diff: null };
  const directives = new Map<string, Directive>();
  const applied: AppliedAdjustment[] = [];
  const lineByKey = new Map(baseline.lines.map((l) => [l.key, l]));
  for (const a of adjustments) {
    const keys = baseline.lines.filter((l) => selects(a.target, l)).map((l) => l.key);
    const rec: AppliedAdjustment = { id: a.id, op: a.op, reason: a.reason, requestedBy: a.requestedBy ?? null, rows: keys, error: null };
    applied.push(rec);
    if (!a.reason?.trim()) { rec.error = "Indoklás nélküli módosítás nem alkalmazható."; rec.rows = []; continue; }
    if (!keys.length) { rec.error = "A feltétel egyetlen tételsorra sem illik — nem alkalmazva."; continue; }
    const comps: PriceComponent[] = a.component === "material" ? ["material"] : a.component === "labor" ? ["labor"] : ["material", "labor"];
    const needAmount = a.op === "add_unit_amount" || a.op === "add_line_amount" || a.op === "set_unit_price";
    if (needAmount && (a.amountHuf == null || !Number.isFinite(a.amountHuf))) { rec.error = "Összeg szükséges."; rec.rows = []; continue; }
    if (a.op === "contingency_pct" && (a.pct == null || !Number.isFinite(a.pct) || a.pct < 0 || a.pct > 300)) { rec.error = "Érvényes tartalék-% szükséges (0–300)."; rec.rows = []; continue; }
    if ((a.op === "set_unit_price" || a.op === "add_line_amount") && a.component !== "material" && a.component !== "labor") { rec.error = "Ehhez pontos összetevő (anyag vagy munkadíj) szükséges."; rec.rows = []; continue; }
    if (a.op === "add_line_amount" && keys.some((k) => lineByKey.get(k)!.qty !== 1)) { rec.error = "Sorösszeg-módosítás csak 1 mennyiségű tételnél; egyébként egységár-módosítás szükséges."; rec.rows = []; continue; }
    if (a.op === "set_unit_price" && a.amountHuf! < 0) { rec.error = "Negatív egységár nem adható meg."; rec.rows = []; continue; }
    for (const k of keys) {
      const d = directives.get(k) ?? emptyDirective(); directives.set(k, d);
      if (a.op === "exclude") d.excluded = true;
      else if (a.op === "include") d.included = true;
      else for (const c of comps) {
        if (a.op === "contingency_pct") d.contingencyBp[c] = toBp(a.pct!);
        else if (a.op === "add_unit_amount" || a.op === "add_line_amount") d.addUnit[c] = (d.addUnit[c] ?? 0) + toFiller(a.amountHuf!);
        else if (a.op === "set_unit_price") d.setUnit[c] = { filler: toFiller(a.amountHuf!), reason: a.reason.slice(0, 200) };
        else if (a.op === "remove_component") d.removed.add(c);
      }
    }
  }
  const result = priceLines(input.rows, input.layouts, idx, input.profile, input.asOf, directives);
  return { baseline, result, adjustments: applied, diff: diffPricing(baseline, result) };
}
