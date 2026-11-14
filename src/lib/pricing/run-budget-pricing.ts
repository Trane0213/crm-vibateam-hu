/**
 * P3 — kapott költségvetés árazásának teljes, mellékhatás nélküli futása:
 * beolvasás → szerkezetfelismerés → determinisztikus árazás → munkafüzet-szintű újraszámolás és egyeztetés
 * → (kérésre) szerkezettartó TERVEZET XLSX + független visszaellenőrzés. Nem ír adatbázisba, nem küld.
 */
import { extractBudget, type BudgetExtract } from "./budget-extract";
import { calculatePricing, type Adjustment, type PricingRun } from "./engine";
import { isErr, WorkbookEvaluator, type Scalar, type WorkbookModel } from "./formula";
import type { PriceSourceItem } from "./price-sources";
import { resolveProfile, type PricingMode, type ProfileOverrides } from "./profiles";
import { patchXlsx, type CellPatch } from "./workbook-patch";
import { readWorkbook, type WorkbookFormat } from "./workbook";

export type Reconciliation = {
  sheets: { sheet: string; column: string; role: string; beforeHuf: number; afterHuf: number; deltaHuf: number; expectedDeltaHuf: number; ok: boolean }[];
  lineMismatches: { key: string; address: string; formula: string | null; expectedHuf: number; workbookHuf: number | string }[];
  unsupportedFormulas: { fn: string; count: number }[]; formulaErrorsAfter: number; ok: boolean; problems: string[];
};
export type ExportResult =
  | { status: "verified"; fileName: string; bytes: Uint8Array; sha256: string; changedParts: string[]; writtenCells: number; cachedCellsUpdated: number; verification: VerifyReport }
  | { status: "blocked" | "not_requested"; reasons: string[] };
export type VerifyReport = { ok: boolean; cellsCompared: number; unexpectedChanges: string[]; writesConfirmed: number; recalcMismatches: number; sheetsUnchanged: boolean };

