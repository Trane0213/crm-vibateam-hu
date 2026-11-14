import { readWorkbook } from "/dev-server/src/lib/pricing/workbook.ts";
import { WorkbookEvaluator } from "/dev-server/src/lib/pricing/formula.ts";
import { extractBudget } from "/dev-server/src/lib/pricing/budget-extract.ts";
import { readFileSync } from "fs";
const f = process.argv[2];
const wb = readWorkbook(new Uint8Array(readFileSync(f)), f.split("/").pop()!);
const ex = extractBudget(wb.model as any, new WorkbookEvaluator(wb.model as any));
console.log(ex.layouts.map((l: any) => `${l.sheet} cols=${JSON.stringify(l.columns)} amb=${l.ambiguous}`).join("\n"));
for (const r of ex.rows.filter((r: any) => r.kind === "item" || r.kind==="zero_qty" || r.kind==="section")) console.log(r.kind[0], r.key, "|", r.section.slice(0,30), "|", r.name.replace(/\s+/g," ").slice(0, 120), "|", r.qty, r.unit, r.flags.join(","));
