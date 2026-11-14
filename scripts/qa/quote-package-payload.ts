/** Izolált P5 UI-próbához: valódi csomagmotorral (P3+P4) számolt DTO kitalált TESZT-munkafüzetből. Nem olvas éles adatot. */
import { prepareQuotePackage } from "@/lib/quote-package/package.server";
import { packageDto } from "@/lib/quote-package/package-dto";
import { materialLaborBudget, sourcesFor } from "@/lib/pricing/__fixtures__/workbooks";

const Q = process.argv[2]!, B = process.argv[3]!, N = 14, bytes = materialLaborBudget(N);
const tables: Record<string, Record<string, unknown>[]> = {
  quotes: [{ id: Q, title: "TESZT csarnok villamos felújítás", version: 2, alternative_key: "A", quote_kind: "received_budget", scope_type: "labor_only", technical_scope: "Erősáramú szerelés a kiírás szerint\nÁtadási mérési jegyzőkönyv", exclusions: "Gyengeáramú rendszerek", valid_until: "2026-12-31", manual_net_amount: null, locked_at: null, status: "draft", contact_id: null }],
  quote_documents: [{ id: B, quote_id: Q, name: "TESZT_arazatlan.xlsx", file_url: "k/b.xlsx", size_bytes: bytes.length, document_type: "unpriced_budget", created_at: "2026-11-15" }],
};
const from = (t: string) => { const f: [string, unknown, boolean][] = []; const run = () => (tables[t] ?? []).filter((r) => f.every(([c, v, isIn]) => (isIn ? (v as unknown[]).includes(r[c]) : r[c] === v)));
  const b: any = { select: () => b, eq: (c: string, v: unknown) => (f.push([c, v, false]), b), in: (c: string, v: unknown[]) => (f.push([c, v, true]), b), order: () => b, limit: () => b, maybeSingle: async () => ({ data: run()[0] ?? null, error: null }), then: (r: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(r) }; return b; };
const sb = { from, rpc: async () => ({ data: "sales", error: null }) } as never;
const p = await prepareQuotePackage(sb, "TESZT", { quoteId: Q, budgetDocumentId: null, overrides: {}, template: null, includeFiles: true }, { download: async () => bytes, referenceSources: () => sourcesFor(N), asOf: "2026-11-15" });
process.stdout.write(JSON.stringify({ ok: true, pkg: packageDto(p) }));
