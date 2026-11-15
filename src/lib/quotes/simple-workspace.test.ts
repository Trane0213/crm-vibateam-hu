import { describe, expect, it } from "vitest";
import { parseQuoteView, timothyQuickCommands } from "./simple-workspace";

describe("ajánlat: Timothy-gyorsparancsok", () => {
  it("Timothy-parancs a kapott költségvetésnél tartalmazza az erősáram-szűkítést", () => {
    expect(timothyQuickCommands("received_budget")[0]).toContain("csak az erősáramot");
    expect(timothyQuickCommands("viba_offer")[0]).toContain("jóváhagyott díjtörzs");
  });
  it("az ügyfélnek szóló lépésben a kísérőlevél csak tervezet", () => {
    expect(timothyQuickCommands("received_budget", "offer").join(" ")).toContain("nem küldöd el");
  });
  it("nézetparaméter csak az 'egyszeru' értéket fogadja el", () => {
    expect(parseQuoteView("egyszeru")).toBe("egyszeru");
    expect(parseQuoteView("x")).toBeUndefined();
  });
});
