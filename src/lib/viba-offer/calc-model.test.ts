import { describe, expect, it } from "vitest";
import { calculateVibaOffer, emptyProfile, DEFAULT_COMMERCIAL, type CalcInput, type HouseInput, type HourlyInput, type CustomInput, type Rate, type Commercial } from "./calc-model";

const sell = (huf: number, note = "TESZT díj"): Rate => ({ huf, basis: "sell", source: "manual", note });
const cost = (huf: number): Rate => ({ huf, basis: "cost", source: "manual", note: "TESZT önköltség" });
const house = (o: Partial<HouseInput> = {}): HouseInput => ({ ...(emptyProfile("house_sqm") as HouseInput), areaM2: 120, areaStatus: "measured", packageLabel: "TESZT alap", packageVersion: "v1",
  content: { outlets: "included", distribution: "included", cabling: "included", devices: "included", low_voltage: "excluded", metering: "excluded" }, conditionsNote: "Új építés, nyers falazat", materialPerM2: sell(4000), laborPerM2: sell(6000), ...o });
const run = (profile: CalcInput["profile"], mode: CalcInput["mode"] = "material_labor", commercial: Commercial = DEFAULT_COMMERCIAL) => calculateVibaOffer({ mode, commercial, profile });

describe("P6 családi ház m²", () => {
  it("anyag és munkadíj külön, kézzel visszaszámolható: 120 m² × (4000 + 6000) = 1 200 000 Ft", () => {
    const r = run(house());
    const l = r.lines[0]!;
    expect(l.status).toBe("priced");
    expect([l.materialTotalHuf, l.laborTotalHuf, l.totalHuf]).toEqual([480_000, 720_000, 1_200_000]);
    expect(r.totals).toMatchObject({ netHuf: 1_200_000, materialHuf: 480_000, laborHuf: 720_000 });
  });
  it("alvállalkozói módban az anyag nem része az árnak", () => {
    const r = run(house(), "labor_only");
    expect(r.lines[0]!.totalHuf).toBe(720_000);
    expect(r.lines[0]!.material).toBeNull();
    expect(r.scope.excluded.join(" ")).toMatch(/Anyag: a megrendelő biztosítja/);
  });
  it("dokumentált feltétel vagy rögzített csomagtartalom nélkül a m²-ár nem használható", () => {
    expect(run(house({ conditionsNote: "" })).lines[0]!.status).toBe("blocked");
    const r = run(house({ content: { outlets: "included" } }));
    expect(r.lines[0]!.status).toBe("blocked");
    expect(r.scope.questions.length).toBe(5);
  });
  it("üres kiinduló profilban nincs kitalált díj: minden ár hiányzik", () => {
    const r = run({ ...(emptyProfile("house_sqm") as HouseInput), areaM2: 100, areaStatus: "measured", packageLabel: "x", packageVersion: "1", conditionsNote: "x",
      content: { outlets: "included", distribution: "included", cabling: "included", devices: "included", low_voltage: "included", metering: "included" } });
    expect(r.lines[0]!.status).toBe("missing_price");
    expect(r.totals.netHuf).toBe(0);
  });
  it("ismeretlen alapterület: nem árazható; becsült: árazva, jelölve", () => {
    expect(run(house({ areaM2: null, areaStatus: "unknown" })).lines[0]!.status).toBe("unknown_qty");
    const e = run(house({ areaStatus: "estimated" }));
    expect(e.lines[0]!.status).toBe("estimated");
    expect(e.scope.conditional.join(" ")).toMatch(/becsült/);
  });
  it("0 mennyiségű többlettétel nem kerül az összegbe", () => {
    const r = run(house({ extras: [{ id: "x1", name: "Kerti kiállás", unit: "db", qty: 0, qtyStatus: "measured", labor: sell(15000) }] }));
    expect(r.lines[1]!.status).toBe("zero_qty");
    expect(r.totals.netHuf).toBe(1_200_000);
  });
  it("2 tizedesnél pontosabb mennyiség elutasítva", () => {
    expect(run(house({ areaM2: 120.555 })).lines[0]!.status).toBe("blocked");
  });
  it("nem igazolt referencia ár: review státusz", () => {
    expect(run(house({ laborPerM2: { huf: 6500, basis: "sell", source: "reference", note: "6 500 Ft-os minta" } })).lines[0]!.status).toBe("review");
  });
  it("forrásmegjegyzés nélküli díj blokkolt", () => {
    expect(run(house({ laborPerM2: sell(6000, " ") })).lines[0]!.status).toBe("blocked");
  });
});

