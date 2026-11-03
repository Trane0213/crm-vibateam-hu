import { describe, expect, it } from "vitest";
import { applyTemplateDefaults, hasDraftTerms, QUOTE_TEMPLATES } from "./templates";

describe("VIBA ajánlatsablonok (S6)", () => {
  it("a sablon nem írja felül az ajánlatonként módosított feltételt", () => {
    const out = applyTemplateDefaults("b2b", { payment: "30 napos átutalás" });
    expect(out.payment).toBe("30 napos átutalás");
    expect(out.extra_work).toContain("Többletmunka");
  });
  it("a jóvá nem hagyott sablonszöveg tervezetként jelölt", () => {
    expect(hasDraftTerms(applyTemplateDefaults("private", {}))).toBe(true);
    expect(hasDraftTerms({ payment: "Végleges szöveg" })).toBe(false);
  });
  it("mindkét sablonnak van változatszáma", () => {
    expect(QUOTE_TEMPLATES.private.version).toBeGreaterThan(0);
    expect(QUOTE_TEMPLATES.b2b.version).toBeGreaterThan(0);
  });
});
