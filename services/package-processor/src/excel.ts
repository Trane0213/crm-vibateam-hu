// Excel / táblázat: munkalapok, cellák, képletek, egyesített cellák, rejtett lapok/sorok szerkezetének
// kiolvasása. Az eredeti fájl változatlan marad (csak olvasunk); makró SOHA nem fut.
// A teljes szerkezet tömörítve a CRM által aláírt "derived" címre kerül (Timothy P3-ban ebből árazhat).
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import XLSX from "xlsx";
import { putBytes } from "./io.ts";
import type { Callback } from "./callback.ts";
import type { ExtractResult, ProcessorJob, Problem, Unit } from "./types.ts";

export type CellOut = [address: string, type: string, value: string | number | boolean | null, formula: string | null, numFmt: string | null];
export type SheetOut = {
  name: string; state: "visible" | "hidden" | "veryHidden"; ref: string | null; rows: number; cols: number;
  merges: string[]; hiddenRows: number[]; hiddenCols: number[]; cells: CellOut[]; formulaCount: number; truncated: boolean;
};
export type WorkbookOut = { v: 1; name: string; sheets: SheetOut[]; definedNames: { name: string; ref: string }[]; hasMacros: boolean; formulaCount: number };
export type CostTable = { sheet: string; headerRow: number; columns: Record<string, string>; itemRows: number; unpricedRows: number };

const MAX_CELLS_PER_SHEET = 1_000_000;

export const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const HEADER_GROUPS: Record<string, RegExp> = {
  name: /^(megnevezes|tetel megnevezese|tetel ?szoveg|leiras|munka megnevezese|anyag megnevezese)/,
  qty: /^(mennyiseg|menny\.?|db)$/,
  unit: /^(egyseg|me|m\.e\.|mertekegyseg|menny\. ?egys(eg)?)$/,
  materialPrice: /^(anyag ?egysegar|anyag ?ar|anyag egysegar)/,
  laborPrice: /^(dij ?egysegar|dij ?ar|munkadij ?egysegar|munkadij)/,
  unitPrice: /^(egysegar|egysegar \(ft\)|nettó egységár|netto egysegar)/,
  total: /^(osszesen|ertek|anyag osszesen|dij osszesen|netto osszesen|ar osszesen)/,
  itemNo: /^(tetelszam|tsz|sorszam|ssz|tetel)$/,
};

/** Árazatlan költségvetés fejlécsorának és tételsorainak felismerése (P3 árazás előkészítése; nem áraz). */
export function detectCostTable(sheet: string, grid: (string | number | null)[][]): CostTable | null {
  for (let r = 0; r < Math.min(grid.length, 60); r++) {
    const row = grid[r] ?? [];
    const cols: Record<string, string> = {};
    row.forEach((v, c) => {
      const t = norm(v);
      if (!t) return;
      for (const [k, re] of Object.entries(HEADER_GROUPS)) if (!cols[k] && re.test(t)) { cols[k] = XLSX.utils.encode_col(c); break; }
    });
    const hits = ["name", "qty", "unit", "materialPrice", "laborPrice", "unitPrice", "total"].filter((k) => cols[k]).length;
    if (hits >= 3 && cols.name) {
      const ci = (k: string) => (cols[k] ? XLSX.utils.decode_col(cols[k]) : -1);
      const priceCols = ["materialPrice", "laborPrice", "unitPrice"].map(ci).filter((x) => x >= 0);
      let items = 0, unpriced = 0;
      for (let i = r + 1; i < grid.length; i++) {
        const line = grid[i] ?? [];
        const name = norm(line[ci("name")]);
        const qty = ci("qty") >= 0 ? line[ci("qty")] : null;
        if (!name || typeof qty !== "number") continue;
        items++;
        if (priceCols.length && priceCols.every((c) => line[c] == null || line[c] === "" || line[c] === 0)) unpriced++;
      }
      return { sheet, headerRow: r + 1, columns: cols, itemRows: items, unpricedRows: unpriced };
    }
  }
  return null;
}

