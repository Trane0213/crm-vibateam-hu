import { describe, expect, it } from "vitest";
import { classifyHeader, extractBudget } from "./budget-extract";
import { WorkbookEvaluator } from "./formula";
import { readWorkbook } from "./workbook";
import { workbook } from "./__fixtures__/workbooks";

const extract = (bytes: Uint8Array) => { const r = readWorkbook(bytes, "t.xlsx"); return extractBudget(r.model, new WorkbookEvaluator(r.model)); };

describe("oszlopszerepek fejlécből", () => {
  it.each([
    ["Anyag egységár", "material_unit"], ["Díj egységre", "labor_unit"], ["Díj", "labor_unit"], ["Σ Díj", "labor_total"], ["Díj összes:", "labor_total"],
    ["Egységár (nettó, Ft)", "unit_price"], ["Összesen (nettó, Ft)", "total"], ["Összes mennyiség", "qty"], ["mennyi-ség", "qty"], ["egségár", "unit_price"],
    ["Munka egységár", "labor_unit"], ["Egys.", "unit"], ["Tétel megnevezése", "name"], ["Leírás", "name"], ["Tervjel", "designation"], ["A+D összesen", "total"],
  ])("%s → %s", (label, role) => expect(classifyHeader(label)).toBe(role));
});

describe("tételsorok felismerése", () => {
  it("fejléc nélküli ME-oszlop, fejezet, részösszeg, 0 mennyiség, opcionális tétel", () => {
    const ex = extract(workbook([["Elektromos", [
      ["S.sz.", "Megnevezés", "Típus", "Mennyiség", null, "Egységár", "Össz díj"],
      [null, "Szerelvények"],
      [1, "Dugaszolóaljzat IP44 1x16A", "TESZT", 20, "db", null, { f: "F3*D3" }],
      [2, "Kapcsoló", "TESZT", 0, "db", null, { f: "F4*D4" }],
      [3, "OPCIONÁLIS! Sínrendszer", "TESZT", 1, "tétel", null, { f: "F5*D5" }],
      [4, "Lámpatest kiállás", "TESZT", 5, "db", null, { f: "F6*D6" }],
      [null, "Összesen", null, null, null, null, { f: "SUM(G3:G6)" }],
    ]]]));
    expect(ex.layouts[0].inferred.join()).toContain("Mértékegység-oszlop fejléc nélkül");
    const by = Object.fromEntries(ex.rows.map((r) => [r.row, r]));
    expect(by[2].kind).toBe("section"); expect(by[3].kind).toBe("item"); expect(by[3].unit).toBe("db");
    expect(by[4].kind).toBe("zero_qty"); expect(by[5].flags).toContain("possible_exclusion"); expect(by[7].kind).toBe("subtotal");
    expect(by[3].priceCells[0]).toMatchObject({ role: "unit_price", state: "empty", address: "F3" });
  });
  it("kétsoros fejléc (csoportcímke + alcímke) és többrészes megnevezés", () => {
    const ex = extract(workbook([["Kábelezés", [
      ["Sorszám", "Megnevezés", null, null, "Mennyiség", null, null, "Anyagár", null, "Munkadíj (nettó)", null],
      [null, "Hely", "Funkció", "Típus", "db/klt", "szum", "egység", "/egység", "Szum", "/egység", "Szum"],
      [1, "Főépület", "Betáp kábel", "NYY-J 5x25", 2, { f: "E3" }, "fm", 0, { f: "F3*H3" }, 1600, { f: "F3*J3" }],
    ]]]));
    const l = ex.layouts[0];
    expect(l.headerRows).toEqual([1, 2]);
    expect(l.columns).toMatchObject({ qty: 6, unit: 7, material_unit: 8, material_total: 9, labor_unit: 10, labor_total: 11 });
    expect(l.columns.name).toEqual([2, 3, 4]);
    expect(ex.rows.find((r) => r.row === 3)?.qty).toBe(2);
  });
  it("fejléchez képest felcserélt mennyiség/ME oszlopot az értékek alapján jelölten javít", () => {
    const rows: (string | number)[][] = [["Ssz.", "Tétel megnevezése", "Mennyiség", "Egység", "Munka egységár", "Munka összesen"]];
    for (let i = 0; i < 5; i++) rows.push([i + 1, `Kábel ${i}`, "fm", 100 + i, 0, 0]);
    const ex = extract(workbook([["K", rows]]));
    expect(ex.layouts[0].columns).toMatchObject({ qty: 4, unit: 3 });
    expect(ex.layouts[0].inferred.join()).toContain("felcserélve");
    expect(ex.rows[0].qty).toBe(100);
  });
  it("„M | E” rövid fejléc mennyiség/egység párként", () => {
    const ex = extract(workbook([["L", [["No.", "Tétel megnevezés", "M", "E", "Anyag egységár", "Díj egységre"], ["1.1", "YSLY-Jz 3x1,5 mm2", 1730, "m", 0, 0]]]]));
    expect(ex.layouts[0].columns).toMatchObject({ qty: 3, unit: 4, material_unit: 5, labor_unit: 6 });
  });
  it("több egységár-oszlop: bizonytalan, nem csendes", () => {
    const ex = extract(workbook([["X", [["Megnevezés", "Mennyiség", "ME", "Egységár", "Egységár"], ["A", 1, "db", null, null]]]]));
    expect(ex.layouts[0].ambiguous.length).toBeGreaterThan(0);
  });
  it("összesítő/borító lap kimarad indoklással", () => {
    const ex = extract(workbook([["Főösszesítő", [["Munkanem megnevezése", "Anyag", "Díj"], ["Villamos", 0, 0]]]]));
    expect(ex.layouts).toHaveLength(0); expect(ex.skippedSheets[0].reason).toMatch(/Nem található/);
  });
});
