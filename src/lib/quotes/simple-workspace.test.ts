import { describe, expect, it } from "vitest";
import { parseQuoteView, simpleQuoteState, timothyQuickCommands } from "./simple-workspace";

const base = { kind: "received_budget", title: "Sopron út 66.", status: "draft", locked: false, dirty: false, net: null, itemCount: 0, docCount: 0 };

describe("egyszerűsített ajánlat: következő teendő", () => {
  it("kapott költségvetés dokumentum nélkül → feltöltés (1. lépés)", () => {
    const s = simpleQuoteState(base);
    expect([s.step, s.next.action]).toEqual([1, "documents"]);
  });
  it("dokumentum van, nettó nincs → Timothy (2. lépés)", () => {
    const s = simpleQuoteState({ ...base, docCount: 2 });
    expect([s.step, s.next.action]).toEqual([2, "timothy"]);
  });
  it("nettó megvan → ellenőrzés (3. lépés), nem kész", () => {
    const s = simpleQuoteState({ ...base, docCount: 2, net: 1_000_000 });
    expect([s.step, s.next.action, s.done]).toEqual([3, "review", false]);
  });
  it("saját ajánlat tétel nélkül → Timothy, dokumentum nem kötelező", () => {
    expect(simpleQuoteState({ ...base, kind: "viba_offer" }).next.action).toBe("timothy");
    expect(simpleQuoteState({ ...base, kind: "viba_offer", itemCount: 3 }).next.action).toBe("review");
  });
  it("nem mentett módosítás mindig mentést kér először", () => {
    expect(simpleQuoteState({ ...base, docCount: 2, net: 5, dirty: true }).next.action).toBe("save");
  });
  it("cím nélkül alapadatot kér", () => {
    expect(simpleQuoteState({ ...base, title: " " }).next.action).toBe("basics");
  });
  it("kiküldött, zárolt vagy lezárt ajánlat → utánkövetés, nem kínál újraküldést", () => {
    for (const p of [{ status: "sent" }, { locked: true }, { status: "accepted" }, { status: "negotiation" }]) {
      const s = simpleQuoteState({ ...base, docCount: 1, net: 5, ...p });
      expect([s.next.action, s.done]).toEqual(["followup", true]);
    }
  });
  it("Timothy-parancs a kapott költségvetésnél tartalmazza az erősáram-szűkítést", () => {
    expect(timothyQuickCommands("received_budget")[0]).toContain("csak az erősáramot");
    expect(timothyQuickCommands("viba_offer")[0]).toContain("jóváhagyott díjtörzs");
  });
  it("nézetparaméter csak az 'egyszeru' értéket fogadja el", () => {
    expect(parseQuoteView("egyszeru")).toBe("egyszeru");
    expect(parseQuoteView("x")).toBeUndefined();
  });
});
