/** P3 — a számítás tömör, szerializálható nézete (UI és Timothy). Nyers fájltartalom, tárolási kulcs, URL nincs benne. */
import type { ComponentResult, LineResult, LineStatus } from "./engine";
import type { BudgetPricingOutput } from "./run-budget-pricing";
import { SOURCE_LABEL } from "./price-sources";

export type ComponentDto = { status: ComponentResult["status"]; reason: string | null; category: string | null; score: number | null; confidence: string | null;
  source: { label: string; name: string; date: string | null; file: string | null; row: number | null; note: string | null } | null;
  candidates: { name: string; kind: string; unitPriceHuf: number | null; score: number }[]; steps: { label: string; huf: number | null }[]; unitHuf: number | null };
export type LineDto = { key: string; sheet: string; row: number; itemNo: string | null; name: string; section: string; qty: number | null; unit: string | null; status: LineStatus;
  reasons: string[]; flags: string[]; unitSellHuf: number | null; materialTotalHuf: number; laborTotalHuf: number; lineTotalHuf: number | null; writes: { address: string; valueHuf: number }[];
  material: ComponentDto | null; labor: ComponentDto | null };

const comp = (c: ComponentResult | null): ComponentDto | null => c && ({
  status: c.status, reason: c.reason, category: c.category, score: c.score == null ? null : Math.round(c.score * 1000) / 1000, confidence: c.confidence,
  source: c.source && { label: c.source.label, name: c.source.name.slice(0, 200), date: c.source.priceDate, file: c.source.provenance?.file ?? null, row: c.source.provenance?.row ?? null, note: c.source.provenance?.note ?? null },
  candidates: c.candidates.slice(0, 3).map((x) => ({ name: x.name, kind: SOURCE_LABEL[x.kind as keyof typeof SOURCE_LABEL] ?? x.kind, unitPriceHuf: x.unitPriceHuf, score: x.score })),
  steps: c.steps.map((s) => ({ label: s.label, huf: s.filler == null ? null : s.filler / 100 })), unitHuf: c.unitFiller == null ? null : c.unitFiller / 100,
});
export const lineDto = (l: LineResult): LineDto => ({ key: l.key, sheet: l.sheet, row: l.row, itemNo: l.itemNo, name: l.name.slice(0, 300), section: l.section.slice(0, 160), qty: l.qty, unit: l.unitRaw,
  status: l.status, reasons: l.reasons, flags: l.flags, unitSellHuf: l.unitSellHuf, materialTotalHuf: l.materialTotalHuf, laborTotalHuf: l.laborTotalHuf, lineTotalHuf: l.lineTotalHuf,
  writes: l.writes.map((w) => ({ address: w.address, valueHuf: w.valueHuf })), material: comp(l.material), labor: comp(l.labor) });

export function summaryDto(o: BudgetPricingOutput) {
  const r = o.run.result;
  return {
    file: { name: o.file.name, format: o.file.format, sha256: o.file.sha256, bytes: o.file.bytes, warnings: o.file.warnings },
    structure: { rowsByKind: o.structure.rowsByKind, skippedSheets: o.structure.skippedSheets,
      layouts: o.structure.layouts.map((l) => ({ sheet: l.sheet, hidden: l.hidden, headerRows: l.headerRows, inferred: l.inferred, ambiguous: l.ambiguous,
        columns: Object.fromEntries(Object.entries(l.columns).map(([k, v]) => [k, Array.isArray(v) ? v.map((c) => l.labels[c] ?? `#${c}`) : l.labels[v as number] ?? `#${v}`])) })) },
    profile: r.profile, asOf: r.asOf, currency: r.currency, vat: r.vat, totals: r.totals, blockers: r.blockers, warnings: r.warnings,
    reconciliation: o.reconciliation,
    adjustments: o.run.adjustments, diff: o.run.diff && { ...o.run.diff, changed: o.run.diff.changed.slice(0, 200) },
    exportResult: o.exportResult.status === "verified"
      ? { status: "verified" as const, fileName: o.exportResult.fileName, sha256: o.exportResult.sha256, writtenCells: o.exportResult.writtenCells, cachedCellsUpdated: o.exportResult.cachedCellsUpdated, changedParts: o.exportResult.changedParts, verification: o.exportResult.verification }
      : { status: o.exportResult.status, reasons: o.exportResult.reasons },
  };
}
