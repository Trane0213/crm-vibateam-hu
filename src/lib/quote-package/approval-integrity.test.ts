/**
 * P7 (4. feladat) — jóváhagyás nélküli, változott vagy részleges ajánlatcsomag nem vehet fel látszólag jóváhagyott állapotot.
 * Tiszta szabályok + valódi csomag-összeállítás TESZT-adattal; nincs írás, nincs küldés.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/r2.server", () => ({ presignR2Url: () => { throw new Error("no network in tests"); } }));
import { prepareQuotePackage } from "./package.server";
import { handoffAllowed, linkageGates, packageStaleness, prepareApproval, requiredAcks, type Gate, type PackageBasis } from "./package-model";
import { fakeSb, RECEIVED as R } from "@/lib/qa/__fixtures__/p7-scenarios";

const FP = "a".repeat(64), FP2 = "b".repeat(64);
const okGates: Gate[] = [{ key: "pricing", label: "Árazás", ok: true, blocking: true }];
const okLinkage = linkageGates({ offerNetHuf: 1000 }, { pricedDocIds: ["p"], scopeDocIds: ["s"], savedNetHuf: 1000 });
const approve = (over: Partial<Parameters<typeof prepareApproval>[0]> = {}) => prepareApproval({ role: "sales", by: "TESZT", fingerprint: FP, gates: okGates, acks: ["excel_reviewed", "scope_reviewed"], ...over });
const basis: PackageBasis = { budgetId: "b1", mode: "subcontractor_labor", rate: "6500", contingency: "0", margin: "", template: null,
  quote: { title: "TESZT", version: 2, alternativeKey: "A", validUntil: "2026-12-31", technicalScope: "Erősáram", exclusions: "Gyengeáram", contactId: "c1", locked: false } };

describe("Jóváhagyás-előkészítés: csak teljes, nyugtázott, Owner/Sales által, érvényes ujjlenyomatra", () => {
  it("hiányos csomag (nyitott kötelező kapu) nem hagyható jóvá", () => {
    const r = approve({ gates: [...okGates, { key: "lines", label: "Minden tételsor árazott", ok: false, blocking: true }] });
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/Nyitott kötelező feltétel: Minden tételsor árazott/) });
  });
  it("részlegesen olvasott terv / jelentős eltérés: külön nyugtázás nélkül nem hagyható jóvá", () => {
    const gates: Gate[] = [...okGates, { key: "plans_read", label: "Terv", ok: false, blocking: false, needsAck: true }, { key: "findings", label: "Eltérés", ok: false, blocking: false, needsAck: true }];
    expect(requiredAcks(gates)).toEqual(["excel_reviewed", "scope_reviewed", "findings_ack", "partial_plans_ack"]);
    expect(approve({ gates }).ok).toBe(false);
    expect(approve({ gates, acks: ["excel_reviewed", "scope_reviewed", "findings_ack"] }).ok).toBe(false);
    expect(approve({ gates, acks: requiredAcks(gates) }).ok).toBe(true);
  });
  it.each(["marketing", "project_manager", "pm", "agent", null, ""])("%s szerepkör nem készíthet elő jóváhagyást", (role) => {
    expect(approve({ role: role as string | null }).ok).toBe(false);
  });
  it("Owner és Sales (kis-/nagybetűtől függetlenül) előkészíthet; az eredmény sosem mentett jóváhagyás", () => {
    for (const role of ["owner", "Owner", "sales", "SALES"]) { const r = approve({ role }); expect(r.ok).toBe(true); if (r.ok) expect(r.prep.persisted).toBe(false); }
  });
  it("hamis/rövid ujjlenyomat elutasítva", () => {
    expect(approve({ fingerprint: "abc" }).ok).toBe(false);
    expect(approve({ fingerprint: "G".repeat(64) }).ok).toBe(false);
  });
  it("elavult csomag nem hagyható jóvá", () => {
    expect(approve({ stale: ["az óradíj megváltozott"] })).toEqual({ ok: false, reason: expect.stringMatching(/elavult.*óradíj/) });
  });
});

describe("Átadás a kiküldéshez: csak ugyanarra a változatlan, összekötött csomagra", () => {
  const prep = (() => { const r = approve(); if (!r.ok) throw new Error(r.reason); return r.prep; })();
  it("jóváhagyás nélkül nem adható át", () => expect(handoffAllowed(FP, null, okLinkage).ok).toBe(false));
  it("más ujjlenyomatú (megváltozott) csomagra a korábbi jóváhagyás nem érvényes", () => {
    expect(handoffAllowed(FP2, prep, okLinkage)).toEqual({ ok: false, reason: expect.stringMatching(/megváltozott/) });
  });
  it("mentetlen Excel, mentetlen lehatárolás vagy eltérő nettó esetén nem adható át", () => {
    expect(handoffAllowed(FP, prep, linkageGates({ offerNetHuf: 1000 }, { pricedDocIds: [], scopeDocIds: ["s"], savedNetHuf: 1000 })).ok).toBe(false);
    expect(handoffAllowed(FP, prep, linkageGates({ offerNetHuf: 1000 }, { pricedDocIds: ["p"], scopeDocIds: [], savedNetHuf: 1000 })).ok).toBe(false);
    expect(handoffAllowed(FP, prep, linkageGates({ offerNetHuf: 1000 }, { pricedDocIds: ["p"], scopeDocIds: ["s"], savedNetHuf: 999 })).ok).toBe(false);
    expect(handoffAllowed(FP, prep, linkageGates({ offerNetHuf: null }, { pricedDocIds: ["p"], scopeDocIds: ["s"], savedNetHuf: null })).ok).toBe(false);
  });
  it("elavult csomag érvényes jóváhagyással és összekötéssel sem adható át", () => {
    expect(handoffAllowed(FP, prep, okLinkage, ["a kizárások mezője megváltozott"])).toEqual({ ok: false, reason: expect.stringMatching(/elavult.*kizárások/) });
    expect(handoffAllowed(FP, prep, okLinkage)).toEqual({ ok: true, reason: null });
  });
});

describe("Elavulás: összeállítás utáni változás felismerése", () => {
  it("változatlan alap → nem elavult; számformátum (6 500 / 6500,0) nem számít változásnak", () => {
    expect(packageStaleness(basis, { ...basis })).toEqual([]);
    expect(packageStaleness(basis, { ...basis, rate: " 6 500 ", contingency: "0,0" })).toEqual([]);
  });
  it("ismeretlen összeállítási alap elavultnak számít", () => expect(packageStaleness(null, basis)).toHaveLength(1));
  it.each([
    [{ budgetId: "b2" }, /költségvetés/], [{ mode: "full_construction" as const }, /árazási mód/], [{ rate: "7000" }, /óradíj/], [{ contingency: "5" }, /tartalék/],
    [{ margin: "20" }, /célfedezet/], [{ template: "ramon.xlsx" }, /ársablon/],
  ])("panelbeállítás: %o", (over, re) => { const s = packageStaleness(basis, { ...basis, ...over }); expect(s).toHaveLength(1); expect(s[0]).toMatch(re); });
  it.each([
    [{ title: "Más cím" }, /címe/], [{ version: 3 }, /verzió/], [{ alternativeKey: "B" }, /alternatíva/], [{ validUntil: "2027-01-31" }, /érvényesség/],
    [{ technicalScope: "Erősáram + tűzjelző" }, /lehatárolás/], [{ exclusions: "" }, /kizárások/], [{ contactId: "c2" }, /kapcsolattartó/], [{ locked: true }, /zárolódott/],
  ])("mentett ajánlatadat: %o", (over, re) => { const s = packageStaleness(basis, { ...basis, quote: { ...basis.quote, ...over } }); expect(s).toHaveLength(1); expect(s[0]).toMatch(re); });
});

describe("Valódi csomag-összeállítással (TESZT munkafüzet)", () => {
  const dl = () => vi.fn(async (k: string) => { if (k === R.budgetDoc.file_url) return R.budget; throw new Error("nincs"); });
  const opts = () => ({ download: dl(), referenceSources: R.sources, asOf: R.asOf });
  it("forrás nélküli sorok → hiányos csomag, jóváhagyás és átadás elutasítva, nincs kitalált ár", async () => {
    const p = await prepareQuotePackage(fakeSb("sales", { quotes: [R.quote], quote_documents: [R.budgetDoc] }).sb, "u", R.input, { ...opts(), referenceSources: () => R.sources().slice(0, 8) });
    expect(p.core.status).toBe("incomplete");
    const r = prepareApproval({ role: "sales", by: "TESZT", fingerprint: p.fingerprint, gates: p.core.gates, acks: requiredAcks(p.core.gates) });
    expect(r.ok).toBe(false);
    expect(handoffAllowed(p.fingerprint, null, linkageGates(p.core, { pricedDocIds: ["x"], scopeDocIds: ["y"], savedNetHuf: p.core.offerNetHuf })).ok).toBe(false);
    expect(p.core.missing.filter((m) => m.kind === "line").length).toBeGreaterThan(0);
  });
  it("másik ajánlat ugyanazzal a költségvetéssel más ujjlenyomatot ad — jóváhagyás nem vihető át ajánlatok között", async () => {
    const Q2 = "aaaaaaaa-0000-4000-8000-00000000a002";
    const a = await prepareQuotePackage(fakeSb("sales", { quotes: [R.quote], quote_documents: [R.budgetDoc] }).sb, "u", R.input, opts());
    const b = await prepareQuotePackage(fakeSb("sales", { quotes: [{ ...R.quote, id: Q2 }], quote_documents: [{ ...R.budgetDoc, quote_id: Q2 }] }).sb, "u", { ...R.input, quoteId: Q2 }, opts());
    expect(a.fingerprint).not.toBe(b.fingerprint);
    const ap = prepareApproval({ role: "sales", by: "TESZT", fingerprint: a.fingerprint, gates: a.core.gates, acks: requiredAcks(a.core.gates) });
    expect(ap.ok).toBe(true);
    expect(handoffAllowed(b.fingerprint, ap.ok ? ap.prep : null, linkageGates(b.core, { pricedDocIds: ["x"], scopeDocIds: ["y"], savedNetHuf: b.core.offerNetHuf })).ok).toBe(false);
  });
  it("ügyfélszöveget érintő mentett mező (lehatárolás, érvényesség) változása új ujjlenyomatot ad", async () => {
    const base = await prepareQuotePackage(fakeSb("sales", { quotes: [R.quote], quote_documents: [R.budgetDoc] }).sb, "u", R.input, opts());
    const scope = await prepareQuotePackage(fakeSb("sales", { quotes: [{ ...R.quote, technical_scope: "Erősáram + tűzjelző" }], quote_documents: [R.budgetDoc] }).sb, "u", R.input, opts());
    const valid = await prepareQuotePackage(fakeSb("sales", { quotes: [{ ...R.quote, valid_until: "2027-01-31" }], quote_documents: [R.budgetDoc] }).sb, "u", R.input, opts());
    expect(new Set([base.fingerprint, scope.fingerprint, valid.fingerprint]).size).toBe(3);
  });
  it("közben kiküldött (zárolt) verzió: az újra összeállított csomag hiányos és nem hagyható jóvá", async () => {
    const p = await prepareQuotePackage(fakeSb("owner", { quotes: [{ ...R.quote, locked_at: "2026-11-15T08:00:00Z" }], quote_documents: [R.budgetDoc] }).sb, "u", R.input, opts());
    expect(p.core.gates.find((g) => g.key === "not_locked")!.ok).toBe(false);
    expect(prepareApproval({ role: "owner", by: "TESZT", fingerprint: p.fingerprint, gates: p.core.gates, acks: requiredAcks(p.core.gates) }).ok).toBe(false);
  });
});