export function workbookStructure(wb: XLSX.WorkBook, name: string): { out: WorkbookOut; grids: Map<string, (string | number | null)[][]> } {
  const sheets: SheetOut[] = [];
  const grids = new Map<string, (string | number | null)[][]>();
  let formulaCount = 0;
  const meta = (wb.Workbook?.Sheets ?? []) as { Hidden?: number }[];
  wb.SheetNames.forEach((sn, idx) => {
    const ws = wb.Sheets[sn] as any;
    const ref: string | null = ws?.["!ref"] ?? null;
    const range = ref ? XLSX.utils.decode_range(ref) : null;
    const cells: CellOut[] = [];
    const grid: (string | number | null)[][] = [];
    let fc = 0, truncated = false;
    if (range) {
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr];
          if (!cell) continue;
          if (cells.length >= MAX_CELLS_PER_SHEET) { truncated = true; break; }
          const v = cell.v === undefined ? null : cell.v instanceof Date ? cell.v.toISOString() : cell.v;
          if (cell.f) fc++;
          cells.push([addr, cell.t, v as any, cell.f ? String(cell.f) : null, cell.z ? String(cell.z) : null]);
          if (r - range.s.r < 5000) {
            (grid[r - range.s.r] ??= [])[c] = typeof v === "number" ? v : v == null ? null : String(v);
          }
        }
        if (truncated) break;
      }
    }
    formulaCount += fc;
    grids.set(sn, grid);
    const hidden = meta[idx]?.Hidden ?? 0;
    sheets.push({
      name: sn, state: hidden === 2 ? "veryHidden" : hidden === 1 ? "hidden" : "visible", ref,
      rows: range ? range.e.r - range.s.r + 1 : 0, cols: range ? range.e.c - range.s.c + 1 : 0,
      merges: ((ws?.["!merges"] ?? []) as XLSX.Range[]).map((m) => XLSX.utils.encode_range(m)),
      hiddenRows: ((ws?.["!rows"] ?? []) as any[]).flatMap((r, i) => (r?.hidden ? [i + 1] : [])),
      hiddenCols: ((ws?.["!cols"] ?? []) as any[]).flatMap((c, i) => (c?.hidden ? [i + 1] : [])),
      cells, formulaCount: fc, truncated,
    });
  });
  const definedNames = ((wb.Workbook?.Names ?? []) as any[]).map((n) => ({ name: String(n.Name), ref: String(n.Ref) }));
  return { out: { v: 1, name, sheets, definedNames, hasMacros: !!(wb as any).vbaraw, formulaCount }, grids };
}

/** Munkalap szöveges nézete kereséshez és AI-olvasáshoz (sor | oszlop: érték; képlet jelölve). */
export function sheetText(sheet: SheetOut, maxChars: number): string {
  const lines: string[] = [];
  let row = -1, cur: string[] = [];
  let len = 0;
  for (const [addr, , v, f] of sheet.cells) {
    const { r } = XLSX.utils.decode_cell(addr);
    if (r !== row) { if (cur.length) { const l = `${row + 1} | ${cur.join(" | ")}`; lines.push(l); len += l.length + 1; } row = r; cur = []; if (len > maxChars) break; }
    if (v === null || v === "") continue;
    cur.push(`${addr.replace(/\d+$/, "")}: ${String(v)}${f ? ` [=${f}]` : ""}`);
  }
  if (cur.length && len <= maxChars) lines.push(`${row + 1} | ${cur.join(" | ")}`);
  return lines.join("\n").slice(0, maxChars);
}

export async function processSpreadsheet(job: ProcessorJob, path: string, cb: Callback): Promise<Omit<ExtractResult, "sha256Ok">> {
  const problems: Problem[] = [];
  if (job.size > job.limits.maxSpreadsheetBytes) {
    return { parser: "sheetjs", status: "not_supported", summary: {}, problems: [{ code: "spreadsheet_too_large", detail: `${job.size} bájt` }] };
  }
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(await readFile(path), { type: "buffer", cellFormula: true, cellNF: true, cellDates: false, bookVBA: true, cellStyles: false, sheetStubs: false });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const encrypted = /password|encrypt/i.test(msg);
    return { parser: "sheetjs", status: "unreadable", encrypted, summary: {}, problems: [{ code: encrypted ? "encrypted" : "spreadsheet_damaged", detail: msg.slice(0, 300) }] };
  }
  const { out, grids } = workbookStructure(wb, job.name);
  if (out.hasMacros) problems.push({ code: "macros_present", detail: "A makrók nem futottak; az eredeti fájl változatlan." });
  for (const s of out.sheets) {
    if (s.state !== "visible") problems.push({ code: "hidden_sheet", sheet: s.name });
    if (s.truncated) problems.push({ code: "sheet_truncated", sheet: s.name });
    if (s.cells.some((c) => c[3] && /\[\d+\]|\[[^\]]+\.xls/i.test(c[3]))) problems.push({ code: "external_links", sheet: s.name });
  }
  const costTables = out.sheets.map((s) => detectCostTable(s.name, grids.get(s.name) ?? [])).filter(Boolean) as CostTable[];

  let structureUploaded = false;
  if (job.derivedPutUrl) {
    try { await putBytes(job.derivedPutUrl, gzipSync(Buffer.from(JSON.stringify(out))), "application/gzip"); structureUploaded = true; }
    catch (e: any) { problems.push({ code: "structure_upload_failed", detail: String(e?.message ?? "").slice(0, 200) }); }
  }
  const units: Unit[] = out.sheets.map((s, i) => ({ unitKind: "sheet", unitNo: i + 1, label: s.name, source: "sheet", text: sheetText(s, job.limits.maxUnitChars) }));
  for (let i = 0; i < units.length; i += 20) await cb("units", { units: units.slice(i, i + 20) });

  return {
    parser: "sheetjs", status: problems.some((p) => p.code === "sheet_truncated") ? "partial" : "done",
    sheetCount: out.sheets.length, formulaCount: out.formulaCount, hasMacros: out.hasMacros, structureUploaded,
    summary: {
      sheets: out.sheets.map((s) => ({ name: s.name, state: s.state, ref: s.ref, rows: s.rows, cols: s.cols, formulas: s.formulaCount, merges: s.merges.length })),
      definedNames: out.definedNames.length, costTables,
    },
    problems,
  };
}
