import { describe, expect, it } from "vitest";
import { extractBudget } from "./budget-extract";
import { calculatePricing, type Adjustment } from "./engine";
import { WorkbookEvaluator } from "./formula";
import type { PriceSourceItem } from "./price-sources";
import { resolveProfile } from "./profiles";
import { readWorkbook } from "./workbook";
import { materialLaborBudget, sourcesFor, workbook } from "./__fixtures__/workbooks";

const rowsOf = (bytes: Uint8Array) => { const r = readWorkbook(bytes, "t.xlsx"); return extractBudget(r.model, new WorkbookEvaluator(r.model)); };
const AS_OF = "2026-11-15";
const run = (bytes: Uint8Array, sources: PriceSourceItem[], mode: "subcontractor_labor" | "full_construction", o = {}, adjustments?: Adjustment[]) => {
  const ex = rowsOf(bytes); return calculatePricing({ rows: ex.rows, layouts: ex.layouts, sources, profile: resolveProfile(mode, o), asOf: AS_OF, adjustments });
};
const one = (name: string, unit: string, extra: Partial<PriceSourceItem> = {}): PriceSourceItem => ({ id: extra.id ?? name, kind: "ramon_approved_template", component: "labor", basis: "sell", name, unit, unitPriceHuf: 1000, priceDate: "2026-11-01", approvalVerified: true, provenance: { label: "TESZT" }, ...extra });
const kvBook = (names: [string, number, string][]) => workbook([["E", [["S.sz.", "Megnevezés", "Mennyiség", "ME", "Egységár", "Össz díj"], ...names.map(([n, q, u], i) => [i + 1, n, q, u, null, { f: `E${i + 2}*C${i + 2}` }])]]]);

describe("P3 átvétel: ugyanaz a 100 soros tétellista két módban", () => {
  const bytes = materialLaborBudget(100), src = sourcesFor(100);
  const labor = run(bytes, src, "subcontractor_labor").result, full = run(bytes, src, "full_construction", { marginPct: 15, contingencyPct: 5, roundingStepHuf: 10 }).result;
  it("munkadíjas módban nulla anyagösszeg, minden sor árazott", () => {
    expect(labor.totals.byStatus.priced).toBe(100); expect(labor.totals.materialHuf).toBe(0);
    expect(labor.lines.every((l) => l.writes.every((w) => w.role === "labor_unit"))).toBe(true);
  });
  it("anyagos módban külön anyag + munkadíj, a munkadíj tartalék nélkül azonos alapból számolt", () => {
    expect(full.totals.byStatus.priced).toBe(100); expect(full.totals.materialHuf).toBeGreaterThan(0);
    expect(full.totals.netHuf).toBeCloseTo(full.totals.materialHuf + full.totals.laborHuf, 2);
  });
  it("emberileg visszaszámolható: minden sor = kézi képlet (anyag: önköltség×1,05/0,85 → 10 Ft; díj: eladási×1,05 → 10 Ft)", () => {
    const r10 = (x: number) => Math.floor(x / 10 + 0.5) * 10;
    full.lines.forEach((l, i) => {
      const mat = r10(Math.round(((500 + 7 * i) * 1.05) * 100) / 100 / 0.85), lab = r10((1000 + 13 * i) * 1.05);
      expect(l.material!.unitFiller! / 100).toBe(mat); expect(l.labor!.unitFiller! / 100).toBe(lab);
      expect(l.lineTotalHuf).toBeCloseTo(Math.round(mat * l.qty! * 100) / 100 + Math.round(lab * l.qty! * 100) / 100, 2);
    });
    labor.lines.forEach((l, i) => expect(l.unitSellHuf).toBe(1000 + 13 * i));
  });
  it("determinisztikus: két futás bájtra azonos eredmény", () => {
    expect(JSON.stringify(run(bytes, src, "full_construction", { marginPct: 15 }).result)).toBe(JSON.stringify(run(bytes, src, "full_construction", { marginPct: 15 }).result));
  });
});

