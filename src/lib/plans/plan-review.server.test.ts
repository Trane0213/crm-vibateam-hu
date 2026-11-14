import { describe, expect, it, vi } from "vitest";
vi.mock("../r2.server", () => ({ presignR2Url: () => { throw new Error("no network in tests"); } }));
import { reviewQuotePlans, rulesFrom, verifyClarifications } from "./plan-review.server";
import type { PlanReviewRequest } from "./plan-review-schema";

type Tables = Record<string, Record<string, unknown>[]>;
function fakeSb(opts: { role: string | null; tables: Tables; mailboxes?: { userId: string; email: string }[] }) {
  const calls: { table: string; op: string; filters: string[] }[] = [];
  const from = (table: string) => {
    const filters: [string, string, unknown][] = []; let op = "select";
    const run = () => {
      calls.push({ table, op, filters: filters.map((f) => `${f[0]}:${f[1]}=${JSON.stringify(f[2])}`) });
      const rows = (opts.tables[table] ?? []).filter((r) => filters.every(([k, c, v]) => (k === "eq" ? r[c] === v : k === "in" ? (v as unknown[]).includes(r[c]) : true)));
      return rows;
    };
    const b: any = {
      select: () => b, eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b), in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), b),
      order: () => b, limit: () => b, gte: () => b,
      insert: () => { op = "insert"; return b; }, update: () => { op = "update"; return b; }, delete: () => { op = "delete"; return b; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
    };
    return b;
  };
  const rpc = async (name: string) => (name === "crm_role_of" ? { data: opts.role, error: null } : name === "crm_mailboxes" ? { data: opts.mailboxes ?? [], error: null } : { data: null, error: { message: "x" } });
  return { sb: { from, rpc } as never, calls };
}
const Q = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", L = "33333333-3333-4333-8333-333333333333";
const base: PlanReviewRequest = { quoteId: Q, budgetDocumentId: null, mode: "subcontractor_labor", overrides: {}, rules: null, adjustments: [], clarifications: [], template: null };
const quote = { id: Q, quote_kind: "received_budget", lead_id: L, project_id: null };

describe("P4 tervellenőrzés jogosultság és adatkezelés (negatív esetek)", () => {
  it.each(["marketing", "project_manager", null])("%s szerepkör elutasítva, fájl nem töltődik", async (role) => {
    const download = vi.fn();
    await expect(reviewQuotePlans(fakeSb({ role, tables: { quotes: [quote] } }).sb, "u", base, { download, referenceSources: () => [] })).rejects.toThrow(/Tulajdonos és Sales/);
    expect(download).not.toHaveBeenCalled();
  });
  it("nem látható ajánlat (RLS) → elutasítás", async () => {
    await expect(reviewQuotePlans(fakeSb({ role: "sales", tables: {} }).sb, "u", base, { download: vi.fn(), referenceSources: () => [] })).rejects.toThrow(/nem hozzáférhető/);
  });
  it("más ajánlat költségvetése / nem költségvetés típus elutasítva", async () => {
    const download = vi.fn();
    const other = { id: B, quote_id: "99999999-9999-4999-8999-999999999999", name: "x.xlsx", file_url: "k/x.xlsx", size_bytes: 10, document_type: "unpriced_budget" };
    await expect(reviewQuotePlans(fakeSb({ role: "sales", tables: { quotes: [quote], quote_documents: [other] } }).sb, "u", { ...base, budgetDocumentId: B }, { download, referenceSources: () => [] })).rejects.toThrow(/más ajánlathoz/);
    await expect(reviewQuotePlans(fakeSb({ role: "sales", tables: { quotes: [quote], quote_documents: [{ ...other, quote_id: Q, document_type: "technical_plan" }] } }).sb, "u", { ...base, budgetDocumentId: B }, { download, referenceSources: () => [] })).rejects.toThrow(/költségvetés-típusú/);
    expect(download).not.toHaveBeenCalled();
  });
  it("nagy terv → nagyfájlos feldolgozó szükséges (nem töltődik le); nem PDF → jelölve; csak olvasás", async () => {
    const docs = [
      { id: "d1", quote_id: Q, name: "nagy_terv.pdf", file_url: "k/nagy.pdf", size_bytes: 300 * 1024 * 1024, document_type: "technical_plan", mime_type: "application/pdf" },
      { id: "d2", quote_id: Q, name: "rajz.dwg", file_url: "k/rajz.dwg", size_bytes: 1000, document_type: "technical_plan", mime_type: "application/octet-stream" },
      { id: "d3", quote_id: Q, name: "hamis.pdf", file_url: "k/hamis.pdf", size_bytes: 10, document_type: "technical_plan", mime_type: "application/pdf" },
      { id: "d4", quote_id: Q, name: "kilep.pdf", file_url: "../x.pdf", size_bytes: 10, document_type: "technical_plan", mime_type: "application/pdf" },
    ];
    const download = vi.fn(async () => new Uint8Array([0x50, 0x4b, 3, 4]));
    const f = fakeSb({ role: "sales", tables: { quotes: [quote], quote_documents: docs } });
    const r = await reviewQuotePlans(f.sb, "u", base, { download, referenceSources: () => [] });
    expect(Object.fromEntries(r.files.map((x) => [x.fileName, x.status]))).toEqual({ "nagy_terv.pdf": "processor_required", "rajz.dwg": "not_pdf", "hamis.pdf": "not_pdf", "kilep.pdf": "failed" });
    expect(download).toHaveBeenCalledTimes(1);
    expect(f.calls.every((c) => c.op === "select")).toBe(true);
    expect(r.result.matrix.every((m) => m.status === "not_processed")).toBe(true);
    expect(r.result.completeness.allTextRead).toBe(false);
  });
  it("P2 feldolgozott csomagoldalak a hívó RLS-ével olvasva (fájlletöltés nélkül)", async () => {
    const tables: Tables = { quotes: [quote], quote_documents: [], document_packages: [{ id: "p1", quote_id: Q }],
      package_files: [{ id: "f1", package_id: "p1", name: "E-05.pdf", relative_path: "Tervek/E-05.pdf", size_bytes: 600 * 1024 * 1024, sha256: "ab", r2_key: "pk/f1", status: "verified", mime_type: "application/pdf" }],
      package_file_units: [{ file_id: "f1", unit_kind: "page", unit_no: 1, source: "text_layer", text: "Rajzszám:\nE-05\nAL1 jelű elosztó terve\n2. lap", ai_extracted: false }], package_file_extracts: [{ file_id: "f1", page_count: 1 }] };
    const download = vi.fn();
    const r = await reviewQuotePlans(fakeSb({ role: "owner", tables }).sb, "u", base, { download, referenceSources: () => [] });
    expect(download).not.toHaveBeenCalled();
    expect(r.result.pageIdentities[0]).toMatchObject({ fileId: "pf:f1", page: 1 });
    expect(r.result.pageIdentities[0]!.drawingNo?.value).toBe("E-05");
  });
});

