import { runPlanReview } from "/dev-server/src/lib/plans/plan-review.ts";
import { readWorkbook } from "/dev-server/src/lib/pricing/workbook.ts";
import { WorkbookEvaluator } from "/dev-server/src/lib/pricing/formula.ts";
import { extractBudget } from "/dev-server/src/lib/pricing/budget-extract.ts";
import { resolveProfile } from "/dev-server/src/lib/pricing/profiles.ts";
import { readFileSync } from "fs";
const all = JSON.parse(await Bun.file("/tmp/realplans/pages.json").text());
const sel = new RegExp(process.argv[2] ?? "Ge-|Herce");
const files: any[] = [], pages: any[] = [];
for (const [name, pgs] of Object.entries<any>(all)) { if (!sel.test(name)) continue; files.push({ fileId: name, fileName: name.replace(/^\d+_/, ""), path: null, origin: "fixture", pageCount: pgs.length, status: "read" });
  pgs.forEach((p: any, i: number) => pages.push({ fileId: name, page: i + 1, source: "text_layer", aiExtracted: false, width: p.w, height: p.hgt, items: p.items.map((x: any) => ({ s: x.s, x: x.x, y: x.y })), text: "" })); }
let budget = null;
if (process.argv[3]) { const wb = readWorkbook(new Uint8Array(readFileSync(process.argv[3])), "kiiras.xls"); budget = { extract: extractBudget(wb.model as any, new WorkbookEvaluator(wb.model as any)), fileName: process.argv[3].split("/").pop()! }; }
const r = runPlanReview({ files, pages, budget, clarifications: [], sources: [], profile: resolveProfile("full_construction", { marginPct: 15 }), asOf: "2026-11-15" });
for (const f of r.findings) console.log(f.id, f.category.padEnd(12), f.severity.padEnd(6), f.title.slice(0, 150), "| rows:", f.rows.map((x) => x.key).join(","), "| ev:", f.evidence.map((e) => `${e.kind}:${e.fileName?.slice(0, 20) ?? ""}:${e.page ?? e.ref ?? ""}`).join(";"));
console.log("Q", r.questions.length); for (const q of r.questions) console.log(" -", q.slice(0, 170));
for (const e of r.pricing.estimates) console.log("EST", e.cabinetId, e.status, JSON.stringify(e.totals));
