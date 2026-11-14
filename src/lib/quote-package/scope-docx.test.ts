import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { buildScopeDocx, scopeFileName } from "./scope-docx";

const scope = { included: [{ text: "Erősáramú szerelés <A&B>", ref: null }], excluded: [{ text: "Anyagok beszerzése", ref: null }], conditional: [], questions: [{ text: "Melyik revízió érvényes?", ref: null }] };
const meta = { quoteTitle: "TESZT csarnok", version: 3, alternativeKey: "B", customer: null, asOf: "2026-11-15", budgetFile: "TESZT.xlsx" };

describe("P5 lehatárolási Word-dokumentum", () => {
  it("érvényes DOCX csomag, TERVEZET jelöléssel, négy fejezettel, XML-escapinggel", () => {
    const z = unzipSync(buildScopeDocx(meta, scope));
    expect(Object.keys(z).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
    const xml = strFromU8(z["word/document.xml"]!);
    expect(xml).toContain("TERVEZET");
    for (const h of ["Vállalt munkarészek", "Nem vállalt munkarészek", "Feltételek és fenntartások", "Tisztázandó kérdések"]) expect(xml).toContain(h);
    expect(xml).toContain("Erősáramú szerelés &lt;A&amp;B&gt;");
    expect(xml).toContain("1. Melyik revízió érvényes?");
    expect(xml).toContain("Nincs.");
  });
  it("determinisztikus: azonos tartalom bájtra azonos fájl (mentett példány SHA-256-tal ellenőrizhető)", () => {
    expect(buildScopeDocx(meta, scope)).toEqual(buildScopeDocx(meta, scope));
    expect(buildScopeDocx(meta, { ...scope, excluded: [] })).not.toEqual(buildScopeDocx(meta, scope));
  });
  it("fájlnév verzióval és alternatívával", () => {
    expect(scopeFileName(meta)).toBe("VIBA_lehatarolas_v3_B_TERVEZET.docx");
    expect(scopeFileName({ version: 1, alternativeKey: "A" })).toBe("VIBA_lehatarolas_v1_TERVEZET.docx");
  });
});
