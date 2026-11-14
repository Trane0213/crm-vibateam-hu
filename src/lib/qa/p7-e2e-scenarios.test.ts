/**
 * P7 — reprodukálható végponttól végpontig tartó üzleti forgatókönyvek, izoláltan (TESZT-adat, szimulált adatbázis).
 * A valódi P3 árazómotor, P4 tervellenőrzés, P5 csomagmodell és P6 kalkulációs motor fut; adatbázis-írás, feltöltés és
 * küldés nincs. Lépésről lépésre ugyanazt az utat járja, mint a felhasználó: összeállítás → mentés → nettó → jóváhagyás-
 * előkészítés → átadás a kiküldéshez (Gmail nélkül), illetve kalkuláció → tételterv → lehatárolás.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/r2.server", () => ({ presignR2Url: () => { throw new Error("no network in tests"); } }));
import { prepareQuotePackage } from "@/lib/quote-package/package.server";
import { handoffAllowed, internalLeaks, linkageGates, prepareApproval, requiredAcks } from "@/lib/quote-package/package-model";
import { blockingIssues, calculateVibaOffer, DEFAULT_COMMERCIAL, emptyProfile, type CalcInput, type CustomInput } from "@/lib/viba-offer/calc-model";
import { planQuoteItems, scopeTexts, type ExistingItem } from "@/lib/viba-offer/item-plan";
import { extractVbfDefects } from "@/lib/viba-offer/vbf-extract";
import { fakeSb, ownFullConstruction, RECEIVED, VBF_TESZT_TEXT, type Tables } from "./__fixtures__/p7-scenarios";

const R = RECEIVED;
const opts = (download: (k: string) => Promise<Uint8Array>) => ({ download, referenceSources: R.sources, asOf: R.asOf });
const dl = (extra: Record<string, Uint8Array> = {}) => vi.fn(async (k: string) => { if (k === R.budgetDoc.file_url) return R.budget; if (extra[k]) return extra[k]!; throw new Error("nincs ilyen TESZT-fájl"); });

describe("P7/A — alvállalkozói kapott Excel: összeállítás → mentés → nettó → jóváhagyás-előkészítés → átadás", () => {
  it("teljes út TESZT-adatokkal; minden adatbázis-hívás olvasás; a jóváhagyás csak a változatlan csomagra érvényes", async () => {
    // 1) Összeállítás
    const t0: Tables = { quotes: [R.quote], quote_documents: [R.budgetDoc] };
    const f0 = fakeSb("sales", t0);
    const p1 = await prepareQuotePackage(f0.sb, "u", R.input, opts(dl()));
    expect(p1.mode).toBe("subcontractor_labor");
    expect(p1.core.status).toBe("ready");
    expect(p1.pricingFacts!.totals.materialHuf).toBe(0);
    const net = p1.core.offerNetHuf!;
    expect(net).toBeGreaterThan(0);
    // Mentés előtt nem adható át, akkor sem, ha a jóváhagyás-előkészítés megvan.
    const early = prepareApproval({ role: "sales", by: "TESZT Sales", fingerprint: p1.fingerprint, gates: p1.core.gates, acks: requiredAcks(p1.core.gates) });
    expect(early.ok).toBe(true);
    const unlinked = linkageGates(p1.core, { pricedDocIds: [], scopeDocIds: [], savedNetHuf: null });
    expect(handoffAllowed(p1.fingerprint, early.ok ? early.prep : null, unlinked).ok).toBe(false);

    // 2) Fájlok mentése + 3) Nettó mentése (szimulálva: a dokumentumsorok és a nettó megjelennek a TESZT-táblákban)
    const pricedDoc = { id: "p7-priced", quote_id: R.Q, name: p1.files.priced!.name, file_url: "k/p7-priced.xlsx", size_bytes: p1.files.priced!.bytes.length, document_type: "priced_budget", created_at: "x" };
    const scopeDoc = { id: "p7-scope", quote_id: R.Q, name: p1.files.scope.name, file_url: "k/p7-scope.docx", size_bytes: p1.files.scope.bytes.length, document_type: "technical_scope", created_at: "x" };
    const t1: Tables = { quotes: [{ ...R.quote, manual_net_amount: net }], quote_documents: [R.budgetDoc, pricedDoc, scopeDoc] };
    const files = { "k/p7-priced.xlsx": p1.files.priced!.bytes, "k/p7-scope.docx": p1.files.scope.bytes };
    const f1 = fakeSb("sales", t1);
    const p2 = await prepareQuotePackage(f1.sb, "u", R.input, opts(dl(files)));
    expect(p2.fingerprint).toBe(p1.fingerprint); // a mentett nettó és a mentett fájlok nem változtatják a tartalmat
    expect(p2.saved.pricedDocIds).toEqual(["p7-priced"]);
    expect(p2.saved.scopeDocIds).toEqual(["p7-scope"]);
    const linkage = linkageGates(p2.core, { pricedDocIds: p2.saved.pricedDocIds, scopeDocIds: p2.saved.scopeDocIds, savedNetHuf: net });
    expect(linkage.every((g) => g.ok)).toBe(true);

    // 4) Jóváhagyás-előkészítés + 5) átadás
    const ap = prepareApproval({ role: "sales", by: "TESZT Sales", fingerprint: p2.fingerprint, gates: p2.core.gates, acks: requiredAcks(p2.core.gates) });
    expect(ap.ok).toBe(true);
    const approval = ap.ok ? ap.prep : null;
    expect(approval!.persisted).toBe(false);
    expect(handoffAllowed(p2.fingerprint, approval, linkage)).toEqual({ ok: true, reason: null });

    // 6) Változás után (más óradíj) ugyanaz a jóváhagyás érvénytelen, a régi mentett Excel már nem a csomag része.
    const p3 = await prepareQuotePackage(fakeSb("sales", t1).sb, "u", { ...R.input, overrides: { laborRateHuf: 7200, historicalLaborPolicy: "rate_scaled" } }, opts(dl(files)));
    expect(p3.fingerprint).not.toBe(p2.fingerprint);
    const linkage3 = linkageGates(p3.core, { pricedDocIds: p3.saved.pricedDocIds, scopeDocIds: p3.saved.scopeDocIds, savedNetHuf: net });
    const h3 = handoffAllowed(p3.fingerprint, approval, linkage3);
    expect(h3.ok).toBe(false);
    expect(h3.reason).toMatch(/megváltozott/);

    // Kísérőlevél és lehatárolás: nincs belső kalkulációs kifejezés.
    expect(internalLeaks(`${p2.core.coverLetter.subject}\n${p2.core.coverLetter.body}`)).toEqual([]);
    expect([...f0.calls, ...f1.calls].every((c) => c.op === "select")).toBe(true);
  });

  it("ugyanaz a költségvetés teljes kivitelezői módban: célfedezet nélkül hiányos (önköltség-alapú anyag), célfedezettel kész és van anyagdíj", async () => {
    const t: Tables = { quotes: [{ ...R.quote, scope_type: "material_labor" }], quote_documents: [R.budgetDoc] };
    const noMargin = await prepareQuotePackage(fakeSb("owner", t).sb, "u", { ...R.input, mode: "full_construction" }, opts(dl()));
    expect(noMargin.core.status).toBe("incomplete");
    expect(noMargin.core.gates.find((g) => g.key === "lines")!.ok).toBe(false);
    expect(prepareApproval({ role: "owner", by: "TESZT", fingerprint: noMargin.fingerprint, gates: noMargin.core.gates, acks: requiredAcks(noMargin.core.gates) }).ok).toBe(false);
    const withMargin = await prepareQuotePackage(fakeSb("owner", t).sb, "u", { ...R.input, mode: "full_construction", overrides: { marginPct: 20 } }, opts(dl()));
    expect(withMargin.core.status).toBe("ready");
    expect(withMargin.pricingFacts!.totals.materialHuf).toBeGreaterThan(0);
    expect(withMargin.core.coverLetter.body).toMatch(/anyag- és munkadíjas/);
  });

  it.each(["marketing", "project_manager", "agent", null])("%s szerepkör: a csomag nem áll össze, fájl nem töltődik le", async (role) => {
    const download = dl();
    await expect(prepareQuotePackage(fakeSb(role, { quotes: [R.quote], quote_documents: [R.budgetDoc] }).sb, "u", R.input, opts(download))).rejects.toThrow(/Tulajdonos és Sales/);
    expect(download).not.toHaveBeenCalled();
  });
});

describe("P7/B — saját teljes kivitelezői ajánlat (családi ház m², anyag + munkadíj)", () => {
  it("kalkuláció → tételterv anyag/munkadíj külön → ismételt futtatás duplikáció nélkül → módosított alapterület ütközés, nem felülírás", () => {
    const r = calculateVibaOffer(ownFullConstruction());
    expect(blockingIssues(r)).toEqual([]);
    const base = r.lines.find((l) => l.id === "house_m2")!;
    expect(base.status).toBe("priced");
    expect(base.materialTotalHuf).toBe(140 * 9000);
    expect(base.laborTotalHuf).toBe(140 * 7000);
    expect(r.lines.find((l) => l.id === "x_kert")!.status).toBe("zero_qty");
    expect(r.lines.find((l) => l.id === "x_pv")!.status).toBe("missing_price");
    expect(r.totals.netHuf).toBe(140 * 16000 + 100000);
    expect(r.totals.openLines).toBe(1);

    // Hiányzó árú sor miatt csak kifejezett tudomásulvétellel írható; 0 mennyiségű sor sosem kerül be.
    expect(planQuoteItems(r, [], { split: true, acknowledgedReview: [], acceptPartial: false, locked: false }).canWrite).toBe(false);
    const plan = planQuoteItems(r, [], { split: true, acknowledgedReview: [], acceptPartial: true, locked: false });
    expect(plan.canWrite).toBe(true);
    expect(plan.rows.map((x) => x.part)).toEqual(["material", "labor", "material", "labor"]);
    expect(plan.rows.some((x) => /Kerti/.test(x.name))).toBe(false);
    expect(plan.netHuf).toBe(r.totals.netHuf);

    const written: ExistingItem[] = plan.rows.map((x, i) => ({ id: `i${i}`, section: x.section, name: x.name, quantity: x.quantity, unit: x.unit, unit_price: x.unit_price }));
    const again = planQuoteItems(r, written, { split: true, acknowledgedReview: [], acceptPartial: true, locked: false });
    expect(again.rows).toHaveLength(0);
    expect(again.duplicates).toHaveLength(4);

    const bigger = planQuoteItems(calculateVibaOffer(ownFullConstruction({ area: 150 })), written, { split: true, acknowledgedReview: [], acceptPartial: true, locked: false });
    expect(bigger.rows).toHaveLength(0);
    expect(bigger.conflicts.map((c) => c.part)).toEqual(["material", "labor"]);
    expect(bigger.conflicts[0]!.existing.quantity).toBe(140);

    // Lehatárolás: ügyfélszöveg belső kifejezés nélkül; zárolt ajánlat nem írható.
    const s = scopeTexts(r);
    expect(s.leaks).toEqual([]);
    expect(s.exclusions).toMatch(/Gyengeáram/);
    expect(planQuoteItems(r, [], { split: true, acknowledgedReview: [], acceptPartial: true, locked: true }).canWrite).toBe(false);
  });

  it("alvállalkozói (csak munkadíj) mód ugyanarra: az anyag kimarad, az ügyfélszöveg kimondja", () => {
    const r = calculateVibaOffer(ownFullConstruction({ mode: "labor_only" }));
    expect(r.totals.materialHuf).toBe(0);
    expect(r.totals.laborHuf).toBe(140 * 7000 + 40000);
    expect(r.scope.excluded.join(" ")).toMatch(/Anyag: a megrendelő biztosítja/);
  });

  it("ismeretlen alapterület: nincs kitalált ár, a sor nem írható; becsült alapterület jelölve", () => {
    expect(calculateVibaOffer(ownFullConstruction({ area: null, areaStatus: "unknown" })).lines[0]!.status).toBe("unknown_qty");
    const est = calculateVibaOffer(ownFullConstruction({ areaStatus: "estimated" }));
    expect(est.lines[0]!.status).toBe("estimated");
    expect(planQuoteItems(est, [], { split: false, acknowledgedReview: [], acceptPartial: true, locked: false }).rows[0]!.name).toMatch(/\(becsült mennyiség\)$/);
  });
});

describe("P7/C — VBF „Sopron út 66.” forgatókönyv: jegyzőkönyv → előzetes → bejárás utáni → tételes", () => {
  const ex = extractVbfDefects(VBF_TESZT_TEXT);
  const rate = (huf: number) => ({ huf, basis: "sell" as const, source: "manual" as const, note: "TESZT díj, nem VIBA-tarifa" });
  const custom = (over: Partial<CustomInput>, withTasks = true): CalcInput => ({ mode: "material_labor", commercial: DEFAULT_COMMERCIAL, profile: {
    ...(emptyProfile("custom") as CustomInput), defects: ex.defects.map(({ id, ref, text, priority, evidence }) => ({ id, ref, text, priority, evidence })),
    tasks: withTasks ? [
      { id: "t1", defectId: "d1", name: "PE sín bekötése a főelosztóban", unit: "klt", qty: 1, qtyStatus: "measured", material: rate(8000), labor: rate(25000) },
      { id: "t2", defectId: "d2", name: "Lámpatest burkolat cseréje", unit: "db", qty: 1, qtyStatus: "measured", material: rate(6000), labor: rate(9000) },
    ] : [],
    surveyFee: { include: true, qty: 1, rate: rate(20000) }, measurement: { include: true, qty: 1, rate: rate(30000), note: "TESZT: érintésvédelmi mérés és jegyzőkönyv" },
    ...over } });

  it("hibapont-kinyerés sorszám-bizonyítékkal; a megjegyzés nem hibapont; sürgősség kulcsszó alapján", () => {
    expect(ex.defects.map((d) => [d.ref, d.priority, d.evidence])).toEqual([["1", "urgent", "3. sor"], ["2", "scheduled", "4. sor"], ["3", "unknown", "5. sor"], ["•1", "unknown", "7. sor"]]);
    expect(ex.defects[3]!.standards).toEqual(["MSZ HD 60364-5-54"]);
    expect(ex.defects.some((d) => /időpontja/.test(d.text))).toBe(false);
  });

  it("előzetes (bejárás előtt): minden mennyiség becsült, a végleges megoldás bejárás után; áramszünet és besorolás kérdés", () => {
    const r = calculateVibaOffer(custom({ scenario: "preliminary" }));
    expect(blockingIssues(r)).toEqual([]);
    expect(r.lines.filter((l) => l.id === "t1" || l.id === "t2").every((l) => l.status === "estimated")).toBe(true);
    expect(r.scope.conditional.join(" ")).toMatch(/bejárás után véglegesíthető/);
    expect(r.scope.questions.join(" ")).toMatch(/áramszünet/);
    expect(r.scope.questions.filter((q) => /sürgős \(biztonsági\) vagy ütemezhető/.test(q))).toHaveLength(2);
    expect(r.scope.conditional.filter((c) => /felmérés után kerül meghatározásra/.test(c))).toHaveLength(2);
  });

  it("bejárás utáni: bejárás nélkül blokkolt (nincs tételírás); rögzített bejárással sürgős/ütemezhető külön, felmérés és mérés külön sor", () => {
    const blocked = calculateVibaOffer(custom({ scenario: "post_survey", surveyDone: false }));
    expect(blockingIssues(blocked).map((i) => i.text).join(" ")).toMatch(/bejárás kell/);
    expect(planQuoteItems(blocked, [], { split: true, acknowledgedReview: [], acceptPartial: true, locked: false }).canWrite).toBe(false);
    const r = calculateVibaOffer(custom({ scenario: "post_survey", surveyDone: true, surveyNote: "TESZT bejárás 2026-11-20, VIBA + közös képviselő", outageNote: "Szombat 8–12 óra, TESZT" }));
    expect(blockingIssues(r)).toEqual([]);
    expect(r.sections.map((s) => s.name)).toEqual(["Sürgős javítások", "Ütemezhető javítások", "Felmérés és kiszállás", "Mérés és dokumentáció"]);
    expect(r.totals.netHuf).toBe(33000 + 15000 + 20000 + 30000);
    expect(r.totals.materialHuf).toBe(14000);
    expect(r.lines.find((l) => l.id === "t1")!.name).toBe("1. pont – PE sín bekötése a főelosztóban");
    const plan = planQuoteItems(r, [], { split: true, acknowledgedReview: [], acceptPartial: false, locked: false });
    expect(plan.canWrite).toBe(true);
    expect(plan.netHuf).toBe(r.totals.netHuf);
    const s = scopeTexts(r);
    expect(s.leaks).toEqual([]);
    expect(s.technicalScope).toMatch(/Áramszünet: Szombat/);
    expect(s.technicalScope).toMatch(/Mérés és dokumentálás: TESZT/);
  });

  it("tételes forgatókönyv: becsült mennyiség és tétel nélküli hibapont blokkol", () => {
    const r = calculateVibaOffer(custom({ scenario: "itemized", surveyDone: true, surveyNote: "TESZT bejárás", tasks: [
      { id: "t1", defectId: "d1", name: "PE sín bekötése", unit: "klt", qty: 1, qtyStatus: "estimated", labor: rate(25000) },
    ] }));
    const b = blockingIssues(r).map((i) => i.text).join(" ");
    expect(b).toMatch(/2\. hibaponthoz nincs javítási tétel/);
    expect(r.lines.find((l) => l.id === "t1")!.status).toBe("blocked");
  });

  it("csak munkadíjas mód: a javítási anyag nem része az árnak", () => {
    const r = calculateVibaOffer({ ...custom({ scenario: "post_survey", surveyDone: true, surveyNote: "TESZT" }), mode: "labor_only" });
    expect(r.totals.materialHuf).toBe(0);
    expect(r.totals.netHuf).toBe(25000 + 9000 + 20000 + 30000);
  });
});
