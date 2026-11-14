import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { runBudgetPricing, sha256Hex } from "./run-budget-pricing";
import { readWorkbook } from "./workbook";
import { changedZipParts } from "./workbook-patch";
import { materialLaborBudget, sourcesFor, workbook } from "./__fixtures__/workbooks";
import type { PriceSourceItem } from "./price-sources";

const AS_OF = "2026-11-15";
const go = (bytes: Uint8Array, mode: "subcontractor_labor" | "full_construction", sources: PriceSourceItem[], o = {}) =>
  runBudgetPricing({ bytes, fileName: "TESZT_kv.xlsx", mode, sources, asOf: AS_OF, buildWorkbook: true, overrides: o });

describe("szerkezettartó TERVEZET XLSX", () => {
  it("anyag+díj mód: ellenőrzött kimenet, csak a munkalap és a workbook.xml változik, eredeti bájtok érintetlenek", async () => {
    const bytes = materialLaborBudget(30, { roundup: true }); const before = await sha256Hex(bytes);
    const o = await go(bytes, "full_construction", sourcesFor(30), { marginPct: 12, roundingStepHuf: 10 });
    expect(await sha256Hex(bytes)).toBe(before);
    expect(o.reconciliation.ok).toBe(true);
    expect(o.exportResult.status).toBe("verified");
    if (o.exportResult.status !== "verified") return;
    expect(o.exportResult.fileName).toBe("TESZT_kv_VIBA_arazott_TERVEZET_v01.xlsx");
    expect(o.exportResult.writtenCells).toBe(60);
    const diff = changedZipParts(bytes, o.exportResult.bytes);
    expect(diff.added).toEqual([]); expect(diff.removed).toEqual([]);
    expect(diff.changed.sort()).toEqual(["xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"].sort());
    const out = readWorkbook(o.exportResult.bytes, "o.xlsx").model;
    expect(out.sheets.map((s) => s.name)).toEqual(["Összesítő", "Tételek"]);
    const t = out.sheets[1], s = out.sheets[0];
    expect(t.cells.get("G3")?.f).toBe("ROUNDUP(C3*E3,0)");
    const lines = o.run.result.lines;
    expect(t.cells.get("E3")?.v).toBe(lines[0].writes.find((w) => w.role === "material_unit")!.valueHuf);
    // Lapközi végösszeg mentett eredménye a valódi újraszámolás szerint frissült
    const d2 = s.cells.get("D2")!.v as number;
    expect(d2).toBeCloseTo(o.reconciliation.sheets.filter((x) => x.sheet === "Tételek" && x.role !== "total").reduce((a, x) => a + x.afterHuf, 0), 2);
    const all = Object.values(unzipSync(o.exportResult.bytes)).map((b) => new TextDecoder().decode(b)).join("");
    expect(all).not.toMatch(/VIBA ár- és normasablon|célfedezet|Tartalék|TESZT\b.*forrás/);
    expect(o.exportResult.verification).toMatchObject({ ok: true, unexpectedChanges: [], recalcMismatches: 0, sheetsUnchanged: true });
  });
  it("munkadíjas mód ugyanazon a fájlon: anyag-összeg oszlop nem változik, anyagár cella nem íródik", async () => {
    const bytes = materialLaborBudget(30);
    const o = await go(bytes, "subcontractor_labor", sourcesFor(30));
    expect(o.exportResult.status).toBe("verified");
    expect(o.run.result.totals.materialHuf).toBe(0);
    expect(o.reconciliation.sheets.find((x) => x.role === "material_total")!.deltaHuf).toBe(0);
    if (o.exportResult.status === "verified") expect(readWorkbook(o.exportResult.bytes, "o.xlsx").model.sheets[1].cells.get("E3")?.v).toBe(0);
  });
  it("a munkafüzet saját, más sorra mutató összegképlete eltérésként blokkol (valós mintában előfordult)", async () => {
    const bytes = workbook([["E", [["Megnevezés", "Mennyiség", "ME", "Anyag egységár", "Díj egységár", "Anyag összesen", "Díj összesen"],
      ["Kábel 3x1,5 mm2", 620, "m", null, null, { f: "B3*D2" }, { f: "B3*E2" }], ["Kábel 3x2,5 mm2", 1150, "m", null, null, { f: "B3*D3" }, { f: "B3*E3" }]]]]);
    const src: PriceSourceItem[] = ["Kábel 3x1,5 mm2", "Kábel 3x2,5 mm2"].map((n, i) => ({ id: `x${i}`, kind: "ramon_approved_template", component: "labor", basis: "sell", name: n, unit: "m", unitPriceHuf: 400, priceDate: "2026-11-01", approvalVerified: true, provenance: { label: "TESZT" } }));
    const o = await go(bytes, "subcontractor_labor", src);
    expect(o.reconciliation.ok).toBe(false);
    expect(o.reconciliation.lineMismatches[0]).toMatchObject({ key: "E!2", formula: "B3*E2" });
    expect(o.exportResult.status).toBe("blocked");
  });
  it("nem ellenőrizhető képlet (COUNTIFS) és nem képlet összegoszlop blokkol", async () => {
    const src: PriceSourceItem[] = [{ id: "a", kind: "ramon_approved_template", component: "labor", basis: "sell", name: "Kapcsoló", unit: "db", unitPriceHuf: 900, priceDate: "2026-11-01", approvalVerified: true, provenance: { label: "TESZT" } }];
    const withCountifs = workbook([["E", [["Megnevezés", "Mennyiség", "ME", "Egységár", "Összesen"], ["Kapcsoló", 2, "db", null, { f: "D2*B2" }], [null, null, null, null, { f: "COUNTIFS(B2:B2,2)" }]]]]);
    const a = await go(withCountifs, "subcontractor_labor", src);
    expect(a.exportResult.status).toBe("blocked"); expect(a.reconciliation.problems.join()).toMatch(/COUNTIFS/);
    const constTotal = workbook([["E", [["Megnevezés", "Mennyiség", "ME", "Egységár", "Összesen"], ["Kapcsoló", 2, "db", null, 0]]]]);
    const b = await go(constTotal, "subcontractor_labor", src);
    expect(b.exportResult.status).toBe("blocked"); expect(b.reconciliation.lineMismatches[0].workbookHuf).toMatch(/nem képlet/);
  });
  it("nincs beírható ár → nem készül félrevezető „kész” fájl", async () => {
    const o = await go(materialLaborBudget(3), "subcontractor_labor", []);
    expect(o.exportResult).toMatchObject({ status: "blocked" });
  });
  it("nem Excel fájl elutasítva", async () => {
    await expect(go(new TextEncoder().encode("hello"), "subcontractor_labor", [])).rejects.toThrow(/nem Excel/);
  });
});
