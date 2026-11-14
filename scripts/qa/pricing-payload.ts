/** QA: a „Költségvetés árazása” panel izolált próbájához valódi motorral számolt TESZT-eredmény (kitalált munkafüzet és árak). */
import { runBudgetPricing } from "../../src/lib/pricing/run-budget-pricing";
import { lineDto, summaryDto } from "../../src/lib/pricing/pricing-dto";
import { materialLaborBudget, sourcesFor } from "../../src/lib/pricing/__fixtures__/workbooks";
const out = process.argv[2] ?? "/tmp/browser/pricing/payload.json";
const o = await runBudgetPricing({ bytes: materialLaborBudget(40), fileName: "TESZT_arazatlan.xlsx", mode: "full_construction", sources: sourcesFor(32), asOf: "2026-11-15", buildWorkbook: true, overrides: { marginPct: 15, contingencyPct: 5, roundingStepHuf: 10 } });
let b64: string | null = null;
if (o.exportResult.status === "verified") b64 = Buffer.from(o.exportResult.bytes).toString("base64");
await Bun.write(out, JSON.stringify({ ok: true, summary: summaryDto(o), lines: o.run.result.lines.map(lineDto), linesTruncated: false, template: null, sourcesUsed: { reference: true, templateItems: 0, total: 64 }, quote: { id: "q", kind: "received_budget", locked: false }, workbookBase64: b64 }));
console.log("payload", o.exportResult.status, o.run.result.totals.byStatus);
