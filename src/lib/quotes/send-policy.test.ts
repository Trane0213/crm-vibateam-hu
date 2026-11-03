import { describe, expect, it } from "vitest";
import { checkOutboundSize, checkQuoteDocs, isIdempotencyKey } from "./send-policy";

const MB = 1024 * 1024;
describe("ajánlat-kiküldés szabályok", () => {
  it("20 MB-ig engedett, felette figyelmeztet", () => {
    expect(checkOutboundSize([10 * MB, 10 * MB])).toBeNull();
    expect(checkOutboundSize([15 * MB, 6 * MB])).toMatch(/legfeljebb 20 MB/);
  });
  it("idegen ajánlat dokumentuma nem csatolható", () => {
    expect(checkQuoteDocs(["a"], [{ id: "a", quote_id: "q2" }], "q1")).not.toBeNull();
    expect(checkQuoteDocs(["a", "b"], [{ id: "a", quote_id: "q1" }], "q1")).not.toBeNull();
    expect(checkQuoteDocs(["a"], [{ id: "a", quote_id: "q1" }], "q1")).toBeNull();
  });
  it("küldési azonosító kötelező formátumú", () => {
    expect(isIdempotencyKey("short")).toBe(false);
    expect(isIdempotencyKey(crypto.randomUUID())).toBe(true);
  });
});