describe("árforrás-rangsor és minősítés", () => {
  const book = kvBook([["Dugaszolóaljzat IP44 1x16A", 10, "db"]]);
  const name = "Dugaszolóaljzat IP44 1x16A";
  it("igazolt projekt-beszállítói ár megelőzi a sablont és a korábbi ajánlatot", () => {
    const r = run(book, [one(name, "db", { id: "h", kind: "viba_historical_quote", unitPriceHuf: 1740 }), one(name, "db", { id: "t", unitPriceHuf: 1800 }), one(name, "db", { id: "s", kind: "supplier_quote", unitPriceHuf: 1700 })], "subcontractor_labor").result;
    expect(r.lines[0].labor!.source!.id).toBe("s"); expect(r.lines[0].unitSellHuf).toBe(1700);
  });
  it("nem igazolt beszállítói ár nem automatikus → a következő rangú forrás", () => {
    const r = run(book, [one(name, "db", { id: "s", kind: "supplier_quote", approvalVerified: false, unitPriceHuf: 1 }), one(name, "db", { id: "h", kind: "viba_historical_quote", unitPriceHuf: 1740 })], "subcontractor_labor").result;
    expect(r.lines[0].labor!.source!.id).toBe("h"); expect(r.lines[0].labor!.confidence).toBe("reference");
  });
  it.each([
    [{ priceDate: null }, /dátuma ismeretlen/], [{ priceDate: "2024-01-01" }, /Elavult/], [{ validUntil: "2026-11-01" }, /lejárt/],
    [{ kind: "market_reference" as const }, /nem válhat automatikusan/], [{ kind: "ai_estimate" as const }, /nem válhat automatikusan/],
  ])("%o → ellenőrizendő, nem tényár", (extra, reason) => {
    const r = run(book, [one(name, "db", extra)], "subcontractor_labor").result;
    expect(r.lines[0].status).toBe("review"); expect(r.lines[0].reasons.join()).toMatch(reason); expect(r.lines[0].writes).toHaveLength(0);
  });
  it("csak számban eltérő jel/tételszám (L04 ↔ L05) nem automatikus egyezés", () => {
    const b = kvBook([["L04 jelű teraszra kerülő lámpatest süllyesztő dobozzal", 4, "db"]]);
    expect(run(b, [one("L05 jelű teraszra kerülő lámpatest süllyesztő dobozzal", "db")], "subcontractor_labor").result.lines[0].status).toBe("review");
  });
  it("eltérő mértékegység soha nem párosul", () => { expect(run(book, [one(name, "m")], "subcontractor_labor").result.lines[0].status).toBe("missing"); });
  it("műszaki ütközés (1x16A ↔ 1x10A) legfeljebb javaslat", () => { expect(run(book, [one("Dugaszolóaljzat IP44 1x10A", "db")], "subcontractor_labor").result.lines[0].status).not.toBe("priced"); });
  it("azonos nevű, eltérő árú tétel: kontextus nélkül választás kell, kontextussal szétválik", () => {
    const b = kvBook([["NYM-J 300/500 V rézerű kábel 3x1,5 mm2", 10, "m"], ["3x4 mm2", 5, "m"]]);
    const base = [one("3x4 mm2", "m", { id: "a", unitPriceHuf: 696, context: "NYM-J 300/500 V rézerű kábel 3x1,5 mm2" }), one("3x4 mm2", "m", { id: "b", unitPriceHuf: 464, context: "NHXH-J E90 funkciótartó kábel" })];
    const r = run(b, base, "subcontractor_labor").result;
    expect(r.lines[1].labor!.source!.id).toBe("a"); expect(r.lines[1].labor!.steps[0].label).toMatch(/Kontextus/);
    const r2 = run(b, base.map((x) => ({ ...x, context: null })), "subcontractor_labor").result;
    expect(r2.lines[1].status).toBe("review"); expect(r2.lines[1].reasons.join()).toMatch(/eltérő árú/);
  });
});

describe("kalkulációs profil", () => {
  const book = kvBook([["Kábeltálca 200 mm", 44, "m"]]);
  it("korábbi díj óradíjra skálázva: 1740 / 5800 × 6500 = 1950 Ft, becslésként jelölve", () => {
    const r = run(book, [one("Kábeltálca 200 mm", "m", { kind: "viba_historical_quote", unitPriceHuf: 1740 })], "subcontractor_labor", { historicalLaborPolicy: "rate_scaled" }).result;
    expect(r.lines[0].unitSellHuf).toBe(1950); expect(r.lines[0].labor!.confidence).toBe("estimate"); expect(r.lines[0].lineTotalHuf).toBe(85800);
  });
  it("normaórás sablontétel: 0,12 óra × 6500 = 780 Ft", () => {
    const r = run(book, [one("Kábeltálca 200 mm", "m", { unitPriceHuf: null, normHours: 0.12, normBasis: "experience" })], "subcontractor_labor").result;
    expect(r.lines[0].unitSellHuf).toBe(780); expect(r.lines[0].labor!.confidence).toBe("estimate");
  });
  it("önköltség-alapú ár célfedezet nélkül blokkolt, nem csendes 0%", () => {
    const r = run(book, [one("Kábeltálca 200 mm", "m", { basis: "cost" })], "subcontractor_labor").result;
    expect(r.lines[0].status).toBe("blocked"); expect(r.lines[0].reasons.join()).toMatch(/célfedezet/);
  });
  it("eladási referenciára fedezet nem épül rá, csak a tartalék", () => {
    const r = run(book, [one("Kábeltálca 200 mm", "m", { unitPriceHuf: 1000 })], "subcontractor_labor", { marginPct: 20, contingencyPct: 10 }).result;
    expect(r.lines[0].unitSellHuf).toBe(1100);
  });
  it("érvénytelen paraméter elutasítva", () => { expect(() => resolveProfile("full_construction", { marginPct: 100 })).toThrow(); expect(() => resolveProfile("full_construction", { laborRateHuf: -1 })).toThrow(); });
});

