import { describe, expect, it } from "vitest";
import { budapestDayBounds, kpiDisplay, summarizeOpenQuotes } from "./owner-kpis";

describe("budapestDayBounds", () => {
  it("téli időben (UTC+1) a budapesti nap 23:00 UTC-kor kezdődik", () => {
    const b = budapestDayBounds(new Date("2026-10-30T13:45:00Z"));
    expect(b.start).toBe("2026-10-29T23:00:00.000Z");
    expect(b.end).toBe("2026-10-30T22:59:59.999Z");
  });
  it("éjfél után 00:30 budapesti idő már a következő nap", () => {
    const b = budapestDayBounds(new Date("2026-10-30T23:30:00Z"));
    expect(b.start).toBe("2026-10-30T23:00:00.000Z");
  });
  it("nyári időben (UTC+2) 22:00 UTC a határ", () => {
    const b = budapestDayBounds(new Date("2026-07-15T10:00:00Z"));
    expect(b.start).toBe("2026-07-14T22:00:00.000Z");
  });
});

describe("summarizeOpenQuotes", () => {
  it("nettó érték a tételekből, a TESZT ajánlat külön jelölve", () => {
    const s = summarizeOpenQuotes(
      [
        { id: "a", title: "TESZT – Sales S2 ajánlat", status: "draft", discount_percent: null, is_current: true },
        { id: "b", title: null, status: "draft", discount_percent: null, is_current: true },
      ],
      [{ quote_id: "a", quantity: 2, unit_price: 100000 }],
    );
    expect(s.count).toBe(2);
    expect(s.net).toBe(200000);
    expect(s.withoutValue).toBe(1);
    expect(s.testCount).toBe(1);
    expect(s.testNet).toBe(200000);
  });
  it("tétel nélkül az érték nincs rögzítve (null), nem 0 Ft", () => {
    const s = summarizeOpenQuotes([{ id: "b", title: null, status: "draft", discount_percent: null, is_current: true }], []);
    expect(s.net).toBeNull();
  });
});

describe("kpiDisplay", () => {
  it("betöltés és hiba nem 0-ként jelenik meg", () => {
    expect(kpiDisplay({ isLoading: true, isError: false })).toBe("…");
    expect(kpiDisplay({ isLoading: false, isError: true })).toBe("hiba");
    expect(kpiDisplay({ isLoading: false, isError: false, data: 0 })).toBe(0);
  });
});
