import { describe, expect, it } from "vitest";
import { mergePricingOverrides, parseQuotePricingSettings, validatePricingSettings, EMPTY_PRICING_SETTINGS } from "./pricing-settings";
import { resolveProfile } from "@/lib/pricing/profiles";

describe("ajánlatonkénti árazási beállítás", () => {
  it("nincs rejtett óradíj: üres beállítás mellett a profil óradíja null", () => {
    const p = resolveProfile("subcontractor_labor", mergePricingOverrides(EMPTY_PRICING_SETTINGS));
    expect(p.laborRateHuf).toBeNull();
  });
  it("a mentett óradíj érvényesül, ha a hívó nem ad meg mást", () => {
    const s = parseQuotePricingSettings({ laborRateHuf: 7200, contingencyPct: 5 });
    const p = resolveProfile("subcontractor_labor", mergePricingOverrides(s));
    expect(p.laborRateHuf).toBe(7200); expect(p.contingencyPct).toBe(5);
  });
  it("kifejezett hívói érték felülírja a mentettet (pl. Timothy-módosítás)", () => {
    const s = parseQuotePricingSettings({ laborRateHuf: 7200 });
    expect(mergePricingOverrides(s, { laborRateHuf: 10000 }).laborRateHuf).toBe(10000);
  });
  it("hibás mentett érték = nincs megadva", () => {
    expect(parseQuotePricingSettings({ laborRateHuf: "abc", mode: "x" })).toEqual(EMPTY_PRICING_SETTINGS);
  });
  it("érvénytelen óradíj és célfedezet nem menthető", () => {
    expect(validatePricingSettings({ ...EMPTY_PRICING_SETTINGS, laborRateHuf: 0, marginPct: 99 })).toHaveLength(2);
  });
});