describe("különleges sorok", () => {
  it("0 mennyiség nem kap árat; kérésre (include) igen", () => {
    const b = kvBook([["Kapcsoló", 0, "db"]]), s = [one("Kapcsoló", "db")];
    expect(run(b, s, "subcontractor_labor").result.lines[0].status).toBe("zero_qty");
    expect(run(b, s, "subcontractor_labor", {}, [{ id: "1", reason: "kérés", op: "include", target: { rows: ["E!2"] } }]).result.lines[0].status).toBe("priced");
  });
  it("lehetséges kizárás nincs árazva; meglévő ár nem íródik felül", () => {
    const b = workbook([["E", [["S.sz.", "Megnevezés", "Mennyiség", "ME", "Egységár", "Össz díj"], [1, "OPCIONÁLIS Kapcsoló", 2, "db", null, { f: "E2*C2" }], [2, "Kapcsoló", 2, "db", 900, { f: "E3*C3" }]]]]);
    const r = run(b, [one("OPCIONÁLIS Kapcsoló", "db"), one("Kapcsoló", "db")], "subcontractor_labor").result;
    expect(r.lines[0].status).toBe("excluded_review"); expect(r.lines[1].status).toBe("existing_price"); expect(r.lines[1].writes).toHaveLength(0);
  });
  it("munkadíjas módban a nem üres anyagár cella blokkolja a kiadást", () => {
    const b = workbook([["L", [["Megnevezés", "Menny.", "Egys.", "Anyag egységár", "Díj egységár"], ["Kapcsoló", 1, "db", 5000, null]]]]);
    expect(run(b, [one("Kapcsoló", "db")], "subcontractor_labor").result.blockers.join()).toMatch(/anyagár cella nem üres/);
  });
});

describe("tételes módosítások (chat-módosítás alapja)", () => {
  const bytes = materialLaborBudget(10), src = sourcesFor(10);
  const base = { marginPct: 10 };
  it("tartalék csak a kiválasztott sorokra; a többi változatlan és meg van számolva", () => {
    const r = run(bytes, src, "full_construction", base, [{ id: "a1", reason: "bizonytalan kábelek", op: "contingency_pct", pct: 15, component: "material", target: { name: "kábel 1x" } }]);
    const hit = r.adjustments[0].rows;
    expect(hit.length).toBeGreaterThan(0);
    expect(r.diff!.changed.map((c) => c.key).sort()).toEqual([...hit].sort());
    expect(r.diff!.unchangedLines).toBe(10 - hit.length);
    for (const c of r.diff!.changed) expect(c.after.lineTotalHuf!).toBeGreaterThan(c.before.lineTotalHuf!);
  });
  it("kézi egységár és anyag kivétele", () => {
    const r = run(bytes, src, "full_construction", base, [
      { id: "s", reason: "szekrény ára megadva", op: "set_unit_price", component: "labor", amountHuf: 60000, target: { rows: ["Tételek!3"] } },
      { id: "m", reason: "már beszereztük", op: "remove_component", component: "material", target: { rows: ["Tételek!4"] } }]);
    const l3 = r.result.lines.find((l) => l.key === "Tételek!3")!, l4 = r.result.lines.find((l) => l.key === "Tételek!4")!;
    expect(l3.labor!.unitFiller).toBe(6000000); expect(l3.labor!.confidence).toBe("manual");
    expect(l4.material!.status).toBe("removed"); expect(l4.materialTotalHuf).toBe(0);
  });
  it("hibás módosítás nem alkalmazódik csendben", () => {
    const r = run(bytes, src, "full_construction", base, [
      { id: "1", reason: "", op: "exclude", target: { rows: ["Tételek!3"] } },
      { id: "2", reason: "nincs ilyen", op: "exclude", target: { name: "nem létező tétel" } },
      { id: "3", reason: "sorösszeg", op: "add_line_amount", component: "labor", amountHuf: 1000, target: { rows: ["Tételek!4"] } }]);
    expect(r.adjustments.map((a) => a.error !== null)).toEqual([true, true, r.baseline.lines.find((l) => l.key === "Tételek!4")!.qty !== 1]);
    expect(r.result.lines.find((l) => l.key === "Tételek!3")!.status).toBe("priced");
  });
});
