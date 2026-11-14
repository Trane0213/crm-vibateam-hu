/**
 * P4 — szekrénykalkuláció három külön költségnemben: anyag (BOM), összeszerelés/gyártás (belső huzalozás,
 * szerelés, gyártási teszt és dokumentáció), helyszíni bekötés (felszerelés, betáp, elmenők, mérés/beüzemelés).
 * Anyag: a P3 motor `priceDescriptor` útján (azonos forrásrangsor és minősítés). Munka: VIBA-norma × óradíj,
 * a P3 pénzaritmetikájával. Teljes szekrényár CSAK hiánytalan, bizonyított anyagjegyzéknél és minden sor árazottságánál.
 */
import { addPct, fromFiller, grossUpMargin, hoursTimesRate, lineTotal, roundToStep, toBp, toFiller } from "@/lib/pricing/money";
import { indexSources, type PriceSourceItem } from "@/lib/pricing/price-sources";
import { priceDescriptor, type ComponentResult } from "@/lib/pricing/engine";
import type { CalculationProfile } from "@/lib/pricing/profiles";
import { DEVICE_LABEL, type BomLine, type Cabinet, type DeviceClass } from "./cabinet-bom";
import type { Evidence } from "./plan-text";

export type CostCategory = "material" | "assembly" | "site";
export const COST_CATEGORY_LABEL: Record<CostCategory, string> = { material: "Anyag (alkatrészek)", assembly: "Összeszerelés / gyártás", site: "Helyszíni felszerelés és bekötés" };

/** VIBA-normák (óra). Alapból üres: tulajdonosi jóváhagyásig nincs kitalált norma; felhasználói feltételezésként megadható. */
export type CabinetRules = {
  assemblyHoursPerDevice: Partial<Record<DeviceClass, number>>;
  enclosureAssemblyHours: number | null; testDocHoursPerCabinet: number | null;
  siteMountHoursPerCabinet: number | null; siteFeederHoursPerCabinet: number | null;
  siteOutgoingHoursPerCircuit: number | null; siteMeasurementHoursPerCabinet: number | null;
  approval: "none" | "user_assumption" | "owner_approved";
};
export const EMPTY_CABINET_RULES: CabinetRules = { assemblyHoursPerDevice: {}, enclosureAssemblyHours: null, testDocHoursPerCabinet: null, siteMountHoursPerCabinet: null, siteFeederHoursPerCabinet: null, siteOutgoingHoursPerCircuit: null, siteMeasurementHoursPerCabinet: null, approval: "none" };

export type CostLineStatus = "priced" | "review" | "missing" | "blocked" | "excluded" | "summarized";
export type CabinetCostLine = {
  id: string; cabinetId: string; category: CostCategory; description: string; qty: number | null; unit: string;
  status: CostLineStatus; reasons: string[]; unitHuf: number | null; totalHuf: number | null;
  steps: { label: string; filler: number | null }[]; source: ComponentResult["source"] | null; candidates: ComponentResult["candidates"];
  confidence: "source" | "reference" | "estimate" | "manual" | null; evidence: Evidence[]; bomLineId: string | null;
};
export type CabinetAdjustment = {
  id: string; reason: string; requestedBy?: string | null; cabinetId?: string; category?: CostCategory; lineIds?: string[];
  op: "contingency_pct" | "add_amount" | "remove_line" | "set_unit_price"; pct?: number; amountHuf?: number;
};
export type CabinetTotals = { materialHuf: number; assemblyHuf: number; siteHuf: number; pricedHuf: number; openLines: number; complete: boolean; fullPriceHuf: number | null; blockReasons: string[] };
export type CabinetEstimate = { cabinetId: string; status: Cabinet["status"]; lines: CabinetCostLine[]; totals: CabinetTotals };
export type CabinetPricingResult = { estimates: CabinetEstimate[]; applied: { id: string; op: CabinetAdjustment["op"]; reason: string; lines: string[]; error: string | null }[]; diff: { id: string; before: number | null; after: number | null }[] | null; rulesApproval: CabinetRules["approval"] };

const huf = (f: number) => `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(fromFiller(f))} Ft`;

