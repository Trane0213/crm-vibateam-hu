/**
 * P3 — munkafüzet beolvasása számításhoz (SheetJS), az eredeti bájtok változtatása nélkül.
 * Az írás külön, szerkezettartó XML-javítással történik (workbook-patch.ts).
 */
import * as XLSX from "xlsx";
import type { CellModel, Scalar, SheetModel, WorkbookModel } from "./formula";

export type WorkbookFormat = "xlsx" | "xlsm" | "xls" | "unknown";
export type ReadWorkbook = { model: WorkbookModel; format: WorkbookFormat; hasMacros: boolean; externalLinks: boolean; warnings: string[] };

export const WORKBOOK_LIMITS = { bytes: 20 * 1024 * 1024, cells: 400_000, sheets: 60 };

export function detectFormat(bytes: Uint8Array, name: string): WorkbookFormat {
  const lower = name.toLowerCase();
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (zip) return lower.endsWith(".xlsm") ? "xlsm" : "xlsx";
  if (ole) return "xls";
  return "unknown";
}

export function readWorkbook(bytes: Uint8Array, name: string): ReadWorkbook {
  if (bytes.length > WORKBOOK_LIMITS.bytes) throw new Error("A munkafüzet túl nagy a számításhoz (20 MB felett).");
  const format = detectFormat(bytes, name);
  if (format === "unknown") throw new Error("A fájl nem Excel munkafüzet (xlsx/xlsm/xls).");
  const wb = XLSX.read(bytes, { type: "array", cellFormula: true, cellNF: false, cellText: false, cellDates: false, bookVBA: true });
  const warnings: string[] = [];
  const hasMacros = !!(wb as { vbaraw?: unknown }).vbaraw || format === "xlsm";
  if (hasMacros) warnings.push("A munkafüzet makrót tartalmaz; makró nem fut, kimenet csak kézi jóváhagyással.");
  let externalLinks = false;
  if (format !== "xls") {
    const text = new TextDecoder("latin1").decode(bytes);
    externalLinks = text.includes("xl/externalLinks/");
    if (externalLinks) warnings.push("A munkafüzet külső munkafüzetre hivatkozik; ezek az értékek nem ellenőrizhetők.");
  }
  if (format === "xls") warnings.push("Régi .xls formátum: számolható, de szerkezettartó árazott másolat csak .xlsx-ből készül.");
  if (wb.SheetNames.length > WORKBOOK_LIMITS.sheets) throw new Error("Túl sok munkalap a számításhoz.");
  const meta = (wb.Workbook?.Sheets ?? []) as { Hidden?: number }[];
  let total = 0;
  const sheets: SheetModel[] = wb.SheetNames.map((sn, i) => {
    const ws = wb.Sheets[sn];
    const cells = new Map<string, CellModel>();
    let maxRow = 0, maxCol = 0;
    for (const k of Object.keys(ws)) {
      if (k[0] === "!") continue;
      const c = ws[k] as XLSX.CellObject;
      const m = /^([A-Z]+)(\d+)$/.exec(k); if (!m) continue;
      let v: Scalar = null;
      if (c.t === "n") v = typeof c.v === "number" ? c.v : null;
      else if (c.t === "s" || c.t === "str" as never) v = c.v == null ? null : String(c.v);
      else if (c.t === "b") v = !!c.v;
      else if (c.t === "e") v = { error: String(c.w ?? "#ERR") };
      else if (c.t === "d") v = c.v instanceof Date ? c.v.toISOString() : String(c.v);
      if (v === null && !c.f) continue;
      cells.set(k, c.f ? { v, f: c.f } : { v });
      const col = XLSX.utils.decode_col(m[1]) + 1, row = Number(m[2]);
      if (row > maxRow) maxRow = row; if (col > maxCol) maxCol = col;
      if (++total > WORKBOOK_LIMITS.cells) throw new Error("A munkafüzet cellaszáma meghaladja a számítási korlátot.");
    }
    const hiddenRows = new Set<number>();
    (ws["!rows"] ?? []).forEach((r, idx) => { if (r?.hidden) hiddenRows.add(idx + 1); });
    return { name: sn, hidden: (meta[i]?.Hidden ?? 0) > 0, cells, hiddenRows, maxRow, maxCol };
  });
  const names = new Map<string, string>();
  for (const n of (wb.Workbook?.Names ?? []) as { Name: string; Ref: string; Sheet?: number }[]) if (n.Sheet == null && n.Ref) names.set(n.Name.toLowerCase(), n.Ref);
  return { model: { sheets, names }, format, hasMacros, externalLinks, warnings };
}
