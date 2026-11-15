import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { runBudgetPricing } from "./run-budget-pricing";
import { buildFillTemplateWorkbook, importPriceTemplate } from "./template-import";
import { workbook } from "./__fixtures__/workbooks";
import { readWorkbook } from "./workbook";

const AS_OF = "2026-11-15";
/** Árazatlan, munkadíjas költségvetés: 3 sor, ebből 2 azonos megnevezés + ME. */
function budget() {
  const rows: any[][] = [["Ssz.", "Tétel megnevezése", "Menny.", "Egys.", "Díj egységár", "Díj összesen"], [null, "01. Erősáram"]];
  const names = [["Dugaszolóaljzat 2x2P+F falon kívüli szerelése", "db", 4], ["NYM-J 3x2,5 kábel szerelése védőcsőben", "m", 120], ["Dugaszolóaljzat 2x2P+F falon kívüli szerelése", "db", 6]];
  for (const [n, u, q] of names) { const r = rows.length + 1; rows.push([`T.${r}`, n, q, u, 0, { f: `C${r}*E${r}` }]); }
  rows.push([null, "Nettó összesen:", null, null, null, { f: `SUM(F3:F${rows.length})` }]);
  return workbook([["Tételek", rows]]);
}
const go = (bytes: Uint8Array, sources: any[]) => runBudgetPricing({ bytes, fileName: "kv.xlsx", mode: "subcontractor_labor", sources, asOf: AS_OF, buildWorkbook: true, overrides: { laborRateHuf: 12000 } });

describe("kitöltendő ártábla", () => {
  it("ár nélküli tételekből összevont, ár nélküli ártábla készül", async () => {
    const o = await go(budget(), []);
    expect(o.run.result.totals.byStatus.priced).toBe(0);
    const fill = buildFillTemplateWorkbook(o.run.result.lines, { asOf: AS_OF, mode: "subcontractor_labor", budgetFileName: "kv.xlsx" });
    expect(fill.rows).toBe(2); // a két azonos dugaszolóaljzat-sor egy ártábla-sor
    const sheet = readWorkbook(fill.bytes, "t.xlsx").model.sheets[0];
    expect(["", null]).toContain(sheet.cells.get("G2")?.v ?? null); // árat nem tölt ki
    expect(importPriceTemplate(fill.bytes, "t.xlsx").items).toHaveLength(0); // kitöltetlenül nincs ár
  });

  it("kitöltve és visszatöltve minden sor beárazódik, és ellenőrzött XLSX készül", async () => {
    const o = await go(budget(), []);
    const fill = buildFillTemplateWorkbook(o.run.result.lines, { asOf: AS_OF, mode: "subcontractor_labor", budgetFileName: "kv.xlsx" });
    const wb = XLSX.read(fill.bytes, { type: "array" }); const ws = wb.Sheets["Ártábla"]!;
    ws["G2"] = { t: "n", v: 3500 }; ws["G3"] = { t: "n", v: 900 };
    const filled = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    const imp = importPriceTemplate(filled, "kitoltott.xlsx");
    expect(imp.items).toHaveLength(2);
    const o2 = await go(budget(), imp.items);
    expect(o2.run.result.totals.byStatus.priced).toBe(3);
    expect(o2.run.result.totals.netHuf).toBe(3500 * 10 + 900 * 120);
    expect(o2.exportResult.status).toBe("verified");
  });

  it("TESZT kezdetű tételnév a költségvetés saját sora esetén nem vész el", async () => {
    const rows: any[][] = [["Ssz.", "Tétel megnevezése", "Menny.", "Egys.", "Díj egységár", "Díj összesen"], ["T.1", "TESZT lámpatest szerelése", 2, "db", 0, { f: "C2*E2" }], [null, "Nettó összesen:", null, null, null, { f: "SUM(F2:F2)" }]];
    const o = await go(workbook([["Tételek", rows]]), []);
    const fill = buildFillTemplateWorkbook(o.run.result.lines, { asOf: AS_OF, mode: "subcontractor_labor", budgetFileName: "kv.xlsx" });
    const wb = XLSX.read(fill.bytes, { type: "array" }); wb.Sheets["Ártábla"]!["G2"] = { t: "n", v: 1000 };
    expect(importPriceTemplate(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer), "k.xlsx").items).toHaveLength(1);
  });
});

describe("megrendelői Excel eredeti képlethibái", () => {
  it("körkörös összeg nem „új hiba”, hanem cellára pontos, javítható jelzés, és az export tiltott marad", async () => {
    const rows: any[][] = [["Ssz.", "Tétel megnevezése", "Menny.", "Egys.", "Díj egységár", "Díj összesen"], ["T.1", "Lámpatest szerelése", 2, "db", 0, { f: "C2*E2" }], [null, "Nettó összesen:", null, null, null, { f: "SUM(F2:F3)" }]];
    const o = await go(workbook([["Tételek", rows]]), []);
    expect(o.reconciliation.formulaErrorsAfter).toBe(0);
    expect(o.reconciliation.problems.join(" ")).toContain("'Tételek'!F3 = SUM(F2:F3)");
    expect(o.exportResult.status).toBe("blocked");
  });
});
