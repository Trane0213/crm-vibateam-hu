import { describe, expect, it, vi } from "vitest";
vi.mock("../r2.server", () => ({ presignR2Url: () => { throw new Error("no network in tests"); } }));
import { assertPricingRole, priceQuoteBudget } from "./pricing.server";
import { kv11026ReferenceSources, KV11026_REFERENCE_META } from "./reference-kv11026.server";
import { materialLaborBudget, sourcesFor } from "./__fixtures__/workbooks";

type Row = Record<string, unknown> | null;
function fakeSb(opts: { role: string | null; quote?: Row; doc?: Row }) {
  const calls: string[] = [];
  const q = (table: string) => {
    const filters: [string, unknown][] = [];
    const b = { select: () => b, eq: (c: string, v: unknown) => { filters.push([c, v]); return b; },
      maybeSingle: async () => { calls.push(`${table}:${filters.map((f) => f.join("=")).join("&")}`); return { data: table === "quotes" ? opts.quote ?? null : opts.doc ?? null, error: null }; } };
    return b;
  };
  return { sb: { rpc: async () => ({ data: opts.role, error: null }), from: q } as never, calls };
}
const input = { quoteId: "11111111-1111-4111-8111-111111111111", documentId: "22222222-2222-4222-8222-222222222222", mode: "subcontractor_labor" as const, overrides: {}, includeReference: false, template: null, adjustments: [], buildWorkbook: false };
const doc = { id: input.documentId, quote_id: input.quoteId, name: "TESZT.xlsx", file_url: "quote-documents/q/unpriced_budget/x.xlsx", size_bytes: 1000, document_type: "unpriced_budget" };

describe("jogosultság (negatív esetek)", () => {
  it.each(["marketing", "project_manager", null])("%s szerepkör elutasítva", async (role) => {
    await expect(assertPricingRole(fakeSb({ role }).sb, "u")).rejects.toThrow(/Tulajdonos és Sales/);
  });
  it.each(["owner", "sales"])("%s engedélyezett", async (role) => { await expect(assertPricingRole(fakeSb({ role }).sb, "u")).resolves.toBe(role); });
  it("nem látható ajánlat (RLS) → elutasítás, fájl nem töltődik", async () => {
    const download = vi.fn();
    await expect(priceQuoteBudget(fakeSb({ role: "sales", quote: null, doc }).sb, "u", input, { download })).rejects.toThrow(/nem hozzáférhető/);
    expect(download).not.toHaveBeenCalled();
  });
  it("másik ajánlat dokumentuma / nem költségvetés típus / külső vagy kilépő kulcs elutasítva", async () => {
    const download = vi.fn();
    const quote = { id: input.quoteId, quote_kind: "received_budget", locked_at: null };
    const f = fakeSb({ role: "sales", quote, doc: null });
    await expect(priceQuoteBudget(f.sb, "u", input, { download })).rejects.toThrow(/más ajánlathoz/);
    expect(f.calls[1]).toContain(`quote_id=${input.quoteId}`);
    await expect(priceQuoteBudget(fakeSb({ role: "sales", quote, doc: { ...doc, document_type: "technical_plan" } }).sb, "u", input, { download })).rejects.toThrow(/költségvetés-típusú/);
    for (const key of ["../x.xlsx", "https://evil/x.xlsx", "/abs.xlsx"]) await expect(priceQuoteBudget(fakeSb({ role: "sales", quote, doc: { ...doc, file_url: key } }).sb, "u", input, { download })).rejects.toThrow(/kulcs/);
    expect(download).not.toHaveBeenCalled();
  });
  it("jogosult Sales: számítás fut, nem ír (csak select hívások)", async () => {
    const quote = { id: input.quoteId, quote_kind: "received_budget", locked_at: null };
    const f = fakeSb({ role: "sales", quote, doc });
    const r = await priceQuoteBudget(f.sb, "u", input, { download: async () => materialLaborBudget(5), referenceSources: () => sourcesFor(5) });
    expect(r.output.run.result.totals.lines).toBe(5);
    expect(f.calls.every((c) => /^(quotes|quote_documents):/.test(c))).toBe(true);
  });
});

describe("beépített korábbi VIBA-díj referencia", () => {
  const src = kv11026ReferenceSources();
  it("299 munkadíjtétel, kiküldött ajánlat dátumával, jóváhagyás nem igazolt", () => {
    expect(src).toHaveLength(KV11026_REFERENCE_META.rows); expect(src).toHaveLength(299);
    expect(new Set(src.map((s) => `${s.kind}|${s.component}|${s.basis}|${s.priceDate}|${s.approvalVerified}`))).toEqual(new Set(["viba_historical_quote|labor|sell|2026-10-29|false"]));
    expect(src.filter((s) => s.unitPriceHuf == null)).toHaveLength(9);
    expect(src.filter((s) => s.fixed)).toHaveLength(8);
  });
  it("rövid altételek kontextusa a megelőző leíró tétel", () => {
    const short = src.filter((s) => s.name.trim() === "3x4 mm2");
    expect(short.length).toBeGreaterThanOrEqual(2);
    expect(new Set(short.map((s) => s.context)).size).toBe(short.length);
  });
});
