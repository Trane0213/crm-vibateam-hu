import { describe, expect, it } from "vitest";
import { canAcceptQuoteRequest, quoteRequestAcceptPatch } from "./quote-request";

describe("konkrét ajánlatkérés elfogadása", () => {
  it("jelölt, új ügy elfogadható", () => {
    expect(canAcceptQuoteRequest({ quote_requested: true, status: "new", pipeline_entered_at: null })).toBe(true);
  });
  it("általános (nem jelölt) lead nem ugorhatja át a minősítést", () => {
    expect(canAcceptQuoteRequest({ quote_requested: false, status: "new", pipeline_entered_at: null })).toBe(false);
  });
  it("már Pipeline-ban lévő vagy lezárt ügy nem fogadható el újra", () => {
    expect(canAcceptQuoteRequest({ quote_requested: true, status: "quote_prep", pipeline_entered_at: "2026-11-15T10:00:00Z" })).toBe(false);
    expect(canAcceptQuoteRequest({ quote_requested: true, status: "lost", pipeline_entered_at: null })).toBe(false);
  });
  it("elfogadás: Ajánlat előkészítése szakasz + kötelező ajánlat-határidő", () => {
    const p = quoteRequestAcceptPatch({ date: "2026-11-20", time: "10:00", note: "", now: new Date("2026-11-15T09:00:00Z") });
    expect(p?.status).toBe("quote_prep");
    expect(p?.next_step_type).toBe("quote_send");
    expect(p?.next_step_note).toBe("Ajánlat elkészítése");
    expect(p?.pipeline_entered_at).toBe("2026-11-15T09:00:00.000Z");
  });
  it("határidő nélkül nincs elfogadás", () => {
    expect(quoteRequestAcceptPatch({ date: "", time: "10:00", note: "x" })).toBeNull();
  });
});
