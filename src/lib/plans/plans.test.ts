import { describe, expect, it } from "vitest";
import { resolveProfile } from "@/lib/pricing/profiles";
import { buildCabinets } from "./cabinet-bom";
import { bomMatchName, priceCabinets } from "./cabinet-pricing";
import { runPlanReview } from "./plan-review";
import { buildRegistry, identifyPage } from "./sheet-identify";
import type { PlanFile, PlanPage } from "./plan-text";
import { cabinetPlan, FIVE_CABINETS, materialSources, TEST_RULES } from "./__fixtures__/plans";

const AS_OF = "2026-11-15";
const all = FIVE_CABINETS.map(cabinetPlan);
const files: PlanFile[] = all.map((x) => x.file), pages: PlanPage[] = all.flatMap((x) => x.pages);
const ids = pages.map((p) => identifyPage(files.find((f) => f.fileId === p.fileId)!, p));
const cabinets = buildCabinets(files, pages, ids);
const priceAll = (names: Record<string, number>) => materialSources(names);
const allNames = () => Object.fromEntries(cabinets.flatMap((c) => [...(c.enclosure ? [c.enclosure] : []), ...c.lines]).map((b) => [bomMatchName(b), 1000]));

describe("tervjel, lap, revízió, típus felismerése oldalszintű bizonyítékkal", () => {
  it("címmezőből tervjel, lapszám és lapösszeg; bizonyíték fájl+oldal+részlet", () => {
    const fe = ids.filter((i) => i.fileId === "t-fe");
    expect(fe.map((i) => i.drawingNo?.value)).toEqual(["T-5", "T-5", "T-5"]);
    expect(fe[0]!.drawingNo!.confidence).toBe("high");
    expect(fe[0]!.drawingNo!.evidence).toMatchObject({ kind: "plan", fileId: "t-fe", page: 1 });
    expect(fe[0]!.sheetTotal?.value).toBe(3);
    expect(fe.map((i) => i.sheetNo?.value ?? null)).toEqual([null, 2, 3]);
    expect(fe[0]!.date?.value).toBe("2026-10-01");
    expect(fe.map((i) => i.docType.value)).toEqual(["cabinet_notes", "single_line", "cabinet_view"]);
    expect(fe.every((i) => i.cabinetIds.some((c) => c.id === "FE"))).toBe(true);
  });
  it("hiányzó lap: a terv 3 lapból áll, de csak 2 oldal érhető el", () => {
    const x = cabinetPlan({ ...FIVE_CABINETS[1]!, fileId: "t-drop", dropSheet: 3 });
    const reg = buildRegistry([x.file], x.pages.map((p) => identifyPage(x.file, p)));
    expect(reg.drawings[0]!.issues.map((i) => i.code)).toContain("missing_sheets");
    expect(reg.drawings[0]!.issues[0]!.message).toMatch(/3 lapból áll, de csak 2 oldal/);
  });
  it("revízióütközés: azonos tervjel két fájlban eltérő dátummal → tisztázandó, nem választunk automatikusan", () => {
    const a = cabinetPlan({ ...FIVE_CABINETS[1]!, fileId: "r-a", fileName: "T-6_E1_eloszto.pdf" });
    const b = cabinetPlan({ ...FIVE_CABINETS[1]!, fileId: "r-b", fileName: "T-6_E1_eloszto_uj.pdf", date: "2026. 11. 05." });
    const ps = [...a.pages, ...b.pages];
    const reg = buildRegistry([a.file, b.file], ps.map((p) => identifyPage(p.fileId === "r-a" ? a.file : b.file, p)));
    expect(reg.drawings[0]!.issues.some((i) => i.code === "revision_conflict")).toBe(true);
  });
  it("P2 feldolgozó szöveges oldala (pozíció nélkül): címkézett rajzszám és lapszám", () => {
    const f: PlanFile = { fileId: "p2", fileName: "csomag/villamos/terv.pdf", path: "csomag/villamos/terv.pdf", origin: "package_file", pageCount: 1, status: "read" };
    const id = identifyPage(f, { fileId: "p2", page: 1, source: "text_layer", aiExtracted: false, width: null, height: null, items: null, text: "FÖLDSZINT ERŐSÁRAMÚ ALAPRAJZ\nRajzszám:\nE-02\nRev. B\n2026.09.30\n2. lap" });
    expect(id.drawingNo).toMatchObject({ value: "E-02", confidence: "high" });
    expect(id.revision?.value).toBe("Rev. B");
    expect(id.sheetNo?.value).toBe(2);
    expect(id.docType.value).toBe("floor_plan");
  });
  it("„revíziós” szó nem revízió; hivatkozás („3.lapra”) nem lapszám", () => {
    const f: PlanFile = { fileId: "x", fileName: "x.pdf", path: null, origin: "fixture", pageCount: 1, status: "read" };
    const id = identifyPage(f, { fileId: "x", page: 1, source: "text_layer", aiExtracted: false, width: null, height: null, items: null, text: "A revíziós ajtó helye\nfolytatás a 3.lapra" });
    expect(id.revision).toBeNull(); expect(id.sheetNo).toBeNull();
  });
  it("szkennelt (szövegréteg nélküli) oldal: olvashatatlan, OCR szükséges — nem „teljes”", () => {
    const f: PlanFile = { fileId: "s", fileName: "V-1.pdf", path: null, origin: "fixture", pageCount: 1, status: "read" };
    const p: PlanPage = { fileId: "s", page: 1, source: "text_layer", aiExtracted: false, width: 842, height: 1191, items: [], text: "" };
    const reg = buildRegistry([f], [identifyPage(f, p)]);
    expect(reg.matrix[0]).toMatchObject({ status: "unreadable", readablePages: 0 });
    expect(reg.matrix[0]!.reasons.join(" ")).toMatch(/OCR/);
  });
});

