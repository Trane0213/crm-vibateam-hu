import { describe, expect, it } from "vitest";
import { extractVbfDefects } from "./vbf-extract";

const SAMPLE = `TESZT VBF jegyzőkönyv – Minta társasház
Megállapítások:
1. A pinceelosztóban hiányzik a védővezető bekötése, áramütés veszélye, azonnali javítás szükséges.
2. Lépcsőházi lámpatest burkolata sérült,
   cseréje javasolt a következő felülvizsgálatig.
3. A mérőhelyi elosztó feliratozása hiányos.
4. Megjegyzés: a felülvizsgálat időpontja 2026.10.20.
- EPH csomópont kötése laza, MSZ HD 60364-5-54 szerint utánhúzandó
`;

describe("P6 VBF hibapont-kinyerés", () => {
  it("számozott és felsorolt hibapontok, sorszám-bizonyítékkal, többsoros folytatással", () => {
    const r = extractVbfDefects(SAMPLE);
    expect(r.defects.map((d) => d.ref)).toEqual(["1", "2", "3", "•1"]);
    expect(r.defects[1]!.text).toMatch(/sérült, cseréje javasolt/);
    expect(r.defects[1]!.lines).toEqual([4, 5]);
    expect(r.defects[0]!.evidence).toBe("3. sor");
  });
  it("nem hibapont (megjegyzés dátummal) kimarad", () => {
    expect(extractVbfDefects(SAMPLE).defects.some((d) => /időpontja/.test(d.text))).toBe(false);
  });
  it("sürgősség kulcsszó szerint, indoklással; egyébként besorolandó", () => {
    const d = extractVbfDefects(SAMPLE).defects;
    expect(d[0]).toMatchObject({ priority: "urgent" });
    expect(d[0]!.priorityReason).toMatch(/áramütés|azonnal/);
    expect(d[1]!.priority).toBe("scheduled");
    expect(d[2]!.priority).toBe("unknown");
  });
  it("szabványhivatkozás kinyerése", () => {
    expect(extractVbfDefects(SAMPLE).defects[3]!.standards[0]).toMatch(/MSZ HD 60364-5-54/);
  });
  it("üres/szkennelt szöveg: nincs kitalált hibapont, magyarázó megjegyzés", () => {
    const r = extractVbfDefects("   \n\n");
    expect(r.defects).toHaveLength(0);
    expect(r.notes[0]).toMatch(/kézzel kell rögzíteni/);
  });
  it("azonos hibapont csak egyszer; determinisztikus", () => {
    const t = "1. Hiányzik a földelés\n\n2. Hiányzik a földelés\n";
    expect(extractVbfDefects(t).defects).toHaveLength(1);
    expect(JSON.stringify(extractVbfDefects(SAMPLE))).toBe(JSON.stringify(extractVbfDefects(SAMPLE)));
  });
});
