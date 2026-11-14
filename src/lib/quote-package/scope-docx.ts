/**
 * P5 — ügyfélnek szánt műszaki lehatárolás Word (DOCX) formában. Determinisztikus: ugyanaz a tartalom bájtra azonos
 * fájlt ad (rögzített ZIP-dátum), így a mentett példány tartalma SHA-256-tal visszaellenőrizhető. Belső ár-, forrás-
 * vagy kalkulációs adat nem kerül bele (a hívó a szöveget az `internalLeaks` kapuval ellenőrzi).
 */
import { strToU8, zipSync } from "fflate";
import { SCOPE_SECTION_LABEL, type ScopeSections } from "./package-model";

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const run = (t: string, o: { b?: boolean; sz?: number; color?: string } = {}) =>
  `<w:r><w:rPr>${o.b ? "<w:b/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ""}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (t: string, o: { b?: boolean; sz?: number; color?: string; after?: number; indent?: boolean } = {}) =>
  `<w:p><w:pPr><w:spacing w:after="${o.after ?? 120}"/>${o.indent ? `<w:ind w:left="360" w:hanging="360"/>` : ""}</w:pPr>${run(t, o)}</w:p>`;

export type ScopeDocMeta = { quoteTitle: string; version: number | null; alternativeKey: string; customer: string | null; asOf: string; budgetFile: string | null };
export const scopeFileName = (m: Pick<ScopeDocMeta, "version" | "alternativeKey">) => `VIBA_lehatarolas_v${m.version ?? 1}${m.alternativeKey && m.alternativeKey !== "A" ? `_${m.alternativeKey}` : ""}_TERVEZET.docx`;

export function buildScopeDocx(m: ScopeDocMeta, s: ScopeSections): Uint8Array {
  const body: string[] = [
    para("TERVEZET — belső jóváhagyás után küldhető", { b: true, color: "B42318", sz: 18 }),
    para("Műszaki lehatárolás", { b: true, sz: 32, after: 60 }),
    para(`${m.quoteTitle} — v${m.version ?? 1}${m.alternativeKey && m.alternativeKey !== "A" ? ` / ${m.alternativeKey} alternatíva` : ""}`, { b: true, sz: 24 }),
    ...(m.customer ? [para(`Megrendelő: ${m.customer}`)] : []),
    ...(m.budgetFile ? [para(`Alapja: „${m.budgetFile}” költségvetés és a megküldött tervdokumentáció`)] : []),
    para(`Állapot: ${m.asOf}`, { after: 240 }),
  ];
  for (const k of Object.keys(SCOPE_SECTION_LABEL) as (keyof ScopeSections)[]) {
    body.push(para(SCOPE_SECTION_LABEL[k], { b: true, sz: 26, after: 80 }));
    if (!s[k].length) body.push(para("Nincs.", { indent: true }));
    s[k].forEach((x, n) => body.push(para(`${k === "questions" ? `${n + 1}.` : "–"} ${x.text}`, { indent: true, after: 60 })));
    body.push(para("", { after: 120 }));
  }
  body.push(para("A lehatárolás az ajánlat elválaszthatatlan része. Az itt nem szereplő munkarészek nem képezik az ajánlat tárgyát.", { sz: 18 }));
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    "word/document.xml": strToU8(doc),
  };
  return zipSync(files, { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
}