describe("e-mailes pontosítás csak igazolt idézettel", () => {
  const E = (id: string, o: Record<string, unknown>) => ({ id, body: "Kedves Ramon! A KT elosztó szekrénytestét a megrendelő biztosítja. Üdv", snippet: null, from_email: "m@teszt.hu", internal_date: "2026-11-10", owner_user_id: "me", company_id: "c1", lead_id: L, project_id: null, ...o });
  const tables: Tables = { leads: [{ id: L, company_id: "c1" }], emails: [E("e1", {}), E("e2", { owner_user_id: "other" }), E("e3", { lead_id: "x", company_id: "c2" }), E("e4", { body: "Más tartalom" })] };
  it("jogosult fiók + ügyhöz kötött + szó szerinti idézet → elfogadva; egyébként okkal elutasítva", async () => {
    const sb = fakeSb({ role: "sales", tables, mailboxes: [{ userId: "me", email: "ramon@viba.hu" }] }).sb;
    const quoteText = "A KT elosztó szekrénytestét a megrendelő biztosítja.";
    const r = await verifyClarifications(sb as never, { lead_id: L, project_id: null }, ["e1", "e2", "e3", "e4", "44444444-4444-4444-8444-444444444444"].map((emailId) => ({ emailId, quote: quoteText })));
    expect(r.accepted.map((a) => a.emailId)).toEqual(["e1"]);
    expect(Object.fromEntries(r.rejected.map((x) => [x.emailId, x.reason]))).toEqual({
      e2: "A levél nem jogosult postafiókból származik.", e3: "A levél nem ehhez az ügyhöz (lead/cég/projekt) kötött.", e4: "Az idézet nem szerepel szó szerint a levélben.", "44444444-4444-4444-8444-444444444444": "A levél nem látható." });
  });
});

describe("normaórák", () => {
  it("üres megadás → nincs norma (none); megadott érték → felhasználói feltételezés", () => {
    expect(rulesFrom(null).approval).toBe("none");
    expect(rulesFrom({ assemblyHoursPerDevice: {} }).approval).toBe("none");
    expect(rulesFrom({ assemblyHoursPerDevice: { mcb: 0.2 } })).toMatchObject({ approval: "user_assumption", assemblyHoursPerDevice: { mcb: 0.2 } });
  });
});
