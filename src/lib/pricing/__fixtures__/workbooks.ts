/** Csak tesztekhez: kitalált (TESZT) munkafüzetek SheetJS-szel; valós ügyfél- vagy áradat nincs benne. */
import * as XLSX from "xlsx";
import type { PriceSourceItem } from "../price-sources";

type Cell = string | number | null | { f: string; v?: number | string };
export function sheetFrom(rows: Cell[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => (c && typeof c === "object" ? null : c))));
  rows.forEach((r, ri) => r.forEach((c, ci) => { if (c && typeof c === "object") { const a = XLSX.utils.encode_cell({ r: ri, c: ci }); ws[a] = { t: typeof c.v === "string" ? "s" : "n", f: c.f, v: c.v ?? 0 }; } }));
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: Math.max(...rows.map((r) => r.length)) - 1 } });
  return ws;
}
export function workbook(sheets: [string, Cell[][]][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [n, rows] of sheets) XLSX.utils.book_append_sheet(wb, sheetFrom(rows), n);
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** Anyag + díj oszlopos, képletes TESZT költségvetés (Főösszesítő lapközi hivatkozással). n tételsor. */
export function materialLaborBudget(n: number, opts: { roundup?: boolean } = {}) {
  const rows: Cell[][] = [["Ssz.", "Tétel megnevezése", "Menny.", "Egys.", "Anyag egységár", "Díj egységár", "Anyag összesen", "Díj összesen"], [null, "01. TESZT fejezet"]];
  for (let i = 0; i < n; i++) {
    const r = rows.length + 1;
    rows.push([`T.${i + 1}`, `TESZT tétel ${i + 1} kábel ${i % 7 + 1}x${(i % 4) + 1}.5 mm2 szerelése`, (i % 9) + 1 + (i % 3) * 0.5, i % 2 ? "m" : "db", 0, 0,
      { f: opts.roundup ? `ROUNDUP(C${r}*E${r},0)` : `C${r}*E${r}` }, { f: opts.roundup ? `ROUNDUP(C${r}*F${r},0)` : `C${r}*F${r}` }]);
  }
  const last = rows.length;
  rows.push([null, "Nettó összesen:", null, null, null, null, { f: `SUM(G3:G${last})` }, { f: `SUM(H3:H${last})` }]);
  const sum: Cell[][] = [["Munkanem", "Anyag", "Díj", "A+D"], ["TESZT", { f: `'Tételek'!G${last + 1}` }, { f: `'Tételek'!H${last + 1}` }, { f: "B2+C2" }]];
  return workbook([["Összesítő", sum], ["Tételek", rows]]);
}

export function sourcesFor(n: number, kind: PriceSourceItem["kind"] = "ramon_approved_template"): PriceSourceItem[] {
  const out: PriceSourceItem[] = [];
  for (let i = 0; i < n; i++) {
    const name = `TESZT tétel ${i + 1} kábel ${i % 7 + 1}x${(i % 4) + 1}.5 mm2 szerelése`, unit = i % 2 ? "m" : "db";
    out.push({ id: `L${i}`, kind, component: "labor", basis: "sell", name, unit, unitPriceHuf: 1000 + 13 * i, priceDate: "2026-11-01", approvalVerified: true, provenance: { label: "TESZT", row: i } });
    out.push({ id: `M${i}`, kind, component: "material", basis: "cost", name, unit, unitPriceHuf: 500 + 7 * i, priceDate: "2026-11-01", approvalVerified: true, provenance: { label: "TESZT", row: i } });
  }
  return out;
}
