import { describe, expect, it, vi } from "vitest";
vi.mock("../r2.server", () => ({ presignR2Url: () => { throw new Error("no network in tests"); } }));
import { unzipSync, zipSync } from "fflate";
import { prepareQuotePackage, sameZipContent } from "./package.server";
import { packageDto } from "./package-dto";
import { materialLaborBudget, sourcesFor } from "@/lib/pricing/__fixtures__/workbooks";
import type { PackageRequest } from "./package-schema";

type Tables = Record<string, Record<string, unknown>[]>;
function fakeSb(role: string | null, tables: Tables) {
  const calls: { table: string; op: string }[] = [];
  const from = (table: string) => {
    const filters: [string, string, unknown][] = []; let op = "select";
    const run = () => { calls.push({ table, op }); return (tables[table] ?? []).filter((r) => filters.every(([k, c, v]) => (k === "eq" ? r[c] === v : k === "in" ? (v as unknown[]).includes(r[c]) : true))); };
    const b: any = {
      select: () => b, eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), b), in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), b),
      order: () => b, limit: () => b, gte: () => b, lt: () => b,
      insert: () => { op = "insert"; return b; }, update: () => { op = "update"; return b; }, delete: () => { op = "delete"; return b; }, upsert: () => { op = "upsert"; return b; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
    };
    return b;
  };
  const rpc = async (name: string) => (name === "crm_role_of" ? { data: role, error: null } : { data: [], error: null });
  return { sb: { from, rpc } as never, calls };
}

const Q = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const N = 12, budgetBytes = materialLaborBudget(N);
const quote = { id: Q, title: "TESZT csarnok", version: 1, alternative_key: "A", quote_kind: "received_budget", scope_type: "labor_only", technical_scope: null, exclusions: null, valid_until: "2026-12-31", manual_net_amount: null, locked_at: null, status: "draft", contact_id: null, lead_id: null, project_id: null };
const budgetDoc = { id: B, quote_id: Q, name: "TESZT_koltsegvetes.xlsx", file_url: "quote-documents/q/unpriced_budget/b.xlsx", size_bytes: budgetBytes.length, document_type: "unpriced_budget", created_at: "2026-11-15" };
const input: PackageRequest = { quoteId: Q, budgetDocumentId: null, overrides: {}, template: null, includeFiles: true };
const opts = (download: (k: string) => Promise<Uint8Array>) => ({ download, referenceSources: () => sourcesFor(N), asOf: "2026-11-15" });
const dl = (extra: Record<string, Uint8Array> = {}) => vi.fn(async (k: string) => { if (k === budgetDoc.file_url) return budgetBytes; if (extra[k]) return extra[k]!; throw new Error("nincs"); });

describe("P5 ajánlatcsomag szerver — jogosultság (negatív esetek)", () => {
  it.each(["marketing", "project_manager", null])("%s szerepkör elutasítva, fájl nem töltődik", async (role) => {
    const download = dl();
    await expect(prepareQuotePackage(fakeSb(role, { quotes: [quote], quote_documents: [budgetDoc] }).sb, "u", input, opts(download))).rejects.toThrow(/Tulajdonos és Sales/);
    expect(download).not.toHaveBeenCalled();
  });
  it("nem látható ajánlat (RLS) → elutasítás", async () => {
    await expect(prepareQuotePackage(fakeSb("sales", { quote_documents: [budgetDoc] }).sb, "u", input, opts(dl()))).rejects.toThrow(/nem hozzáférhető/);
  });
  it("saját VIBA-ajánlat → nem csomagolható ezen az úton", async () => {
    await expect(prepareQuotePackage(fakeSb("owner", { quotes: [{ ...quote, quote_kind: "viba_offer" }] }).sb, "u", input, opts(dl()))).rejects.toThrow(/kapott költségvetéses/);
  });
  it("más ajánlat költségvetése → elutasítás, letöltés nélkül", async () => {
    const download = dl();
    await expect(prepareQuotePackage(fakeSb("sales", { quotes: [quote], quote_documents: [{ ...budgetDoc, quote_id: "99999999-9999-4999-8999-999999999999" }] }).sb, "u", { ...input, budgetDocumentId: B }, opts(download))).rejects.toThrow(/más ajánlathoz/);
    expect(download).not.toHaveBeenCalled();
  });
});

