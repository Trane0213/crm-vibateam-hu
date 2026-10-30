import { describe, expect, it } from "vitest";
import { quoteNet } from "./quote-net";
describe("quoteNet", () => {
  it("2 db × 100 000 Ft = 200 000 Ft nettó", () => {
    expect(quoteNet([{ quantity: 2, unit_price: 100000 }], null)).toBe(200000);
  });
  it("kedvezmény levonva", () => {
    expect(quoteNet([{ quantity: 2, unit_price: 100000 }], 10)).toBe(180000);
  });
  it("tétel nélkül 0", () => {
    expect(quoteNet([], 0)).toBe(0);
  });
});