describe("elosztó-BOM a nézeti rajzból, kapcsolási rajzzal összevetve", () => {
  it("öt különböző TESZT elosztó: hiánytalan anyagjegyzék, darabszámok egyeznek", () => {
    expect(cabinets.map((c) => c.id).sort()).toEqual(["ALE-2", "E1", "FE", "KT", "VE"]);
    for (const c of cabinets) {
      expect(c.status, c.id).toBe("bom_complete");
      expect(c.enclosure, c.id).not.toBeNull();
      expect(c.reconciliation.every((r) => r.ok !== false), c.id).toBe(true);
    }
  });
  it("FE: 10 kismegszakító névleges áram szerint 16A×6 + 10A×4, 1P a jelmagyarázatból; RCD 2 db", () => {
    const fe = cabinets.find((c) => c.id === "FE")!;
    const mcb = fe.lines.filter((l) => l.cls === "mcb" && l.parentId === "rating_breakdown");
    expect(Object.fromEntries(mcb.map((l) => [l.rating, l.qty]))).toEqual({ "10A": 4, "16A": 6 });
    expect(mcb.every((l) => l.poles === "1P")).toBe(true);
    expect(fe.reconciliation.find((r) => r.cls === "rcd")).toMatchObject({ explicit: 2, schematic: 2, ok: true });
    expect(fe.circuits).toHaveLength(10);
    expect(fe.circuits[0]).toMatchObject({ id: "1", cable: "NYY 3x2.5" });
  });
  it("darabszám-eltérés (nézeti 12 ↔ rajz 10): részleges BOM, kérdés, nincs bontás", () => {
    const x = cabinetPlan({ ...FIVE_CABINETS[0]!, fileId: "t-bad", explicit: FIVE_CABINETS[0]!.explicit.map((e) => e.replace("10db", "12db")) });
    const c = buildCabinets([x.file], x.pages, x.pages.map((p) => identifyPage(x.file, p)))[0]!;
    expect(c.status).toBe("bom_partial");
    expect(c.reconciliation.find((r) => r.cls === "mcb")).toMatchObject({ explicit: 12, schematic: 10, ok: false });
    expect(c.lines.some((l) => l.parentId === "rating_breakdown" && l.cls === "mcb")).toBe(false);
    expect(c.questions.join(" ")).toMatch(/nézeti rajzon 12, a kapcsolási rajzon 10/);
  });
  it("kétféle pólus a jelmagyarázatban → pólusszám bizonytalan, nem találjuk ki", () => {
    const x = cabinetPlan({ ...FIVE_CABINETS[1]!, fileId: "t-pole", legendPoles: ["1P", "3P"] });
    const c = buildCabinets([x.file], x.pages, x.pages.map((p) => identifyPage(x.file, p)))[0]!;
    expect(c.status).toBe("bom_partial");
    expect(c.lines.find((l) => l.cls === "mcb" && !l.parentId)!.uncertain.join(" ")).toMatch(/1P és 3P/);
  });
});

