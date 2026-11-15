import { describe, it, expect } from "vitest";
import { splitQuotes, quoteTab, quoteWsStatus } from "./quotes-view";

describe("ajánlatok szétválasztása", () => {
  it("a kapott Excel és a saját VIBA-ajánlat külön listába kerül, régi verzió nem látszik", () => {
    const r = splitQuotes([
      { id: "a", quote_kind: "received_budget", is_current: true },
      { id: "b", quote_kind: "viba_offer", is_current: true },
      { id: "c", quote_kind: "viba_offer", is_current: false },
      { id: "d", quote_kind: null, is_current: true },
    ]);
    expect(r.received_budget.map((x) => x.id)).toEqual(["a"]);
    expect(r.viba_offer.map((x) => x.id)).toEqual(["b"]);
    expect(r.none.map((x) => x.id)).toEqual(["d"]);
  });
  it("ismeretlen típus nem kerül egyik munkafolyamatba sem", () => {
    expect(quoteTab("valami")).toBe("none");
  });
  it("ár nélküli piszkozat hiányzó adat, kiküldött válaszra vár", () => {
    expect(quoteWsStatus("draft", null)).toBe("missing");
    expect(quoteWsStatus("sent", 100)).toBe("approval");
    expect(quoteWsStatus("accepted", 100)).toBe("done");
  });
});
