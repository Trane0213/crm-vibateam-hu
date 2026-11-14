import { describe, expect, it } from "vitest";
import { parseFormula, WorkbookEvaluator, type CellModel, type SheetModel, type WorkbookModel } from "./formula";

function model(sheets: Record<string, Record<string, CellModel>>): WorkbookModel {
  const out: SheetModel[] = Object.entries(sheets).map(([name, cells]) => ({ name, hidden: false, cells: new Map(Object.entries(cells)), hiddenRows: new Set(), maxRow: 100, maxCol: 20 }));
  return { sheets: out, names: new Map() };
}
const ev = (m: WorkbookModel, s: string, a: string) => new WorkbookEvaluator(m).value(m.sheets.find((x) => x.name === s)!, a);

describe("képletkiértékelő (valódi újraszámolás)", () => {
  it("műveleti sorrend, százalék, unáris mínusz", () => {
    const m = model({ S: { A1: { v: null, f: "2+3*4^2" }, A2: { v: null, f: "-2^2" }, A3: { v: null, f: "50%*200" } } });
    expect(ev(m, "S", "A1")).toBe(50); expect(ev(m, "S", "A2")).toBe(4); expect(ev(m, "S", "A3")).toBe(100);
  });
  it("SUM tartományban a szöveget kihagyja, SUBTOTAL a beágyazott SUBTOTAL-t is", () => {
    const m = model({ S: { A1: { v: 10 }, A2: { v: "x" }, A3: { v: null, f: "SUBTOTAL(9,A1:A2)" }, A4: { v: 5 }, A5: { v: null, f: "SUBTOTAL(9,A1:A4)" }, A6: { v: null, f: "SUM(A1:A4)" } } });
    expect(ev(m, "S", "A5")).toBe(15); expect(ev(m, "S", "A6")).toBe(25);
  });
  it("ROUNDUP a lebegőpontos zajt az Excel 15 jegyű pontosságával kezeli", () => {
    const m = model({ S: { G6: { v: 39525.200000000004 }, E6: { v: 39 }, H6: { v: null, f: "IF(E6=0,\"\",ROUNDUP(G6*$E6,0))" }, B1: { v: null, f: "ROUNDUP(0.1*3,1)" } } });
    expect(ev(m, "S", "H6")).toBe(1541483); expect(ev(m, "S", "B1")).toBe(0.3);
  });
  it("üres záró argumentum: ROUND(x,) = 0 tizedes", () => { const m = model({ S: { A1: { v: 2.5 }, B1: { v: null, f: "ROUND(A1*3,)" } } }); expect(ev(m, "S", "B1")).toBe(8); });
  it("IF szöveget ad vissza, lapközi idézett hivatkozás", () => {
    const m = model({ "2.2 Lakás": { H49: { v: 7 }, E5: { v: 0 }, H5: { v: null, f: 'IF(E5>0,1," ")' } }, Össz: { E20: { v: null, f: "'2.2 Lakás'!H49*2" } } });
    expect(ev(m, "2.2 Lakás", "H5")).toBe(" "); expect(ev(m, "Össz", "E20")).toBe(14);
  });
  it("körkörös hivatkozás és ismeretlen függvény jelölt hiba, nem találgatás", () => {
    const m = model({ S: { A1: { v: null, f: "B1+1" }, B1: { v: null, f: "A1+1" }, C1: { v: null, f: "COUNTIFS(A1:A2,1)" } } });
    const e = new WorkbookEvaluator(m), s = m.sheets[0];
    expect(e.value(s, "A1")).toEqual({ error: "#CYCLE" });
    expect(e.value(s, "C1")).toEqual({ error: "#UNSUPPORTED:COUNTIFS" });
    expect(e.stats.unsupported.get("COUNTIFS")).toBe(1);
  });
  it("0-val osztás #DIV/0!", () => { const m = model({ S: { A1: { v: null, f: "1/0" } } }); expect(ev(m, "S", "A1")).toEqual({ error: "#DIV/0!" }); });
  it("szintaktikailag hibás képlet nem fut", () => { expect(() => parseFormula("SUM(A1")).toThrow(); });
});
