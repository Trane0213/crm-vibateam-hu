import { describe, expect, it } from "vitest";
import { applyTemplateDefaults, hasDraftTerms, QUOTE_TEMPLATES, canReadTemplateDefaults, canWriteTemplateDefaults } from "./templates";
import { saveDefaultsSchema } from "./template-defaults-schema";

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
  it("általános sablonalapot kizárólag owner írhat", () => {
    expect(canWriteTemplateDefaults("owner")).toBe(true);
    for (const role of ["sales", "project_manager", "marketing", null]) expect(canWriteTemplateDefaults(role)).toBe(false);
  });
  it("Sales olvashatja az alapokat, szerepkör nélkül nem", () => {
    expect(canReadTemplateDefaults("sales")).toBe(true);
    expect(canReadTemplateDefaults(null)).toBe(false);
  });
  it("a tulajdonosi alap nem ír át már mentett ajánlatfeltételt", () => {
    const saved = { payment: "Egyedi 30 nap" };
    const out = applyTemplateDefaults("private", saved, { payment: "8 nap", schedule: "Május" });
    expect(out.payment).toBe("Egyedi 30 nap");
    expect(out.schedule).toBe("Május");
    expect(saved).toEqual({ payment: "Egyedi 30 nap" });
  });
  it("csak ismert szakasz menthető", () => {
    expect(saveDefaultsSchema.safeParse({ key: "private", expectedRevision: 0, terms: { arbitrary: "nem" } }).success).toBe(false);
    expect(saveDefaultsSchema.safeParse({ key: "private", expectedRevision: 0, terms: { payment: "8 nap" } }).success).toBe(true);
  });
  it("4000 karakternél hosszabb feltétel nem menthető", () => {
    expect(saveDefaultsSchema.safeParse({ key: "b2b", expectedRevision: 0, terms: { payment: "a".repeat(4001) } }).success).toBe(false);
  });
});