export type BudgetPricingInput = { bytes: Uint8Array; fileName: string; mode: PricingMode; overrides?: ProfileOverrides; sources: PriceSourceItem[]; adjustments?: Adjustment[]; asOf: string; buildWorkbook?: boolean };
export type BudgetPricingOutput = {
  file: { name: string; format: WorkbookFormat; sha256: string; bytes: number; warnings: string[] };
  structure: { layouts: BudgetExtract["layouts"]; skippedSheets: BudgetExtract["skippedSheets"]; rowsByKind: Record<string, number> };
  run: PricingRun; reconciliation: Reconciliation; exportResult: ExportResult;
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const tolerance = (formula?: string) => (formula && /ROUND/i.test(formula) ? 1 : 0.01);
const num = (v: Scalar) => (typeof v === "number" ? v : v == null || v === "" ? 0 : NaN);

function reconcile(model: WorkbookModel, ex: BudgetExtract, run: PricingRun, before: WorkbookEvaluator, after: WorkbookEvaluator): Reconciliation {
  const res = run.result, problems: string[] = [];
  const byKey = new Map(res.lines.map((l) => [l.key, l]));
  const lineMismatches: Reconciliation["lineMismatches"] = [];
  const sums = new Map<string, { sheet: string; column: string; role: string; before: number; after: number; expected: number; rounding: number }>();
  for (const row of ex.rows) {
    if (row.kind !== "item" && row.kind !== "zero_qty") continue;
    const sheet = model.sheets.find((s) => s.name === row.sheet)!;
    const line = byKey.get(row.key);
    for (const t of row.totalCells) {
      const b = num(before.value(sheet, t.address)), a = num(after.value(sheet, t.address));
      const k = `${row.sheet}|${t.role}`;
      const s = sums.get(k) ?? { sheet: row.sheet, column: t.address.replace(/\d+$/, ""), role: t.role, before: 0, after: 0, expected: 0, rounding: 0 };
      if (Number.isFinite(b)) s.before += b; if (Number.isFinite(a)) s.after += a;
      if (line?.status === "priced") {
        const exp = t.role === "material_total" ? line.materialTotalHuf : t.role === "labor_total" ? line.laborTotalHuf : line.lineTotalHuf ?? 0;
        s.expected += exp - (Number.isFinite(b) ? b : 0); s.rounding += tolerance(t.formula);
        if (!t.formula) lineMismatches.push({ key: row.key, address: t.address, formula: null, expectedHuf: exp, workbookHuf: "nem képlet — az összeg cella nem számolódik újra" });
        else if (!Number.isFinite(a) || Math.abs(a - exp) > tolerance(t.formula)) lineMismatches.push({ key: row.key, address: t.address, formula: t.formula ?? null, expectedHuf: exp, workbookHuf: Number.isFinite(a) ? a : String(after.value(sheet, t.address) && JSON.stringify(after.value(sheet, t.address))) });
      }
      sums.set(k, s);
    }
  }
  const sheets = [...sums.values()].map((s) => {
    const delta = s.after - s.before; const ok = Math.abs(delta - s.expected) <= Math.max(0.01, s.rounding);
    return { sheet: s.sheet, column: s.column, role: s.role, beforeHuf: Math.round(s.before * 100) / 100, afterHuf: Math.round(s.after * 100) / 100, deltaHuf: Math.round(delta * 100) / 100, expectedDeltaHuf: Math.round(s.expected * 100) / 100, ok };
  });
  if (res.profile.mode === "subcontractor_labor") {
    const leak = sheets.filter((s) => s.role === "material_total" && Math.abs(s.deltaHuf) > 0.005);
    if (leak.length) problems.push(`Munkadíjas módban az anyag-összeg oszlop változott (${leak.map((s) => `${s.sheet}!${s.column}`).join(", ")}).`);
  }
  if (lineMismatches.length) problems.push(`${lineMismatches.length} tételsor összege a munkafüzetben eltér a számítástól vagy nem képlet.`);
  if (sheets.some((s) => !s.ok)) problems.push("Lapszintű összeg-egyeztetés eltér.");
  // Minden képletcella újraszámolása (nem csak a tételsoroké), hogy a nem ellenőrizhető képletek is kiderüljenek.
  let errorsAfter = 0;
  for (const s of model.sheets) for (const [a, c] of s.cells) if (c.f) { const v = after.value(s, a); if (isErr(v) && !String(v.error).startsWith("#UNSUPPORTED") && !(c.v && isErr(c.v))) errorsAfter++; }
  const unsupportedFormulas = [...after.stats.unsupported].map(([fn, count]) => ({ fn, count }));
  if (unsupportedFormulas.length) problems.push(`Nem ellenőrizhető képletek: ${unsupportedFormulas.map((u) => `${u.fn} (${u.count})`).join(", ")}.`);
  if (errorsAfter) problems.push(`${errorsAfter} képlet új hibaértéket ad az árazás után.`);
  return { sheets, lineMismatches: lineMismatches.slice(0, 200), unsupportedFormulas, formulaErrorsAfter: errorsAfter, ok: problems.length === 0, problems };
}

function sameScalar(a: Scalar, b: Scalar) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  if (isErr(a) && isErr(b)) return a.error === b.error;
  return (a ?? "") === (b ?? "");
}

/** Független visszaellenőrzés: a kimenet újraolvasva, minden nem kijelölt cella változatlan, kijelöltek a várt értékűek, mentett képleteredmények = újraszámolt. */
export function verifyPatched(original: WorkbookModel, outBytes: Uint8Array, writes: Map<string, number>, cached: Map<string, Scalar>): VerifyReport {
  const out = readWorkbook(outBytes, "out.xlsx").model;
  const unexpected: string[] = []; let compared = 0, confirmed = 0;
  const sheetsUnchanged = out.sheets.length === original.sheets.length && out.sheets.every((s, i) => s.name === original.sheets[i].name && s.hidden === original.sheets[i].hidden);
  for (const s of original.sheets) {
    const o = out.sheets.find((x) => x.name === s.name); if (!o) { unexpected.push(`Hiányzó lap: ${s.name}`); continue; }
    const keys = new Set([...s.cells.keys(), ...o.cells.keys()]);
    for (const a of keys) {
      const k = `${s.name}!${a}`, before = s.cells.get(a), now = o.cells.get(a); compared++;
      if (writes.has(k)) { if (now?.f || !sameScalar(now?.v ?? null, writes.get(k)!)) unexpected.push(`${k}: írt érték nem egyezik`); else confirmed++; continue; }
      if ((before?.f ?? null) !== (now?.f ?? null)) { unexpected.push(`${k}: képlet változott`); continue; }
      if (before?.f) { const want = cached.has(k) ? cached.get(k)! : before.v; if (!sameScalar(now?.v ?? null, want)) unexpected.push(`${k}: mentett képleteredmény eltér`); continue; }
      if (!sameScalar(before?.v ?? null, now?.v ?? null)) unexpected.push(`${k}: érték változott`);
    }
  }
  const ev = new WorkbookEvaluator(out); let recalc = 0;
  for (const s of out.sheets) for (const [a, c] of s.cells) if (c.f) { const v = ev.value(s, a); if (!(isErr(v) && v.error.startsWith("#UNSUPPORTED")) && !sameScalar(v, c.v)) { if (typeof v === "number" && typeof c.v === "number" && Math.abs(v - c.v) < 1e-6) continue; recalc++; } }
  return { ok: !unexpected.length && sheetsUnchanged && recalc === 0, cellsCompared: compared, unexpectedChanges: unexpected.slice(0, 50), writesConfirmed: confirmed, recalcMismatches: recalc, sheetsUnchanged };
}

