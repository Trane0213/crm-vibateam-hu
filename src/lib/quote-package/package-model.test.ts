import { describe, expect, it } from "vitest";
import { checkReferencedAttachment } from "@/lib/quotes/send-policy";
import {
  canonical, composePackage, diffPackages, handoffAllowed, internalLeaks, linkageGates, offerNet, prepareApproval, requiredAcks, versionDiff,
  type ComposeInput, type PkgLine, type PricingFacts, type ReviewFacts,
} from "./package-model";

const byStatus = { priced: 0, review: 0, missing: 0, blocked: 0, zero_qty: 0, excluded: 0, excluded_review: 0, existing_price: 0 };
const L = (i: number, o: Partial<PkgLine> = {}): PkgLine => ({ key: `Tételek!${i + 3}`, sheet: "Tételek", row: i + 3, name: `TESZT tétel ${i + 1}`, section: "01. TESZT fejezet", status: "priced", lineTotalHuf: 1000 * (i + 1), sourced: true, ...o });
function pricing(lines: PkgLine[], o: Partial<PricingFacts> = {}): PricingFacts {
  const bs = { ...byStatus }; for (const l of lines) bs[l.status]++;
  const net = lines.filter((l) => l.status === "priced").reduce((a, l) => a + (l.lineTotalHuf ?? 0), 0);
  return { sourceFile: { name: "TESZT.xlsx", sha256: "a".repeat(64) }, totals: { netHuf: net, materialHuf: 0, laborHuf: net, existingHuf: 0, lines: lines.length, byStatus: bs }, lines, blockers: [],
    export: { status: "verified", fileName: "TESZT_VIBA_arazott_TERVEZET.xlsx", bytes: 1234, writtenCells: lines.length }, ...o };
}
const review = (o: Partial<ReviewFacts> = {}): ReviewFacts => ({ findings: [], questions: [], cabinets: [], files: [{ fileName: "E-01.pdf", full: true, label: "Szövegréteg teljesen olvasva", reasons: [] }], allTextRead: true, ...o });
const base = (o: Partial<ComposeInput> = {}): ComposeInput => ({
  quote: { id: "q1", title: "TESZT csarnok villamos", version: 2, alternativeKey: "A", kind: "received_budget", validUntil: "2026-12-15", technicalScope: null, exclusions: null, savedNetHuf: null, locked: false, contactName: "Teszt Elek" },
  mode: "subcontractor_labor", asOf: "2026-11-15", budgetDocName: "TESZT.xlsx", scopeFileName: "VIBA_lehatarolas_v2_TERVEZET.docx",
  pricing: pricing([L(0), L(1), L(2)]), pricingError: null, review: review(), reviewError: null, ...o,
});
const gate = (c: ReturnType<typeof composePackage>, k: string) => c.gates.find((g) => g.key === k)!;

