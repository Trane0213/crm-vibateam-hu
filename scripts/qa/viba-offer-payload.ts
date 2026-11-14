// P6 izolált UI-próba bemenete: kitalált TESZT-kalkulációk VIBA-KALK-1 kódként (a panel „Timothy-javaslat betöltése” mezőjébe).
// Minden díj TESZT-érték, nem VIBA-tarifa. Futtatás: bun scripts/qa/viba-offer-payload.ts > /tmp/browser/viba/payload.json
import { DEFAULT_COMMERCIAL, emptyProfile, type CalcInput } from "../../src/lib/viba-offer/calc-model";
import { encodeImport } from "../../src/lib/viba-offer/calc-schema";

const r = (huf: number, source: "manual" | "reference" = "manual") => ({ huf, basis: "sell" as const, source, note: source === "reference" ? "TESZT referencia (nem igazolt)" : "TESZT díj" });
const house: CalcInput = { mode: "material_labor", commercial: DEFAULT_COMMERCIAL, profile: { ...(emptyProfile("house_sqm") as any), areaM2: 120, areaStatus: "measured", packageLabel: "TESZT alap", packageVersion: "v1",
  content: { outlets: "included", distribution: "included", cabling: "included", devices: "included", low_voltage: "excluded", metering: "excluded" }, conditionsNote: "TESZT: új építés, nyers falazat",
  materialPerM2: r(4000), laborPerM2: r(6000),
  extras: [{ id: "x1", name: "Kerti kiállás", unit: "db", qty: 2, qtyStatus: "measured", labor: r(18000, "reference") }, { id: "x2", name: "Napelem előkészítés", unit: "db", qty: 1, qtyStatus: "measured", material: null, labor: null }, { id: "x3", name: "Klíma betáp", unit: "db", qty: 0, qtyStatus: "measured", labor: r(9000) }] } };
const custom: CalcInput = { mode: "material_labor", commercial: { ...DEFAULT_COMMERCIAL, uplift: { kind: "margin", pct: 20 } }, profile: { ...(emptyProfile("custom") as any), surveyFee: { include: true, qty: 1, rate: r(25000) } } };
console.log(JSON.stringify({ house: encodeImport(house), custom: encodeImport(custom) }));
