import { describe, expect, it } from "vitest";
import { quoteNextStep, QUOTE_STEPS } from "./quote-steps";

const base = { kind: "received_budget", status: "draft", locked: false, dirty: false, contactId: "c1", net: 1000, itemCount: 0, docCount: 2, pricedDocCount: 1, sentOfferDocCount: 0 };
describe("ajánlatkészítő négy lépése", () => {
  it("pontosan négy lépés, a kért sorrendben", () => {
    expect(QUOTE_STEPS.map((s) => s.label)).toEqual(["Ügyfél és dokumentumok", "Árazás", "Ügyfélnek szóló ajánlat", "Kiküldés és utánkövetés"]);
  });
  it("kiküldött ajánlat: csak utánkövetés", () => {
    expect(quoteNextStep({ ...base, locked: true }).step).toBe("send");
  });
  it("kapcsolattartó nélkül az 1. lépés a teendő", () => {
    expect(quoteNextStep({ ...base, contactId: null }).step).toBe("customer");
  });
  it("0 Ft-os kapott költségvetés nem kész: az árazás a teendő", () => {
    expect(quoteNextStep({ ...base, net: 0 }).step).toBe("pricing");
  });
  it("árazott Excel mentése nélkül nem küldhető tovább", () => {
    expect(quoteNextStep({ ...base, pricedDocCount: 0 }).step).toBe("offer");
  });
  it("saját ajánlat tételek nélkül az árazásnál tart", () => {
    expect(quoteNextStep({ ...base, kind: "viba_offer", itemCount: 0 }).step).toBe("pricing");
  });
  it("minden megvan → kiküldés", () => {
    expect(quoteNextStep(base).step).toBe("send");
  });
});