describe("P5 ajánlatcsomag — tartalmi kapuk", () => {
  it("minden rendben → jóváhagyásra kész, nettó = árazott összeg", () => {
    const c = composePackage(base());
    expect(c.status).toBe("ready");
    expect(c.offerNetHuf).toBe(6000);
    expect(c.gates.filter((g) => g.blocking && !g.ok)).toEqual([]);
  });
  it("nyitott (nincs ár / ellenőrizendő) sor → hiányos, a hiányjegyzékben soronként", () => {
    const c = composePackage(base({ pricing: pricing([L(0), L(1, { status: "missing", lineTotalHuf: null }), L(2, { status: "review", lineTotalHuf: null })]) }));
    expect(c.status).toBe("incomplete");
    expect(gate(c, "lines")).toMatchObject({ ok: false, blocking: true });
    expect(c.missing.filter((m) => m.kind === "line").map((m) => m.ref)).toEqual(["Tételek!4", "Tételek!5"]);
  });
  it("forrás nélküli kitöltött ár → blokkol", () => {
    expect(gate(composePackage(base({ pricing: pricing([L(0, { sourced: false })]) })), "sourced")).toMatchObject({ ok: false, blocking: true });
  });
  it("nem visszaellenőrzött Excel → blokkol, ok a hiányjegyzékben", () => {
    const c = composePackage(base({ pricing: pricing([L(0)], { export: { status: "blocked", reasons: ["A munkafüzet összegképlete nem egyezik."] } }) }));
    expect(gate(c, "workbook")).toMatchObject({ ok: false, hint: "A munkafüzet összegképlete nem egyezik." });
    expect(c.missing.some((m) => m.kind === "export")).toBe(true);
  });
  it("kiküldött (zárolt) verzió és hiányzó költségvetés → blokkol", () => {
    expect(gate(composePackage(base({ quote: { ...base().quote, locked: true } })), "not_locked").ok).toBe(false);
    expect(composePackage(base({ budgetDocName: null, pricing: null })).status).toBe("incomplete");
  });
  it("belső kalkulációs kifejezés az ügyfélszövegben → blokkol", () => {
    const c = composePackage(base({ quote: { ...base().quote, technicalScope: "Belső önköltség 4200 Ft/óra" } }));
    expect(gate(c, "no_internal")).toMatchObject({ ok: false, blocking: true });
    expect(internalLeaks("tartalék 10% és fedezet")).toEqual(["tartalék", "fedezet"]);
    expect(internalLeaks("belső elosztó hálózat")).toEqual([]);
  });
  it("jelentős eltérés és részleges terv-olvasás nem blokkol, de nyugtázandó", () => {
    const c = composePackage(base({ review: review({ allTextRead: false, files: [{ fileName: "V-1.pdf", full: false, label: "Olvashatatlan (OCR szükséges)", reasons: ["szkennelt"] }],
      findings: [{ id: "F001", category: "elteres", severity: "high", title: "Keresztmetszet-eltérés: a terven NYY 4x185, a költségvetésben 4×150 mm².", question: "Melyik az érvényes keresztmetszet?", topic: "kabel" }], questions: ["Melyik az érvényes keresztmetszet?"] }) }));
    expect(c.status).toBe("ready");
    expect(requiredAcks(c.gates)).toEqual(["excel_reviewed", "scope_reviewed", "findings_ack", "partial_plans_ack"]);
    expect(c.scope.conditional.some((x) => x.text.includes("V-1.pdf"))).toBe(true);
    expect(c.scope.questions.map((q) => q.text)).toEqual(["Melyik az érvényes keresztmetszet?"]);
  });
  it("a saját, korábban mentett lehatárolási DOCX nem számít olvashatatlan tervnek", () => {
    const c = composePackage(base({ review: review({ files: [{ fileName: "E-01.pdf", full: true, label: "ok", reasons: [] }, { fileName: "VIBA_lehatarolas_v2_TERVEZET.docx", full: false, label: "Nem feldolgozott", reasons: ["Nem PDF"] }] }) }));
    expect(gate(c, "plans_read")).toMatchObject({ ok: true, needsAck: false });
    expect(c.scope.conditional.some((x) => x.text.includes("VIBA_lehatarolas"))).toBe(false);
    expect(c.missing.some((m) => m.kind === "file")).toBe(false);
  });
  it("meglévő (megrendelői) árak a végösszeg részei", () => {
    expect(offerNet(pricing([L(0)], { totals: { netHuf: 1000, materialHuf: 0, laborHuf: 1000, existingHuf: 500, lines: 1, byStatus } }))).toBe(1500);
  });
});

