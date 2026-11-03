import { describe, expect, it } from "vitest";
import { checkOutboundSize, checkQuoteDocs, isIdempotencyKey, checkReferencedAttachment, isVerifiedSentMessage } from "./send-policy";

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
  it("csatolt ajánlatra hivatkozó levél nem mehet melléklet nélkül", () => {
    for (const text of ["Mellékelten küldjük ajánlatunkat.", "Csatolt ajánlat", "<p>Mellékletben az ajánlat.</p>", "Please see attached offer."]) {
      expect(checkReferencedAttachment(text, 0)).not.toBeNull();
      expect(checkReferencedAttachment(text, 1)).toBeNull();
    }
    expect(checkReferencedAttachment("Telefonos egyeztetésünket megerősítem.", 0)).toBeNull();
  });
  it("valódi elküldött Gmail-levél kell a rögzítéshez", () => {
    expect(isVerifiedSentMessage({ id: "gmail1", labelIds: ["SENT"], internalDate: "1793716607100" }, "gmail1")).toBe(true);
    expect(isVerifiedSentMessage({ id: "gmail1", labelIds: ["DRAFT"], internalDate: "1793716607100" }, "gmail1")).toBe(false);
    expect(isVerifiedSentMessage({ id: "other", labelIds: ["SENT"], internalDate: "1793716607100" }, "gmail1")).toBe(false);
    expect(isVerifiedSentMessage({ id: "gmail1", labelIds: ["SENT"] }, "gmail1")).toBe(false);
  });
});
