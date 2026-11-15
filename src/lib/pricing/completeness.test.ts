import { describe, expect, it } from "vitest";
import { openLines, pricingComplete } from "./completeness";

const st = (o: Partial<Record<string, number>>) => ({ priced: 0, review: 0, blocked: 0, excluded_review: 0, missing: 0, zero_qty: 0, existing_price: 0, ...o });
describe("árazási teljesség", () => {
  it("Dohány-eset: 0 árazott, 43 ellenőrizendő, 582 forrás nélküli → nem vehető át", () => {
    const t = { byStatus: st({ review: 43, missing: 582 }), netHuf: 0 };
    expect(openLines(t)).toBe(625); expect(pricingComplete(t, "blocked")).toBe(false);
  });
  it("részben árazott, de van hiányzó sor → nem vehető át, akkor sem, ha van részösszeg", () => {
    expect(pricingComplete({ byStatus: st({ priced: 600, missing: 1 }), netHuf: 1_000_000 }, "verified")).toBe(false);
  });
  it("0 Ft-os teljes számítás nem kész ajánlat", () => {
    expect(pricingComplete({ byStatus: st({ priced: 3 }), netHuf: 0 }, "verified")).toBe(false);
  });
  it("minden sor árazott és visszaellenőrzött → átvehető", () => {
    expect(pricingComplete({ byStatus: st({ priced: 646 }), netHuf: 12_500_000 }, "verified")).toBe(true);
  });
});
