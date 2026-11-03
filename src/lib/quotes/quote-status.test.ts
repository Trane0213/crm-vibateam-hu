import { describe, expect, it } from "vitest";
import { allowedNextStatuses, canScheduleQuoteFollowup } from "./quote-status";

describe("ajánlati állapotok (S5)", () => {
  it("kiküldés nélkül nem választható kiküldött, elfogadott vagy elutasított", () => {
    const next = allowedNextStatuses("draft", null);
    expect(next).not.toContain("sent");
    expect(next).not.toContain("accepted");
    expect(next).not.toContain("rejected");
  });
  it("lezárt ajánlat nem nyitható újra", () => {
    expect(allowedNextStatuses("accepted", "2026-11-03T10:00:00Z")).toEqual([]);
    expect(allowedNextStatuses("rejected", "2026-11-03T10:00:00Z")).toEqual([]);
    expect(allowedNextStatuses("withdrawn", null)).toEqual([]);
  });
  it("kiküldött ajánlat pontosításra, elfogadásra vagy elutasításra állítható", () => {
    expect(allowedNextStatuses("sent", "2026-11-03T10:00:00Z")).toEqual(["negotiation", "accepted", "rejected", "withdrawn"]);
  });
  it("utánkövetés csak kiküldött vagy pontosítás alatti ajánlatnál", () => {
    expect(canScheduleQuoteFollowup("sent")).toBe(true);
    expect(canScheduleQuoteFollowup("negotiation")).toBe(true);
    expect(canScheduleQuoteFollowup("draft")).toBe(false);
    expect(canScheduleQuoteFollowup("accepted")).toBe(false);
  });
});