describe("P5 lehatárolás", () => {
  it("munkadíjas mód: anyag kizárva; 0 mennyiség, kizárt sor, kizárás/feltételezés/szekrény a megfelelő fejezetben", () => {
    const c = composePackage(base({
      quote: { ...base().quote, technicalScope: "- Erősáramú szerelés\n- Mérési jegyzőkönyv", exclusions: "Gyengeáram" },
      pricing: pricing([L(0), L(1, { status: "zero_qty", lineTotalHuf: null }), L(2, { status: "excluded", name: "Tűzjelző rendszer", lineTotalHuf: null })]),
      review: review({ findings: [
        { id: "F001", category: "kizaras", severity: "medium", title: "A villamos terv nem tartalmazza a gépészeti automatikát.", question: null, topic: "lehatarolas" },
        { id: "F002", category: "feltetelezes", severity: "low", title: "Az építtető biztosítja az ideiglenes energiát.", question: null, topic: "feltetelezes" },
        { id: "F003", category: "feltetelezes", severity: "low", title: "FE: a tétel gyártást és bekötést együtt tartalmaz.", question: null, topic: "szekreny" },
      ], cabinets: [{ id: "FE", status: "bom_complete", mismatch: true, priceComplete: false, pricedHuf: 0, blockReasons: ["norma hiányzik"] }, { id: "E9", status: "no_drawing", mismatch: false, priceComplete: false, pricedHuf: 0, blockReasons: [] }] }),
    }));
    const t = (k: keyof typeof c.scope) => c.scope[k].map((x) => x.text).join("\n");
    expect(t("excluded")).toMatch(/Anyagok beszerzése/);
    expect(t("excluded")).toMatch(/0 mennyiségű sorai \(1 db\)/);
    expect(t("excluded")).toMatch(/Tűzjelző rendszer/);
    expect(t("excluded")).toMatch(/Gyengeáram/);
    expect(t("excluded")).toMatch(/gépészeti automatikát/);
    expect(t("included")).toMatch(/Erősáramú szerelés/);
    expect(t("conditional")).toMatch(/ideiglenes energiát/);
    expect(t("conditional")).not.toMatch(/gyártást és bekötést/);
    expect(t("conditional")).toMatch(/FE elosztó készülékszáma/);
    expect(t("conditional")).toMatch(/E9 elosztó műszaki tartalma a kapcsolási rajz/);
    expect(c.missing.some((m) => m.kind === "cabinet" && m.ref === "FE")).toBe(true);
  });
  it("teljes kivitelezésnél az anyag nincs kizárva", () => {
    expect(composePackage(base({ mode: "full_construction" })).scope.excluded.some((x) => /Anyagok beszerzése/.test(x.text))).toBe(false);
  });
});

describe("P5 kísérőlevél", () => {
  it("nettó, érvényesség, mellékletnevek és kérdések benne; belső adat nincs; a meglévő küldési szabály melléklet nélkül tiltja", () => {
    const c = composePackage(base({ review: review({ questions: ["Kérjük a(z) E-05 tervet."] }) }));
    expect(c.coverLetter.subject).toBe("Ajánlat – TESZT csarnok villamos (v2)");
    expect(c.coverLetter.body).toMatch(/Tisztelt Teszt Elek!/);
    expect(c.coverLetter.body).toMatch(/nettó végösszege: 6\s?000\sFt \+ ÁFA/);
    expect(c.coverLetter.body).toMatch(/2026-12-15-ig/);
    expect(c.coverLetter.body).toMatch(/TESZT_VIBA_arazott_TERVEZET\.xlsx/);
    expect(c.coverLetter.body).toMatch(/VIBA_lehatarolas_v2_TERVEZET\.docx/);
    expect(c.coverLetter.body).toMatch(/1\. Kérjük a\(z\) E-05 tervet\./);
    expect(internalLeaks(c.coverLetter.body)).toEqual([]);
    expect(checkReferencedAttachment(c.coverLetter.body, 0)).not.toBeNull();
    expect(checkReferencedAttachment(c.coverLetter.body, 2)).toBeNull();
  });
});

