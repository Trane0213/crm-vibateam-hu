import { describe, expect, it } from "vitest";
import { quoteFormDirty } from "./form-dirty";

const F = ["title", "discount_percent", "valid_until"] as const;
describe("ajánlat nem mentett módosítás jelzése", () => {
  it("mentett állapottal egyező űrlap nem piszkos", () => {
    expect(quoteFormDirty(F, { title: "A", discount_percent: "10", valid_until: "" }, { title: "A", discount_percent: 10, valid_until: null })).toBe(false);
  });
  it("számformátum-eltérés nem módosítás", () => {
    expect(quoteFormDirty(F, { title: "A", discount_percent: "10.00", valid_until: "" }, { title: "A", discount_percent: 10, valid_until: null })).toBe(false);
  });
  it("megváltozott cím vagy kitörölt dátum módosítás", () => {
    expect(quoteFormDirty(F, { title: "B", discount_percent: "10", valid_until: "" }, { title: "A", discount_percent: 10, valid_until: null })).toBe(true);
    expect(quoteFormDirty(F, { title: "A", discount_percent: "10", valid_until: "" }, { title: "A", discount_percent: 10, valid_until: "2026-12-01" })).toBe(true);
  });
});