export async function runBudgetPricing(input: BudgetPricingInput): Promise<BudgetPricingOutput> {
  const read = readWorkbook(input.bytes, input.fileName);
  const sha = await sha256Hex(input.bytes);
  const before = new WorkbookEvaluator(read.model);
  const ex = extractBudget(read.model, before);
  const profile = resolveProfile(input.mode, input.overrides);
  const run = calculatePricing({ rows: ex.rows, layouts: ex.layouts, sources: input.sources, profile, asOf: input.asOf, adjustments: input.adjustments });
  const writes = new Map<string, number>();
  for (const l of run.result.lines) if (l.status === "priced") for (const w of l.writes) writes.set(`${l.sheet}!${w.address}`, w.valueHuf);
  const after = new WorkbookEvaluator(read.model, new Map(writes));
  const reconciliation = reconcile(read.model, ex, run, before, after);
  const rowsByKind: Record<string, number> = {}; for (const r of ex.rows) rowsByKind[r.kind] = (rowsByKind[r.kind] ?? 0) + 1;
  const out: BudgetPricingOutput = { file: { name: input.fileName, format: read.format, sha256: sha, bytes: input.bytes.length, warnings: read.warnings },
    structure: { layouts: ex.layouts, skippedSheets: ex.skippedSheets, rowsByKind }, run, reconciliation, exportResult: { status: "not_requested", reasons: [] } };
  if (!input.buildWorkbook) return out;
  const reasons: string[] = [];
  if (read.format !== "xlsx") reasons.push(read.format === "xls" ? "Régi .xls: szerkezettartó másolat nem készíthető, előbb biztonságos .xlsx-konverzió és jóváhagyás szükséges." : "Makrós munkafüzet: kimenet csak kézi jóváhagyással.");
  if (read.hasMacros) reasons.push("A munkafüzet makrót tartalmaz.");
  // Külső hivatkozást tartalmazó képlet nem értelmezhető → a nem ellenőrizhető képletek között blokkol; a puszta külső-link rész csak figyelmeztetés.
  if (!writes.size) reasons.push("Nincs automatikusan beírható ár.");
  reasons.push(...run.result.blockers, ...reconciliation.problems);
  if (reasons.length) { out.exportResult = { status: "blocked", reasons: [...new Set(reasons)] }; return out; }
  const patches: CellPatch[] = [], cached = new Map<string, Scalar>();
  for (const [k, v] of writes) { const i = k.lastIndexOf("!"); patches.push({ sheet: k.slice(0, i), address: k.slice(i + 1), kind: "value", value: v }); }
  for (const s of read.model.sheets) for (const [a, c] of s.cells) {
    if (!c.f) continue;
    const v = after.value(s, a);
    if (sameScalar(v, c.v)) continue;
    if (typeof v === "number" || typeof v === "string") { patches.push({ sheet: s.name, address: a, kind: "cached", value: v }); cached.set(`${s.name}!${a}`, v); }
  }
  const patched = patchXlsx(input.bytes, patches);
  const verification = verifyPatched(read.model, patched.bytes, writes, cached);
  if (!verification.ok) { out.exportResult = { status: "blocked", reasons: ["A kimenet visszaellenőrzése sikertelen — nem adható ki.", ...verification.unexpectedChanges.slice(0, 10)] }; return out; }
  const base = input.fileName.replace(/\.[^.]+$/, "");
  out.exportResult = { status: "verified", fileName: `${base}_VIBA_arazott_TERVEZET_v01.xlsx`, bytes: patched.bytes, sha256: await sha256Hex(patched.bytes), changedParts: patched.changedParts,
    writtenCells: writes.size, cachedCellsUpdated: cached.size, verification };
  return out;
}