function laborUnit(hours: number, p: CalculationProfile, contBp: number, approved: boolean): { filler: number | null; steps: CabinetCostLine["steps"]; blocked: string | null } {
  if (p.laborRateHuf == null) return { filler: null, steps: [], blocked: "Óradíj szükséges a profilban." };
  let f = hoursTimesRate(hours, p.laborRateHuf);
  const steps: CabinetCostLine["steps"] = [{ label: `${hours} óra × ${p.laborRateHuf} Ft/óra (${approved ? "jóváhagyott VIBA-norma" : "felhasználói feltételezés, nem jóváhagyott norma"})`, filler: f }];
  if (p.laborRateBasis === "cost") {
    const sur = toBp(p.laborSurchargePct); if (sur) { f = addPct(f, sur); steps.push({ label: `Munkajárulék ${sur / 100}%`, filler: f }); }
    if (contBp) { f = addPct(f, contBp); steps.push({ label: `Tartalék ${contBp / 100}%`, filler: f }); }
    if (p.marginPct == null) return { filler: null, steps, blocked: "Önköltség-alapú óradíjhoz célfedezet szükséges." };
    const m = toBp(p.marginPct); if (m) { f = grossUpMargin(f, m); steps.push({ label: `Célfedezet ${m / 100}%`, filler: f }); }
  } else if (contBp) { f = addPct(f, contBp); steps.push({ label: `Tartalék ${contBp / 100}% (eladási óradíjra, fedezet nem épül rá)`, filler: f }); }
  const r = roundToStep(f, p.rounding.stepHuf, p.rounding.mode); steps.push({ label: `Kerekítés ${p.rounding.stepHuf} Ft-ra`, filler: r });
  return { filler: r, steps, blocked: null };
}

type Dir = { contBp: Map<string, number>; remove: Set<string>; setUnit: Map<string, { filler: number; reason: string }>; extra: CabinetCostLine[] };

