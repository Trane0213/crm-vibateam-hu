import { describe, expect, it } from "vitest";
import { calculateVibaOffer, emptyProfile, DEFAULT_COMMERCIAL, type HouseInput, type Rate } from "./calc-model";
import { mergeText, planQuoteItems, scopeTexts } from "./item-plan";

const sell = (huf: number, source: Rate["source"] = "manual"): Rate => ({ huf, basis: "sell", source, note: "TESZT" });
const house = (o: Partial<HouseInput> = {}): HouseInput => ({ ...(emptyProfile("house_sqm") as HouseInput), areaM2: 100, areaStatus: "measured", packageLabel: "TESZT", packageVersion: "v1",
  content: { outlets: "included", distribution: "included", cabling: "included", devices: "included", low_voltage: "excluded", metering: "excluded" }, conditionsNote: "TESZT feltétel",
  materialPerM2: sell(4000), laborPerM2: sell(6000), ...o });
const calc = (h: HouseInput, mode: "material_labor" | "labor_only" = "material_labor") => calculateVibaOffer({ mode, commercial: DEFAULT_COMMERCIAL, profile: h });
const O = { split: true, acknowledgedReview: [], acceptPartial: false, locked: false };

describe("P6 tételterv a meglévő quote_items-hez", () => {
  it("külön anyag és munkadíj sor; összeg egyezik a kalkulációval", () => {
    const p = planQuoteItems(calc(house()), [], O);
    expect(p.canWrite).toBe(true);
    expect(p.rows.map((r) => [r.name, r.quantity, r.unit, r.unit_price])).toEqual([
      ["Villamos szerelés – TESZT (v1) – anyag", 100, "m2", 4000], ["Villamos szerelés – TESZT (v1) – munkadíj", 100, "m2", 6000]]);
    expect(p.netHuf).toBe(1_000_000);
  });
  it("összevont sor kérésre", () => {
    const p = planQuoteItems(calc(house()), [], { ...O, split: false });
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ unit_price: 10000, name: "Villamos szerelés – TESZT (v1) (anyag + munkadíj)" });
  });
  it("munkadíjas módban csak munkadíj sor", () => {
    expect(planQuoteItems(calc(house(), "labor_only"), [], O).rows.map((r) => r.part)).toEqual(["labor"]);
  });
  it("ismételt futtatás: azonos tétel nem íródik újra; eltérő tartalmú azonos nevű tétel ütközés, nem felülírás", () => {
    const first = planQuoteItems(calc(house()), [], O).rows;
    const again = planQuoteItems(calc(house()), first, O);
    expect(again.rows).toHaveLength(0);
    expect(again.duplicates).toHaveLength(2);
    expect(again.canWrite).toBe(false);
    const changed = planQuoteItems(calc(house({ areaM2: 110 })), first, O);
    expect(changed.rows).toHaveLength(0);
    expect(changed.conflicts).toHaveLength(2);
  });
  it("zárolt ajánlatba nem ír", () => {
    expect(planQuoteItems(calc(house()), [], { ...O, locked: true }).canWrite).toBe(false);
  });
  it("hiányos tételsor csak kifejezett tudomásulvétellel; hiányzó ár sosem íródik", () => {
    const r = calc(house({ extras: [{ id: "e1", name: "Kerti kiállás", unit: "db", qty: 1, qtyStatus: "measured" }] }));
    expect(planQuoteItems(r, [], O).canWrite).toBe(false);
    const ok = planQuoteItems(r, [], { ...O, acceptPartial: true });
    expect(ok.canWrite).toBe(true);
    expect(ok.rows.some((x) => x.lineId === "e1")).toBe(false);
    expect(ok.skipped[0]!.lineId).toBe("e1");
  });
  it("nem igazolt referencia csak tételes nyugtázással kerül be", () => {
    const r = calc(house({ laborPerM2: sell(6500, "reference") }));
    expect(r.totals.reviewHuf).toBe(1_050_000);
    expect(planQuoteItems(r, [], { ...O, acceptPartial: true }).rows).toHaveLength(0);
    expect(planQuoteItems(r, [], { ...O, acknowledgedReview: ["house_m2"] }).rows).toHaveLength(2);
  });
  it("becsült mennyiség az ügyfélnek is látszik a tétel nevében", () => {
    expect(planQuoteItems(calc(house({ areaStatus: "estimated" })), [], O).rows[0]!.name).toMatch(/\(becsült mennyiség\)$/);
  });
  it("belső kifejezés az ügyfélnek szánt megnevezésben: a sor kimarad", () => {
    const p = planQuoteItems(calc(house({ packageLabel: "önköltség csomag" })), [], { ...O, acceptPartial: true });
    expect(p.rows).toHaveLength(0);
    expect(p.skipped[0]!.reason).toMatch(/belső kifejezés/);
  });
  it("lehatárolás: vállalt/kizárt/feltételes/kérdés, belső adat nélkül; meglévő szöveget nem ír felül", () => {
    const s = scopeTexts(calc(house()));
    expect(s.technicalScope).toMatch(/Vállalt munkák:\n– Kiállások/);
    expect(s.exclusions).toMatch(/Gyengeáram/);
    expect(s.leaks).toEqual([]);
    expect(mergeText("Saját szöveg", "Új")).toBe("Saját szöveg\n\nÚj");
    expect(mergeText("Saját szöveg\n\nÚj", "Új")).toBe("Saját szöveg\n\nÚj");
    expect(mergeText("", "Új")).toBe("Új");
  });
});