describe("szekrénykalkuláció: anyag + összeszerelés/gyártás + helyszíni bekötés külön, P3 motorral", () => {
  const profile = resolveProfile("full_construction", { marginPct: 20, contingencyPct: 5, laborRateHuf: 6500, roundingStepHuf: 1 });
  it("öt hiánytalan elosztó: teljes szekrényár = három költségnem összege; kézzel visszaszámolható sor", () => {
    const r = priceCabinets({ cabinets, sources: priceAll(allNames()), profile, rules: TEST_RULES, asOf: AS_OF });
    for (const e of r.estimates) {
      expect(e.totals.complete, e.cabinetId).toBe(true);
      expect(e.totals.fullPriceHuf).toBeCloseTo(e.totals.materialHuf + e.totals.assemblyHuf + e.totals.siteHuf, 2);
      expect(e.lines.some((l) => l.category === "site")).toBe(true);
      expect(e.lines.some((l) => l.category === "assembly")).toBe(true);
    }
    const fe = r.estimates.find((e) => e.cabinetId === "FE")!;
    // 1000 Ft beszerzés → +5% tartalék = 1050 → / (1−0,20) = 1312,50 → kerekítés 1 Ft = 1313 Ft/db; 6 db 16A = 7878 Ft
    expect(fe.lines.find((l) => l.description.includes("16A"))).toMatchObject({ unitHuf: 1313, qty: 6, totalHuf: 7878, status: "priced" });
    // 0,25 óra × 6500 = 1625 → +5% = 1706,25 → 1706 Ft/db, 10 db kismegszakító
    expect(fe.lines.find((l) => l.id === "A:FE:mcb")).toMatchObject({ unitHuf: 1706, qty: 10, totalHuf: 17060, confidence: "estimate" });
    // helyszíni elmenők: 10 áramkör × 0,3 óra × 6500 = 1950 → +5% = 2047,5 → 2048 Ft/áramkör
    expect(fe.lines.find((l) => l.id === "S:FE:outgoing")).toMatchObject({ unitHuf: 2048, qty: 10, totalHuf: 20480 });
    expect(fe.lines.filter((l) => l.status === "summarized").length).toBeGreaterThan(0);
  });
  it("normaórák nélkül nincs kitalált munkadíj és nincs teljes szekrényár", () => {
    const r = priceCabinets({ cabinets, sources: priceAll(allNames()), profile, asOf: AS_OF });
    for (const e of r.estimates) { expect(e.totals.complete).toBe(false); expect(e.totals.fullPriceHuf).toBeNull(); expect(e.totals.assemblyHuf + e.totals.siteHuf).toBe(0); }
    expect(r.estimates[0]!.lines.find((l) => l.category === "assembly")!.reasons.join(" ")).toMatch(/norma nincs megadva/);
  });
  it("anyagár nélkül nincs teljes szekrényár; célfedezet nélkül az önköltség-alapú anyag blokkolt", () => {
    const a = priceCabinets({ cabinets, sources: [], profile, rules: TEST_RULES, asOf: AS_OF });
    expect(a.estimates.every((e) => !e.totals.complete && e.totals.materialHuf === 0)).toBe(true);
    const b = priceCabinets({ cabinets, sources: priceAll(allNames()), profile: resolveProfile("full_construction", { laborRateHuf: 6500 }), rules: TEST_RULES, asOf: AS_OF });
    expect(b.estimates[0]!.lines.filter((l) => l.category === "material" && l.status === "blocked").length).toBeGreaterThan(0);
  });
  it("alvállalkozói mód: anyag nulla, gyártás és helyszíni munka külön marad", () => {
    const r = priceCabinets({ cabinets, sources: priceAll(allNames()), profile: resolveProfile("subcontractor_labor", { laborRateHuf: 6500 }), rules: TEST_RULES, asOf: AS_OF });
    for (const e of r.estimates) { expect(e.totals.materialHuf).toBe(0); expect(e.totals.complete).toBe(true); expect(e.lines.filter((l) => l.category === "material").every((l) => ["excluded", "summarized"].includes(l.status))).toBe(true); }
  });
  it("hiányzó rajz: a költségvetésben szereplő szekrény ár nélkül, kérdéssel", () => {
    const r = runPlanReview({ files, pages, budget: null, clarifications: [], sources: [], profile, asOf: AS_OF });
    expect(r.cabinets.find((c) => c.id === "X9")).toBeUndefined();
  });
  it("chat-módosítások: tartalék, gyártási többlet, már beszerzett anyag kivétele — érintetlen sorok változatlanok", () => {
    const base = priceCabinets({ cabinets, sources: priceAll(allNames()), profile, rules: TEST_RULES, asOf: AS_OF });
    const fe0 = base.estimates.find((e) => e.cabinetId === "FE")!;
    const enc = fe0.lines.find((l) => l.bomLineId === "FE-ENC")!;
    const r = priceCabinets({ cabinets, sources: priceAll(allNames()), profile, rules: TEST_RULES, asOf: AS_OF, adjustments: [
      { id: "a1", op: "contingency_pct", reason: "bizonytalan RCD-árak", cabinetId: "FE", category: "material", lineIds: fe0.lines.filter((l) => l.description.includes("RCD")).map((l) => l.id), pct: 25 },
      { id: "a2", op: "add_amount", reason: "Főelosztó gyártási díja +60 000 Ft", cabinetId: "FE", category: "assembly", amountHuf: 60000 },
      { id: "a3", op: "remove_line", reason: "szekrénytestet már beszereztük", lineIds: [enc.id] },
      { id: "a4", op: "contingency_pct", reason: "", pct: 10 },
    ] });
    const fe = r.estimates.find((e) => e.cabinetId === "FE")!;
    expect(r.applied.find((a) => a.id === "a4")!.error).toMatch(/Indoklás/);
    expect(fe.lines.find((l) => l.id === enc.id)!.status).toBe("excluded");
    expect(fe.lines.find((l) => l.id === "X:FE:a2")).toMatchObject({ category: "assembly", totalHuf: 60000 });
    // RCD: 1000 → +25% = 1250 → /0,8 = 1562,5 → 1563 (az alap 5% helyett 25%)
    expect(fe.lines.find((l) => l.description.includes("RCD"))!.unitHuf).toBe(1563);
    expect(fe.totals.assemblyHuf).toBeCloseTo(fe0.totals.assemblyHuf + 60000, 2);
    const e1Before = base.estimates.find((e) => e.cabinetId === "E1")!.totals, e1After = r.estimates.find((e) => e.cabinetId === "E1")!.totals;
    expect(e1After).toEqual(e1Before);
    expect(r.diff!.every((d) => d.id.includes("FE"))).toBe(true);
  });
  it("érvénytelen normaóra elutasítva", () => {
    expect(() => priceCabinets({ cabinets, sources: [], profile, rules: { ...TEST_RULES, siteMountHoursPerCabinet: -1 }, asOf: AS_OF })).toThrow(/normaóra/);
  });
});