function estimateCabinet(cab: Cabinet, idx: ReturnType<typeof indexSources>, p: CalculationProfile, rules: CabinetRules, asOf: string, d: Dir): CabinetEstimate {
  const lines: CabinetCostLine[] = [];
  const approved = rules.approval === "owner_approved";
  const base = (o: Partial<CabinetCostLine> & Pick<CabinetCostLine, "id" | "category" | "description">): CabinetCostLine => ({ cabinetId: cab.id, qty: null, unit: "db", status: "missing", reasons: [], unitHuf: null, totalHuf: null, steps: [], source: null, candidates: [], confidence: null, evidence: [], bomLineId: null, ...o });
  const finish = (l: CabinetCostLine, unitFiller: number | null) => {
    if (d.setUnit.has(l.id)) { const m = d.setUnit.get(l.id)!; unitFiller = roundToStep(m.filler, p.rounding.stepHuf, p.rounding.mode); l.steps = [{ label: `Kézi egységár (${m.reason})`, filler: m.filler }, { label: `Kerekítés ${p.rounding.stepHuf} Ft-ra`, filler: unitFiller }]; l.status = l.qty != null ? "priced" : "review"; l.confidence = "manual"; l.reasons = l.qty != null ? [] : ["Darabszám hiányzik."]; }
    if (d.remove.has(l.id)) { l.status = "excluded"; l.reasons = ["Kivéve kérésre (pl. már beszerzett)."]; l.unitHuf = 0; l.totalHuf = 0; return l; }
    if (l.status === "priced" && unitFiller != null && l.qty != null) { l.unitHuf = fromFiller(unitFiller); l.totalHuf = fromFiller(lineTotal(unitFiller, l.qty)); }
    else if (unitFiller != null) l.unitHuf = fromFiller(unitFiller);
    return l;
  };
  const contOf = (id: string, cat: CostCategory) => d.contBp.get(`${cab.id}|${cat}|${id}`) ?? d.contBp.get(`${cab.id}|${cat}|*`) ?? d.contBp.get(`*|${cat}|*`) ?? d.contBp.get(`${cab.id}|*|*`) ?? d.contBp.get(`*|*|*`) ?? toBp(p.contingencyPct);

  // 1) Anyag
  const bom: BomLine[] = [...(cab.enclosure ? [cab.enclosure] : []), ...cab.lines];
  const brokenDown = new Set(cab.lines.filter((l) => l.parentId === "rating_breakdown").map((l) => l.cls));
  for (const b of bom) {
    const l = base({ id: `M:${b.id}`, category: "material", description: `${DEVICE_LABEL[b.cls]}: ${b.description}${b.rating && !b.description.includes(b.rating) ? ` ${b.rating}` : ""}${b.poles ? ` ${b.poles}` : ""}`.slice(0, 240), qty: b.qty, evidence: b.evidence, bomLineId: b.id });
    if (brokenDown.has(b.cls) && b.parentId !== "rating_breakdown" && !b.rating) { l.status = "summarized"; l.reasons.push("Névleges áram szerinti alsorokban árazva (dupla számolás nélkül)."); lines.push(l); continue; }
    if (p.mode === "subcontractor_labor") { l.status = "excluded"; l.reasons.push("Alvállalkozói munkadíjas mód: anyag nem árazható."); lines.push(finish(l, null)); continue; }
    const head = DEVICE_LABEL[b.cls].split(/[ /(]/)[0]!.toLowerCase();
    const matchName = `${b.description.toLowerCase().includes(head) ? b.description : `${DEVICE_LABEL[b.cls]} ${b.description}`}${b.rating && !b.description.includes(b.rating) ? ` ${b.rating}` : ""}${b.poles && !b.description.includes(b.poles) ? ` ${b.poles}` : ""}`;
    const r = priceDescriptor({ name: matchName, unit: "db", type: b.productRef }, "material", idx, p, asOf);
    l.candidates = r.candidates; l.source = r.source; l.steps = r.steps; l.confidence = r.confidence;
    if (b.notes.length) l.reasons.push(...b.notes);
    if (b.qty == null) { l.status = "review"; l.reasons.push("A darabszám nincs a rajzon — ár nem számítható."); }
    else if (b.uncertain.length) { l.status = "review"; l.reasons.push(...b.uncertain); if (r.status === "priced") l.reasons.push(`Javasolt egységár ${huf(r.unitFiller!)} — bizonytalanság miatt nem számolva.`); }
    else if (r.status === "priced") {
      let f = r.unitFiller!; const c = contOf(l.id, "material"), dflt = toBp(p.contingencyPct);
      if (c !== dflt) { f = roundToStep(addPct(f, c - dflt), p.rounding.stepHuf, p.rounding.mode); l.steps = [...l.steps, { label: `Egyedi tartalék ${(c - dflt) / 100}% (kérésre)`, filler: f }]; }
      l.status = "priced"; lines.push(finish(l, f)); continue;
    } else { l.status = r.status === "blocked" ? "blocked" : r.status === "review" ? "review" : "missing"; if (r.reason) l.reasons.push(r.reason); }
    lines.push(finish(l, null));
  }
  // 2) Összeszerelés / gyártás
  const deviceCount = new Map<DeviceClass, number>();
  for (const b of cab.lines) if (b.qty != null && !(brokenDown.has(b.cls) && b.parentId !== "rating_breakdown" && !b.rating)) deviceCount.set(b.cls, (deviceCount.get(b.cls) ?? 0) + b.qty);
  const unknownQty = cab.lines.filter((b) => b.qty == null);
  const labor = (id: string, cat: CostCategory, desc: string, qty: number | null, unit: string, hours: number | null, missingWhy: string, ev: Evidence[] = []) => {
    const l = base({ id, category: cat, description: desc, qty, unit, evidence: ev });
    if (hours == null) { l.status = "blocked"; l.reasons.push(missingWhy); return lines.push(finish(l, null)); }
    if (qty == null) { l.status = "review"; l.reasons.push("Mennyiség nem igazolt."); return lines.push(finish(l, null)); }
    const u = laborUnit(hours, p, contOf(id, cat), approved); l.steps = u.steps; l.confidence = approved ? "source" : "estimate";
    if (u.blocked) { l.status = "blocked"; l.reasons.push(u.blocked); return lines.push(finish(l, null)); }
    l.status = "priced"; if (!approved) l.reasons.push("Felhasználói feltételezés szerinti norma — nem jóváhagyott VIBA-szabály.");
    lines.push(finish(l, u.filler));
  };
  const NORM_MISSING = "VIBA gyártási/szerelési norma nincs megadva (tulajdonosi döntés); bizonyítatlan norma nem használható.";
  if (cab.enclosure) labor(`A:${cab.id}:enclosure`, "assembly", "Szekrénytest, szerelőlap, sínek szerelése", 1, "klt", rules.enclosureAssemblyHours, NORM_MISSING, cab.enclosure.evidence);
  for (const [cls, n] of [...deviceCount.entries()].sort()) labor(`A:${cab.id}:${cls}`, "assembly", `${DEVICE_LABEL[cls]} beépítése és belső huzalozása`, n, "db", rules.assemblyHoursPerDevice[cls] ?? null, NORM_MISSING);
  if (unknownQty.length) { const l = base({ id: `A:${cab.id}:unknown`, category: "assembly", description: `Darabszám nélküli készülékek szerelése (${unknownQty.map((b) => b.description).join(", ").slice(0, 120)})`, status: "review" }); l.reasons.push("Darabszám hiányzik — munkadíj nem számítható."); lines.push(l); }
  labor(`A:${cab.id}:test`, "assembly", "Gyártási teszt, feliratozás, dokumentáció", 1, "klt", rules.testDocHoursPerCabinet, NORM_MISSING);
  // 3) Helyszíni felszerelés és bekötés — külön soron, nem a gyártásban.
  labor(`S:${cab.id}:mount`, "site", "Helyszíni felszerelés (falra/alapra)", 1, "klt", rules.siteMountHoursPerCabinet, NORM_MISSING);
  labor(`S:${cab.id}:feeder`, "site", "Betápkábel bekötése", 1, "klt", rules.siteFeederHoursPerCabinet, NORM_MISSING);
  const circuits = cab.circuits.length || null;
  labor(`S:${cab.id}:outgoing`, "site", `Elmenő áramkörök bekötése${circuits ? ` (${circuits} áramkör a kapcsolási rajzon)` : ""}`, circuits, "áramkör", rules.siteOutgoingHoursPerCircuit, circuits == null ? "Elmenő áramkörszám nem állapítható meg a rajzból." : NORM_MISSING, cab.circuits.slice(0, 1).map((c) => c.evidence));
  labor(`S:${cab.id}:measure`, "site", "Mérés, beüzemelés", 1, "klt", rules.siteMeasurementHoursPerCabinet, NORM_MISSING);
  for (const x of d.extra.filter((e) => e.cabinetId === cab.id)) lines.push({ ...x });

  let mat = 0, asm = 0, site = 0, open = 0;
  for (const l of lines) {
    if (l.status === "priced" && l.totalHuf != null) { const f = toFiller(l.totalHuf); if (l.category === "material") mat += f; else if (l.category === "assembly") asm += f; else site += f; }
    else if (!["excluded", "summarized"].includes(l.status)) open++;
  }
  const blockReasons: string[] = [];
  if (cab.status === "no_drawing") blockReasons.push("Nincs kapcsolási/nézeti rajz — szekrényár nem számítható.");
  if (cab.status === "no_device_list") blockReasons.push("Nincs készülékjegyzék.");
  if (cab.status === "bom_partial") blockReasons.push("Az anyagjegyzék hiányos vagy bizonytalan (lásd kérdések).");
  if (open) blockReasons.push(`${open} nem árazott/ellenőrizendő sor.`);
  const complete = !blockReasons.length && lines.some((l) => l.status === "priced");
  return { cabinetId: cab.id, status: cab.status, lines, totals: { materialHuf: fromFiller(mat), assemblyHuf: fromFiller(asm), siteHuf: fromFiller(site), pricedHuf: fromFiller(mat + asm + site), openLines: open, complete, fullPriceHuf: complete ? fromFiller(mat + asm + site) : null, blockReasons } };
}

export function priceCabinets(input: { cabinets: Cabinet[]; sources: PriceSourceItem[]; profile: CalculationProfile; rules?: CabinetRules; asOf: string; adjustments?: CabinetAdjustment[] }): CabinetPricingResult {
  const rules = input.rules ?? EMPTY_CABINET_RULES;
  for (const v of [rules.enclosureAssemblyHours, rules.testDocHoursPerCabinet, rules.siteMountHoursPerCabinet, rules.siteFeederHoursPerCabinet, rules.siteOutgoingHoursPerCircuit, rules.siteMeasurementHoursPerCabinet, ...Object.values(rules.assemblyHoursPerDevice)])
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 500)) throw new Error("Érvénytelen normaóra (0–500).");
  const idx = indexSources(input.sources);
  const empty = (): Dir => ({ contBp: new Map(), remove: new Set(), setUnit: new Map(), extra: [] });
  const baseline = input.cabinets.map((c) => estimateCabinet(c, idx, input.profile, rules, input.asOf, empty()));
  const adj = input.adjustments ?? [];
  if (!adj.length) return { estimates: baseline, applied: [], diff: null, rulesApproval: rules.approval };
  const d = empty(); const applied: CabinetPricingResult["applied"] = [];
  const allLines = baseline.flatMap((e) => e.lines);
  for (const a of adj) {
    const rec = { id: a.id, op: a.op, reason: a.reason, lines: [] as string[], error: null as string | null }; applied.push(rec);
    if (!a.reason?.trim()) { rec.error = "Indoklás nélküli módosítás nem alkalmazható."; continue; }
    const targets = allLines.filter((l) => (!a.cabinetId || l.cabinetId === a.cabinetId) && (!a.category || l.category === a.category) && (!a.lineIds || a.lineIds.includes(l.id)));
    if (a.op === "add_amount") {
      if (!a.cabinetId || !a.category || a.amountHuf == null || !Number.isFinite(a.amountHuf)) { rec.error = "Szekrény, költségnem és összeg szükséges."; continue; }
      if (!input.cabinets.some((c) => c.id === a.cabinetId)) { rec.error = "Ismeretlen szekrény."; continue; }
      const id = `X:${a.cabinetId}:${a.id}`; rec.lines = [id];
      d.extra.push({ id, cabinetId: a.cabinetId, category: a.category, description: `Kézi tétel: ${a.reason.slice(0, 160)}`, qty: 1, unit: "klt", status: "priced", reasons: ["Kérésre hozzáadott összeg."], unitHuf: a.amountHuf, totalHuf: a.amountHuf, steps: [{ label: `Kézi összeg (${a.reason.slice(0, 80)})`, filler: toFiller(a.amountHuf) }], source: null, candidates: [], confidence: "manual", evidence: [], bomLineId: null });
      continue;
    }
    if (!targets.length) { rec.error = "A feltétel egyetlen sorra sem illik — nem alkalmazva."; continue; }
    rec.lines = targets.map((t) => t.id);
    if (a.op === "contingency_pct") { if (a.pct == null || !Number.isFinite(a.pct) || a.pct < 0 || a.pct > 300) { rec.error = "Érvényes tartalék-% szükséges (0–300)."; rec.lines = []; continue; } for (const t of targets) d.contBp.set(`${t.cabinetId}|${t.category}|${t.id}`, toBp(a.pct)); }
    else if (a.op === "remove_line") { const mats = targets.filter((t) => t.category === "material"); if (!mats.length) { rec.error = "Csak anyagsor vehető ki."; rec.lines = []; continue; } rec.lines = mats.map((t) => t.id); for (const t of mats) d.remove.add(t.id); }
    else if (a.op === "set_unit_price") { if (!a.lineIds?.length || a.amountHuf == null || !Number.isFinite(a.amountHuf) || a.amountHuf < 0) { rec.error = "Pontos sorazonosító és nem negatív egységár szükséges."; rec.lines = []; continue; } for (const t of targets) d.setUnit.set(t.id, { filler: toFiller(a.amountHuf), reason: a.reason.slice(0, 120) }); }
  }
  const estimates = input.cabinets.map((c) => estimateCabinet(c, idx, input.profile, rules, input.asOf, d));
  const before = new Map(allLines.map((l) => [l.id, l.totalHuf]));
  const diff = estimates.flatMap((e) => e.lines).filter((l) => before.get(l.id) !== l.totalHuf || !before.has(l.id)).map((l) => ({ id: l.id, before: before.get(l.id) ?? null, after: l.totalHuf }));
  return { estimates, applied, diff, rulesApproval: rules.approval };
}
