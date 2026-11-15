import { describe, it, expect } from "vitest";
import { budapestMonth, budapestMonthStart, canWriteTargets, canReadTargets, parseTarget, saveTargetSchema, targetKey, targetProgress } from "./targets";

describe("havi célok", () => {
  it("nincs mentett cél → nincs százalék (nem kitalált érték)", () => {
    expect(targetProgress(5_000_000, null)).toBeNull();
    expect(parseTarget(null)).toBeNull();
    expect(parseTarget({ revision: 1, amount: 0 })).toBeNull();
  });
  it("ismert tény és cél → kerekített százalék", () => {
    expect(targetProgress(67, { revision: 1, amount: 100 })).toBe(67);
  });
  it("ismeretlen tény → nincs százalék", () => {
    expect(targetProgress(null, { revision: 1, amount: 100 })).toBeNull();
  });
  it("célt csak tulajdonos menthet, olvasni Sales és Marketing is tud, projektvezető nem", () => {
    expect(canWriteTargets("owner")).toBe(true);
    expect(canWriteTargets("sales")).toBe(false);
    expect(canWriteTargets("marketing")).toBe(false);
    expect(canReadTargets("sales")).toBe(true);
    expect(canReadTargets("project_manager")).toBe(false);
  });
  it("negatív vagy nulla cél nem menthető", () => {
    expect(saveTargetSchema.safeParse({ area: "sales", month: "2026-11", amount: 0, expectedRevision: 0 }).success).toBe(false);
    expect(saveTargetSchema.safeParse({ area: "sales", month: "2026-13", amount: 5, expectedRevision: 0 }).success).toBe(false);
  });
  it("kulcs és budapesti hónap", () => {
    expect(targetKey("marketing", "2026-11")).toBe("workspace_target:marketing:2026-11");
    // 2026-11-30 23:30 UTC = december 1. 00:30 Budapesten
    expect(budapestMonth(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12");
    expect(budapestMonthStart(new Date("2026-11-15T10:00:00Z"))).toBe("2026-10-31T23:00:00.000Z");
  });
});