describe("P5 összekötés, jóváhagyás-előkészítés, átadás", () => {
  const fp = "f".repeat(64), c = composePackage(base());
  it("mentett Excel, lehatárolás és CRM-nettó nélkül nem adható át", () => {
    const g = linkageGates(c, { pricedDocIds: [], scopeDocIds: ["s1"], savedNetHuf: 5999 });
    expect(g.filter((x) => !x.ok).map((x) => x.key)).toEqual(["priced_saved", "crm_net"]);
    expect(linkageGates(c, { pricedDocIds: ["p1"], scopeDocIds: ["s1"], savedNetHuf: 6000 }).every((x) => x.ok)).toBe(true);
  });
  it.each(["marketing", "project_manager", "pm", null])("%s nem készíthet elő jóváhagyást", (role) => {
    expect(prepareApproval({ role, by: "x", fingerprint: fp, gates: c.gates, acks: ["excel_reviewed", "scope_reviewed"] })).toMatchObject({ ok: false, reason: expect.stringMatching(/Tulajdonos vagy Sales/) });
  });
  it("nyitott kötelező kapu vagy hiányzó nyugtázás → nincs jóváhagyás; rendben → nem mentett előkészítés", () => {
    const bad = composePackage(base({ pricing: pricing([L(0, { status: "missing", lineTotalHuf: null })]) }));
    expect(prepareApproval({ role: "sales", by: "R", fingerprint: fp, gates: bad.gates, acks: ["excel_reviewed", "scope_reviewed"] }).ok).toBe(false);
    expect(prepareApproval({ role: "sales", by: "R", fingerprint: fp, gates: c.gates, acks: ["excel_reviewed"] }).ok).toBe(false);
    const ok = prepareApproval({ role: "Sales", by: "Ramon", fingerprint: fp, gates: c.gates, acks: ["excel_reviewed", "scope_reviewed"], now: new Date("2026-11-15T08:00:00Z") });
    expect(ok).toEqual({ ok: true, prep: { fingerprint: fp, role: "sales", by: "Ramon", at: "2026-11-15T08:00:00.000Z", acks: ["excel_reviewed", "scope_reviewed"], persisted: false } });
  });
  it("a csomag megváltozása után a korábbi előkészítés nem érvényes", () => {
    const prep = (prepareApproval({ role: "owner", by: "V", fingerprint: fp, gates: c.gates, acks: ["excel_reviewed", "scope_reviewed"] }) as { ok: true; prep: never }).prep;
    const link = linkageGates(c, { pricedDocIds: ["p1"], scopeDocIds: ["s1"], savedNetHuf: 6000 });
    expect(handoffAllowed(fp, prep, link)).toEqual({ ok: true, reason: null });
    expect(handoffAllowed("e".repeat(64), prep, link).ok).toBe(false);
    expect(handoffAllowed(fp, null, link).ok).toBe(false);
    expect(handoffAllowed(fp, prep, linkageGates(c, { pricedDocIds: [], scopeDocIds: ["s1"], savedNetHuf: 6000 })).ok).toBe(false);
  });
});

describe("P5 változatok / diff", () => {
  it("tételsor-, nettó-, lehatárolás- és kapuváltozás", () => {
    const a = composePackage(base()), b = composePackage(base({ pricing: pricing([L(0), L(1, { lineTotalHuf: 2500 }), L(2, { status: "missing", lineTotalHuf: null })]) }));
    const snap = (c: typeof a, f: string, p: PricingFacts) => ({ fingerprint: f, offerNetHuf: c.offerNetHuf, lines: p.lines, scope: c.scope, gates: c.gates });
    const d = diffPackages(snap(a, "1", base().pricing!), snap(b, "2", pricing([L(0), L(1, { lineTotalHuf: 2500 }), L(2, { status: "missing", lineTotalHuf: null })])));
    expect(d.same).toBe(false);
    expect(d.netDeltaHuf).toBe(-2500);
    expect(d.changedLines.map((x) => x.key)).toEqual(["Tételek!4", "Tételek!5"]);
    expect(d.gateChanges.map((g) => g.key)).toContain("lines");
    expect(d.scopeAdded.length + d.scopeRemoved.length).toBeGreaterThan(0);
  });
  it("mentett verziók: mező- és dokumentumváltozás; azonos → same", () => {
    const v = { version: 1, netHuf: 1000, technicalScope: "A", exclusions: null, validUntil: null, notes: null, status: "draft", docs: [{ name: "a.xlsx", documentType: "unpriced_budget" }] };
    const d = versionDiff(v, { ...v, version: 2, netHuf: 1200, docs: [...v.docs, { name: "b.xlsx", documentType: "priced_budget" }] });
    expect(d.fields.map((f) => f.label)).toEqual(["Nettó összeg"]);
    expect(d.docsAdded).toEqual([{ name: "b.xlsx", documentType: "priced_budget" }]);
    expect(versionDiff(v, { ...v, version: 2 }).same).toBe(true);
  });
  it("kanonikus JSON kulcssorrendtől független", () => {
    expect(canonical({ b: 1, a: { d: [1, 2], c: null } })).toBe(canonical({ a: { c: null, d: [1, 2] }, b: 1 }));
  });
});
