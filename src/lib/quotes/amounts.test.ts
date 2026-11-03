import { describe, expect, it } from "vitest";
import { quoteAmounts } from "./amounts";

describe("quoteAmounts", () => {
  it("tétel és kézi összeg nélkül nincs megadva (nem 0 Ft)", () => {
    const a = quoteAmounts({ itemCount: 0, totalAmount: 0, manualNetAmount: null, taxPercent: null });
    expect(a.source).toBe("none");
    expect(a.net).toBeNull();
    expect(a.gross).toBeNull();
  });
  it("fájlalapú ajánlat: kézi nettó 1 000 000, 27% ÁFA → bruttó 1 270 000", () => {
    const a = quoteAmounts({ itemCount: 0, totalAmount: 0, manualNetAmount: 1_000_000, taxPercent: null });
    expect(a.source).toBe("manual");
    expect(a.gross).toBe(1_270_000);
  });
  it("tételes 200 000 nettó, 5% ÁFA → bruttó 210 000", () => {
    const a = quoteAmounts({ itemCount: 1, totalAmount: 200_000, manualNetAmount: null, taxPercent: 5 });
    expect(a.source).toBe("items");
    expect(a.gross).toBe(210_000);
  });
  it("tételes és kézi összeg eltérése jelzett", () => {
    const a = quoteAmounts({ itemCount: 1, totalAmount: 200_000, manualNetAmount: 190_000, taxPercent: 27 });
    expect(a.mismatch).toBe(true);
    expect(a.net).toBe(200_000);
  });
});