describe("P6 árrés ≠ fedezet", () => {
  const p = () => house({ materialPerM2: null, laborPerM2: cost(1000), areaM2: 1 });
  it("önköltség árrés/fedezet nélkül blokkolt", () => { expect(run(p()).lines[0]!.status).toBe("blocked"); });
  it("25% árrés: 1000 → 1250, fedezet 20%", () => {
    const r = run(p(), "material_labor", { ...DEFAULT_COMMERCIAL, uplift: { kind: "markup", pct: 25 } });
    expect(r.lines[0]!.unitHuf).toBe(1250);
    expect(r.commercial).toMatchObject({ markupBp: 2500, marginBp: 2000, profitHuf: 250 });
  });
  it("25% fedezet: 1000 ÷ 0,75 = 1333,33 → egész Ft-ra 1333; a kerekítés utáni valós fedezet 24,98%, árrés 33,3%", () => {
    const r = run(p(), "material_labor", { ...DEFAULT_COMMERCIAL, uplift: { kind: "margin", pct: 25 } });
    expect(r.lines[0]!.unitHuf).toBe(1333);
    expect(r.commercial.marginBp).toBe(2498);
    expect(r.commercial.markupBp).toBe(3330);
  });
  it("tartalék külön lépés a fedezet előtt; kerekítés 10 Ft-ra felfelé", () => {
    const r = run(p(), "material_labor", { contingencyPct: 10, uplift: { kind: "margin", pct: 20 }, roundingStepHuf: 10, roundingMode: "up" });
    // 1000 × 1,1 = 1100 → ÷ 0,8 = 1375 → 1380
    expect(r.lines[0]!.unitHuf).toBe(1380);
    expect(r.commercial.contingencyHuf).toBe(100);
    expect(r.lines[0]!.trace.join("\n")).toMatch(/tartalék 10%.*fedezet 20%/s);
  });
  it("eladási árra nem kerül fedezet", () => {
    const r = run(house(), "material_labor", { ...DEFAULT_COMMERCIAL, uplift: { kind: "margin", pct: 30 } });
    expect(r.totals.netHuf).toBe(1_200_000);
    expect(r.commercial.marginBp).toBeNull();
  });
  it("determinisztikus: azonos bemenet → azonos eredmény és azonosító", () => {
    expect(JSON.stringify(run(house()))).toBe(JSON.stringify(run(house())));
    expect(run(house()).calcId).not.toBe(run(house({ areaM2: 121 })).calcId);
  });
});

describe("P6 rezsióradíj", () => {
  const h = (o: Partial<HourlyInput> = {}): HourlyInput => ({ ...(emptyProfile("hourly") as HourlyInput), roles: [{ id: "r1", label: "villanyszerelő", headcount: 2, rate: sell(8000) }],
    bands: [{ band: "workday", hours: 3, qtyStatus: "measured", surchargePct: null }], ...o });
  it("létszám × óra × díj", () => {
    const r = run(h());
    expect(r.lines[0]).toMatchObject({ qty: 6, unitHuf: 8000, totalHuf: 48000, status: "priced" });
  });
  it("minimális kiszállási időkeret kiegészítése", () => {
    const r = run(h({ minHoursPerVisit: 4 }));
    const m = r.lines.find((l) => l.id === "role_r1_min")!;
    expect(m.qty).toBe(2);
    expect(r.totals.netHuf).toBe(64000);
  });
  it("éjszakai felár hiányzik → hiányzó ár, nem kitalált", () => {
    const r = run(h({ bands: [{ band: "night", hours: 2, qtyStatus: "measured", surchargePct: null }] }));
    expect(r.lines[0]!.status).toBe("missing_price");
  });
  it("hétvégi 50% + sürgősségi 20% felár egymás után", () => {
    const r = run(h({ roles: [{ id: "r1", label: "v", headcount: 1, rate: sell(8000) }], bands: [{ band: "weekend", hours: 1, qtyStatus: "measured", surchargePct: 50 }], urgency: { include: true, pct: 20 } }));
    expect(r.lines[0]!.unitHuf).toBe(14400);
  });
  it("sürgősség bekapcsolva mérték nélkül blokkoló", () => {
    expect(run(h({ urgency: { include: true, pct: null } })).issues.some((i) => i.level === "blocking")).toBe(true);
  });
  it("anyag, ha a szerződés nem engedi, kimarad", () => {
    const r = run(h({ materialsAllowed: false, extras: [{ id: "m1", name: "Kábel", unit: "m", qty: 10, qtyStatus: "measured", material: sell(500) }] }));
    expect(r.lines.find((l) => l.id === "m1")!.status).toBe("excluded_mode");
  });
});

