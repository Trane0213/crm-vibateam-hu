/**
 * P4 valós-fájl ellenőrzés (csak helyi, csak olvasás): a megadott mappában lévő PDF-ek és opcionális költségvetés
 * a CRM kódjával (pdfPages + runPlanReview). Bemenetet a repóba nem másolunk; kimenet összefoglaló JSON stdout-ra.
 * Használat: bun run scripts/qa/p4-real-check.ts <mappa> [regex] [kiírás.xlsx|xls]
 */
import { readdirSync, readFileSync } from "fs";
import { pdfPages } from "../../src/lib/plans/plan-source.server";
import { runPlanReview } from "../../src/lib/plans/plan-review";
import { readWorkbook } from "../../src/lib/pricing/workbook";
import { WorkbookEvaluator } from "../../src/lib/pricing/formula";
import { extractBudget } from "../../src/lib/pricing/budget-extract";
import { resolveProfile } from "../../src/lib/pricing/profiles";
import type { PlanFile, PlanPage } from "../../src/lib/plans/plan-text";

const [dir, re, budgetPath] = [process.argv[2]!, new RegExp(process.argv[3] ?? "."), process.argv[4]];
const files: PlanFile[] = [], pages: PlanPage[] = [];
const t0 = Date.now();
for (const name of readdirSync(dir).filter((f) => f.endsWith(".pdf") && re.test(f)).sort()) {
  const r = await pdfPages(new Uint8Array(readFileSync(`${dir}/${name}`)), name, 80);
  files.push({ fileId: name, fileName: name.replace(/^\d+_/, ""), path: null, origin: "fixture", pageCount: r.pageCount, status: "read" }); pages.push(...r.pages);
}
let budget = null;
if (budgetPath) { const wb = readWorkbook(new Uint8Array(readFileSync(budgetPath)), budgetPath); budget = { extract: extractBudget(wb.model, new WorkbookEvaluator(wb.model)), fileName: budgetPath.split("/").pop()! }; }
const out = runPlanReview({ files, pages, budget, clarifications: [], sources: [], profile: resolveProfile("full_construction", { marginPct: 15 }), asOf: "2026-11-15" });
console.log(JSON.stringify({
  ms: Date.now() - t0, files: files.length, pages: pages.length,
  matrix: out.matrix.map((m) => `${m.fileName}: ${m.label} ${m.readablePages}/${m.pages}`),
  drawings: out.drawings.map((d) => ({ no: d.drawingNo, sheets: d.sheetNos, total: d.sheetTotal, dates: d.dates, revs: d.revisions, issues: d.issues.map((i) => i.code) })),
  cabinets: out.cabinets.map((c) => ({ id: c.id, status: c.status, enclosure: c.enclosure?.description.slice(0, 90) ?? null, explicit: c.lines.filter((l) => l.basis === "explicit_list").map((l) => `${l.qty ?? "?"}× ${l.description}`), rec: c.reconciliation.map((r) => `${r.cls}:${r.explicit}/${r.schematic}`), circuits: c.circuits.length, questions: c.questions.length })),
  estimates: out.pricing.estimates.map((e) => ({ id: e.cabinetId, complete: e.totals.complete, fullPriceHuf: e.totals.fullPriceHuf, open: e.totals.openLines })),
  findings: out.findings.map((f) => `${f.id} ${f.category}/${f.severity}: ${f.title.slice(0, 120)}`), questions: out.questions.length,
}, null, 1));
