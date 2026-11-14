import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildPriceTemplateWorkbook, importPriceTemplate, TEMPLATE_COLUMNS } from "./template-import";

function withRows(rows: (string | number)[][]) {
  const wb = XLSX.read(buildPriceTemplateWorkbook(), { type: "array" });
  XLSX.utils.sheet_add_aoa(wb.Sheets["Ártábla"], rows, { origin: -1 });
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
const row = (o: Partial<Record<(typeof TEMPLATE_COLUMNS)[number], string | number>>) => TEMPLATE_COLUMNS.map((c) => o[c] ?? "");

describe("Ramon ársablon import", () => {
  it("üres sablon: két TESZT mintasor kihagyva, útmutató lap van", () => {
    const imp = importPriceTemplate(buildPriceTemplateWorkbook(), "s.xlsx");
    expect(imp.items).toHaveLength(0); expect(imp.issues.filter((i) => /TESZT/.test(i.message))).toHaveLength(2);
    expect(XLSX.read(buildPriceTemplateWorkbook(), { type: "array" }).SheetNames).toEqual(["Ártábla", "Útmutató"]);
  });
  it("munkadíj + anyag sor két forrássá válik; a fájlban lévő jóváhagyó nem CRM-jóváhagyás", () => {
    const imp = importPriceTemplate(withRows([row({ Azonosító: "K1", Megnevezés: "Kábeltálca 200 mm", ME: "fm", "Munkadíj egységár (Ft)": 4060, "Anyag egységár (Ft)": 3100, "Ár dátuma": "2026.11.10", Jóváhagyta: "Ramon" })]), "s.xlsx");
    expect(imp.items.map((i) => [i.component, i.basis, i.unit, i.unitPriceHuf, i.priceDate, i.approvalVerified])).toEqual([["labor", "sell", "m", 4060, "2026-11-10", false], ["material", "cost", "m", 3100, "2026-11-10", false]]);
    expect(imp.items[0].approvedBy).toBe("Ramon");
  });
  it("hibás sorok tételesen, sorszámmal", () => {
    const imp = importPriceTemplate(withRows([row({ Megnevezés: "A" }), row({ Megnevezés: "B", ME: "db", "Munkadíj egységár (Ft)": -5 }), row({ Megnevezés: "C", ME: "db", "Munkadíj egységár (Ft)": 5, "Ár dátuma": "tegnap" }), row({ Megnevezés: "D", ME: "db", "Munkadíj egységár (Ft)": 5, "Munkadíj ár jellege": "valami", "Ár dátuma": "2026-11-01" })]), "s.xlsx");
    expect(imp.items).toHaveLength(0);
    expect(imp.issues.filter((i) => i.row > 3).map((i) => i.message)).toEqual([expect.stringMatching(/kötelező/), expect.stringMatching(/Negatív/), expect.stringMatching(/dátum/), expect.stringMatching(/jellege/)]);
  });
  it("normaóra jellege és forrásfajta felismerése; dátum nélkül figyelmeztet", () => {
    const imp = importPriceTemplate(withRows([row({ Megnevezés: "Lámpa", ME: "db", "Normaóra (óra/ME)": 0.5, "Normaóra jellege": "mért", "Forrás típusa": "beszállítói ajánlat" })]), "s.xlsx");
    expect(imp.items[0]).toMatchObject({ normHours: 0.5, normBasis: "measured", kind: "supplier_quote", priceDate: null });
    expect(imp.issues.some((i) => /Nincs ár dátuma/.test(i.message))).toBe(true);
  });
});
