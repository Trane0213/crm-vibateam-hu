import { describe, expect, it } from "vitest";
import { addPct, grossUpMargin, lineTotal, roundToStep, toBp, toFiller } from "./money";

describe("pénzaritmetika (fillér, bázispont)", () => {
  it("lebegőpontos zaj nélkül", () => { expect(toFiller(0.1 + 0.2)).toBe(30); expect(toFiller(1740)).toBe(174000); });
  it("tartalék: 1000 Ft + 5% = 1050 Ft", () => { expect(addPct(100000, toBp(5))).toBe(105000); });
  it("célfedezet: 1050 Ft / (1 − 15%) = 1235,29 Ft", () => { expect(grossUpMargin(105000, toBp(15))).toBe(123529); });
  it("100% vagy több célfedezet nem értelmezhető", () => { expect(() => grossUpMargin(100, 10000)).toThrow(); });
  it("kerekítés 10 Ft-ra félértéktől felfelé; felfelé és lefelé", () => {
    expect(roundToStep(123529, 10)).toBe(124000); expect(roundToStep(123499, 10)).toBe(123000);
    expect(roundToStep(123001, 10, "up")).toBe(124000); expect(roundToStep(123999, 10, "down")).toBe(123000);
  });
  it("sorösszeg: 1950 Ft × 44 db = 85 800 Ft; tört mennyiség fillérre", () => { expect(lineTotal(195000, 44)).toBe(8580000); expect(lineTotal(46400, 1.5)).toBe(69600); });
});