describe("P5 ajánlatcsomag szerver — TESZT munkafüzettel", () => {
  it("egy futás: P3 árazás + P4 tervellenőrzés → visszaellenőrzött Excel, lehatárolás, kísérőlevél; csak olvasás, egy letöltés", async () => {
    const download = dl(), f = fakeSb("sales", { quotes: [quote], quote_documents: [budgetDoc] });
    const p = await prepareQuotePackage(f.sb, "u", input, opts(download));
    expect(p.mode).toBe("subcontractor_labor");
    expect(p.pricingFacts?.export.status).toBe("verified");
    expect(p.core.gates.filter((g) => g.blocking && !g.ok)).toEqual([]);
    expect(p.core.status).toBe("ready");
    expect(p.core.offerNetHuf).toBeGreaterThan(0);
    expect(p.pricingFacts?.totals.materialHuf).toBe(0);
    expect(p.core.coverLetter.body).toContain(p.files.priced!.name);
    expect(p.core.coverLetter.body).toContain(p.files.scope.name);
    expect(f.calls.every((c) => c.op === "select")).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
    expect(p.saved).toEqual({ pricedDocIds: [], pricedDifferentIds: [], scopeDocIds: [], scopeDifferentIds: [] });
    const dto = packageDto(p);
    expect(JSON.stringify(dto)).not.toMatch(/quote-documents\/|file_url|presign/);
    expect(dto.files.priced?.base64).toBeTruthy();
  });
  it("ujjlenyomat: azonos bemenetre azonos (a ZIP-dátum nem számít), más beállításra más", async () => {
    const t = { quotes: [quote], quote_documents: [budgetDoc] };
    const a = await prepareQuotePackage(fakeSb("owner", t).sb, "u", input, opts(dl()));
    const b = await prepareQuotePackage(fakeSb("owner", t).sb, "u", input, opts(dl()));
    const c = await prepareQuotePackage(fakeSb("owner", t).sb, "u", { ...input, overrides: { laborRateHuf: 7000, historicalLaborPolicy: "rate_scaled" } }, opts(dl()));
    expect(a.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });
  it("mentett Árazott Excel / Lehatárolás: tartalom szerint egyező vagy eltérő; régi fájl nem számít a csomag részének", async () => {
    const first = await prepareQuotePackage(fakeSb("sales", { quotes: [quote], quote_documents: [budgetDoc] }).sb, "u", input, opts(dl()));
    const rezipped = zipSync(unzipSync(first.files.priced!.bytes), { mtime: new Date("2020-05-05T10:00:00Z") });
    const tampered = (() => { const z = unzipSync(first.files.priced!.bytes); const k = Object.keys(z).find((x) => x.includes("sheet"))!; z[k] = new Uint8Array([...z[k]!, 32]); return zipSync(z); })();
    expect(sameZipContent(rezipped, first.files.priced!.bytes)).toBe(true);
    expect(sameZipContent(tampered, first.files.priced!.bytes)).toBe(false);
    const saved = [
      { id: "p-ok", quote_id: Q, name: first.files.priced!.name, file_url: "k/p-ok.xlsx", size_bytes: rezipped.length, document_type: "priced_budget", created_at: "x" },
      { id: "p-old", quote_id: Q, name: first.files.priced!.name, file_url: "k/p-old.xlsx", size_bytes: tampered.length, document_type: "priced_budget", created_at: "x" },
      { id: "s-ok", quote_id: Q, name: first.files.scope.name, file_url: "k/s-ok.docx", size_bytes: first.files.scope.bytes.length, document_type: "technical_scope", created_at: "x" },
      { id: "s-evil", quote_id: Q, name: first.files.scope.name, file_url: "../s.docx", size_bytes: 10, document_type: "technical_scope", created_at: "x" },
    ];
    const download = dl({ "k/p-ok.xlsx": rezipped, "k/p-old.xlsx": tampered, "k/s-ok.docx": first.files.scope.bytes });
    const f = fakeSb("sales", { quotes: [quote], quote_documents: [budgetDoc, ...saved] });
    const p = await prepareQuotePackage(f.sb, "u", input, opts(download));
    expect(p.saved).toEqual({ pricedDocIds: ["p-ok"], pricedDifferentIds: ["p-old"], scopeDocIds: ["s-ok"], scopeDifferentIds: ["s-evil"] });
    expect(download).not.toHaveBeenCalledWith("../s.docx", expect.anything());
    expect(f.calls.every((c) => c.op === "select")).toBe(true);
  });
  it("hiányzó ár → hiányos csomag soronkénti hiányjegyzékkel; zárolt verzió blokkol", async () => {
    const p = await prepareQuotePackage(fakeSb("sales", { quotes: [{ ...quote, locked_at: "2026-11-10" }], quote_documents: [budgetDoc] }).sb, "u", input, { ...opts(dl()), referenceSources: () => sourcesFor(N).slice(0, 10) });
    expect(p.core.status).toBe("incomplete");
    expect(p.core.gates.find((g) => g.key === "not_locked")!.ok).toBe(false);
    expect(p.core.gates.find((g) => g.key === "lines")!.ok).toBe(false);
    expect(p.core.missing.filter((m) => m.kind === "line").length).toBeGreaterThan(0);
  });
  it("feldolgozhatatlan költségvetés → csomag hibával, nem kivétellel; nincs kitalált nettó", async () => {
    const download = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
    const p = await prepareQuotePackage(fakeSb("sales", { quotes: [quote], quote_documents: [budgetDoc] }).sb, "u", input, opts(download));
    expect(p.core.status).toBe("incomplete");
    expect(p.core.offerNetHuf).toBeNull();
    expect(p.core.gates.find((g) => g.key === "pricing")!.ok).toBe(false);
  });
});
