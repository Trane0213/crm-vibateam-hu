import { describe, expect, it } from "vitest";
import { filterQuoteRows, summarizeActiveQuotes } from "./quote-list";

const q = (id: string, lead: string | null, status: string, net: number | null, is_current = true) =>
  ({ id, lead_id: lead, project_id: null, status, is_current, net });

describe("ajánlatriport (S7)", () => {
  it("egy ügy alternatívái nem adódnak össze, csak a legnagyobb számít", () => {
    const s = summarizeActiveQuotes([q("a", "L1", "sent", 1_000_000), q("b", "L1", "sent", 400_000)]);
    expect(s.net).toBe(1_000_000);
    expect(s.deals).toBe(1);
  });
  it("régi verzió és lezárt ajánlat nem aktív érték", () => {
    const s = summarizeActiveQuotes([q("a", "L1", "sent", 500, false), q("b", "L2", "accepted", 900), q("c", "L3", "rejected", 900)]);
    expect(s.net).toBeNull();
    expect(s.activeCount).toBe(0);
  });
  it("hiányzó összeg külön számít, nem 0 Ft", () => {
    const s = summarizeActiveQuotes([q("a", "L1", "draft", null), q("b", "L2", "sent", 200_000)]);
    expect(s.withoutValue).toBe(1);
    expect(s.net).toBe(200_000);
  });
  it("lista szűrés állapotra és keresésre", () => {
    const rows = [{ status: "sent", is_current: true, searchText: "TESZT Kft" }, { status: "draft", is_current: true, searchText: "Másik" }];
    expect(filterQuoteRows(rows, { search: "teszt", status: "all", currentOnly: true })).toHaveLength(1);
    expect(filterQuoteRows(rows, { search: "", status: "draft", currentOnly: true })).toHaveLength(1);
  });
});
