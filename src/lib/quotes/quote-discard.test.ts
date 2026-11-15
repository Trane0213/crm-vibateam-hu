import { describe, expect, it } from "vitest";
import { quoteDiscardOptions } from "./quote-status";

describe("ajánlat törlése / visszavonása kiküldés előtt", () => {
  it("ki nem küldött piszkozat törölhető és visszavonható", () => {
    expect(quoteDiscardOptions({ status: "draft", sent_at: null, locked_at: null })).toEqual({ canWithdraw: true, canDelete: true });
    expect(quoteDiscardOptions({ status: "ready" })).toEqual({ canWithdraw: true, canDelete: true });
  });
  it("kiküldött vagy zárolt ajánlat sem nem törölhető, sem itt nem vonható vissza", () => {
    expect(quoteDiscardOptions({ status: "sent", sent_at: "2026-11-15T10:00:00Z", locked_at: "2026-11-15T10:00:00Z" })).toEqual({ canWithdraw: false, canDelete: false });
    expect(quoteDiscardOptions({ status: "draft", sent_at: null, locked_at: "2026-11-15T10:00:00Z" })).toEqual({ canWithdraw: false, canDelete: false });
  });
  it("visszavont, ki nem küldött ajánlat még törölhető, de újra nem vonható vissza", () => {
    expect(quoteDiscardOptions({ status: "withdrawn", sent_at: null })).toEqual({ canWithdraw: false, canDelete: true });
  });
});