describe("P6 egyedi/VBF", () => {
  const c = (o: Partial<CustomInput> = {}): CustomInput => ({ ...(emptyProfile("custom") as CustomInput),
    defects: [{ id: "d1", ref: "3", text: "Hiányzó védővezető a pinceelosztóban — azonnali javítás", priority: "urgent" }, { id: "d2", ref: "7", text: "Feliratozás hiányos", priority: "scheduled" }, { id: "d3", ref: "9", text: "Lámpatest sérült", priority: "unknown" }],
    tasks: [{ id: "t1", defectId: "d1", name: "Védővezető pótlása", unit: "db", qty: 1, qtyStatus: "measured", material: sell(3000), labor: sell(12000) }, { id: "t2", defectId: "d2", name: "Elosztó feliratozása", unit: "db", qty: 2, qtyStatus: "measured", labor: sell(5000) }],
    surveyFee: { include: true, qty: 1, rate: sell(25000) }, measurement: { include: true, qty: 1, rate: null, note: "" }, ...o });
  it("sürgős és ütemezhető javítások külön szakaszban, jegyzőkönyvi hivatkozással", () => {
    const r = run(c());
    expect(r.lines[0]).toMatchObject({ section: "Sürgős javítások", name: "3. pont – Védővezető pótlása" });
    expect(r.lines[1]!.section).toBe("Ütemezhető javítások");
  });
  it("előzetes forgatókönyv: mennyiség becsültnek számít, végleges megoldás nem bizonyított", () => {
    const r = run(c());
    expect(r.lines[0]!.qtyStatus).toBe("estimated");
    expect(r.scope.conditional.join(" ")).toMatch(/bejárás után véglegesíthető/);
    expect(r.scope.conditional.join(" ")).toMatch(/9\. pont/);
    expect(r.scope.questions.join(" ")).toMatch(/9\. pont: sürgős/);
  });
  it("mérés díja hiányzik → hiányzó ár sor, végösszeg nem teljes", () => {
    const r = run(c());
    expect(r.lines.find((l) => l.id === "measurement")!.status).toBe("missing_price");
    expect(r.totals.openLines).toBe(1);
    expect(r.totals.netHuf).toBe(3000 + 12000 + 10000 + 25000);
  });
  it("bejárás utáni forgatókönyv bejárás nélkül blokkoló", () => {
    expect(run(c({ scenario: "post_survey" })).issues.some((i) => i.level === "blocking")).toBe(true);
  });
  it("tételes forgatókönyv: hibapont tétel nélkül blokkoló, becsült mennyiség blokkolt", () => {
    const r = run(c({ scenario: "itemized", surveyDone: true, surveyNote: "2026-11-11 bejárás", tasks: [{ id: "t1", defectId: "d1", name: "x", unit: "db", qty: 1, qtyStatus: "estimated", labor: sell(1) }] }));
    expect(r.lines[0]!.status).toBe("blocked");
    expect(r.issues.filter((i) => i.level === "blocking").length).toBe(2);
  });
});
