import { unzipSync } from "fflate";
import { parse } from "node-html-parser";
import { safeMailText } from "./gmail-context";

export const DOCUMENT_LIMITS = { bytes: 5 * 1024 * 1024, expandedBytes: 20 * 1024 * 1024, zipEntries: 2000, units: 10000, text: 6000, pdfPages: 300 };
export type ExtractedDocument = { status: string; units: { label: string; text: string | null; status: string }[]; total_units: number; next_unit: number | null; next_text_offset: number | null; parser: string; limitations: string[] };
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Check ZIP directory sizes before inflation, rejecting zip bombs and encryption. */
export function checkedOfficeZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let directory = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { directory = i; break; }
  }
  if (directory < 0) throw new Error("Érvénytelen Office ZIP.");
  const entries = view.getUint16(directory + 10, true);
  if (entries > DOCUMENT_LIMITS.zipEntries || view.getUint16(directory + 4, true) !== 0 || view.getUint16(directory + 6, true) !== 0) throw new Error("ZIP-korlát vagy többkötetes fájl.");
  let at = view.getUint32(directory + 16, true), expanded = 0;
  const names: string[] = [];
  for (let i = 0; i < entries; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error("Érvénytelen ZIP-jegyzék.");
    if (view.getUint16(at + 8, true) & 1) throw new Error("Titkosított dokumentum nem olvasható.");
    expanded += view.getUint32(at + 24, true);
    if (expanded > DOCUMENT_LIMITS.expandedBytes) throw new Error("A kibontott dokumentum túl nagy.");
    const len = view.getUint16(at + 28, true);
    names.push(decoder.decode(bytes.slice(at + 46, at + 46 + len)));
    at += 46 + len + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  if (names.some((n) => n.includes("..") || /vbaProject|embeddings\/|externalLinks\//i.test(n))) throw new Error("Beágyazott/aktív/külső tartalmú dokumentum nem támogatott.");
  return names;
}

function textPage(text: string, label: string, total: number, unit: number, offset: number, parser: string, limitations: string[]): ExtractedDocument {
  const safe = safeMailText(text, offset, DOCUMENT_LIMITS.text);
  const nextUnit = safe.next_offset == null && unit + 1 < total ? unit + 1 : null;
  return { status: safe.status === "sensitive_withheld" ? "sensitive_withheld" : safe.next_offset != null || nextUnit != null || unit > 0 || offset > 0 ? "partial" : safe.status === "missing" ? "no_extractable_text" : "extracted",
    units: [{ label, text: safe.text, status: safe.status }], total_units: total, next_unit: nextUnit, next_text_offset: safe.next_offset, parser, limitations };
}

export async function extractDocument(bytes: Uint8Array, name: string, unit = 0, textOffset = 0): Promise<ExtractedDocument> {
  if (bytes.length > DOCUMENT_LIMITS.bytes) throw new Error("A fájl nagyfeldolgozást igényel; az olvasási korlát 5 MB.");
  if (!Number.isSafeInteger(unit) || unit < 0 || !Number.isSafeInteger(textOffset) || textOffset < 0) throw new Error("Érvénytelen tartalomlapozás.");
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") {
    if (!decoder.decode(bytes.slice(0, 5)).startsWith("%PDF-")) throw new Error("Nem PDF-tartalom.");
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes.slice(), { isEvalSupported: false, useSystemFonts: false, maxImageSize: 0, isOffscreenCanvasSupported: false, isImageDecoderSupported: false, disableFontFace: true });
    try {
      if (pdf.numPages > DOCUMENT_LIMITS.pdfPages) throw new Error("A PDF külön nagyfeldolgozást igényel (300 oldal felett).");
      if (unit >= pdf.numPages) throw new Error("Nincs ilyen PDF-oldal.");
      const page = await pdf.getPage(unit + 1);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
      return textPage(text, `PDF ${unit + 1}. oldal`, pdf.numPages, unit, textOffset, "unpdf@2.1.0 (serverless PDF.js)", ["Csak szövegréteg, nem OCR; üres/szkennelt oldalnál nincs teljes ellenőrzés.", "Táblázat koordináták és képek nem értelmezettek."]);
    } finally { await pdf.destroy(); }
  }
  if (ext === "docx") {
    checkedOfficeZip(bytes);
    const zip = unzipSync(bytes, { filter: (file) => file.name === "word/document.xml" });
    const xml = zip["word/document.xml"];
    if (!xml) throw new Error("Hiányzó Word dokumentumtörzs.");
    const root = parse(decoder.decode(xml));
    const text = root.querySelectorAll("w:p").map((p) => p.querySelectorAll("w:t").map((t) => t.textContent).join("")).join("\n");
    if (unit !== 0) throw new Error("A Word dokumentum egy szövegegység.");
    return textPage(text, "Word dokumentumtörzs", 1, unit, textOffset, "fflate@0.8.3 + XML text", ["Fejléc/lábléc/megjegyzés/kép/rajz és követett módosítás nem teljes körűen értelmezett; nem teljes Word-audit."]);
  }
  if (ext === "xlsx") {
    checkedOfficeZip(bytes);
    const XLSX = await import("xlsx");
    const book = XLSX.read(bytes, { type: "array", cellFormula: true, cellHTML: false, cellText: false, sheetRows: DOCUMENT_LIMITS.units + 1 });
    const sheetName = book.SheetNames[unit];
    if (!sheetName) throw new Error("Nincs ilyen munkalap.");
    const sheet = book.Sheets[sheetName];
    if (!sheet) throw new Error("Hiányzó munkalap.");
    const ref = sheet["!fullref"] ?? sheet["!ref"];
    if (!ref) return textPage("", sheetName, book.SheetNames.length, unit, textOffset, "xlsx@0.18.5", ["Üres munkalap."]);
    const range = XLSX.utils.decode_range(ref);
    if (range.e.r - range.s.r + 1 > DOCUMENT_LIMITS.units || range.e.c > 199) throw new Error("A munkalap külön nagyfeldolgozást igényel.");
    const rows: string[] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cells: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const address = XLSX.utils.encode_cell({ r, c }), cell = sheet[address];
        if (cell) cells.push(`${address}=${cell.v ?? "[nincs mentett érték]"}${cell.f ? " [képlet mentett eredménye, nem újraszámított]" : ""}`);
      }
      rows.push(cells.join(" | "));
    }
    return textPage(rows.join("\n"), `Munkalap: ${sheetName}`, book.SheetNames.length, unit, textOffset, "xlsx@0.18.5", ["Mentett cellaértékek, képletek nem futnak; külső hivatkozás/makró nem támogatott.", "Formázás, rejtett tartalom jelentése, rajzok és Excel számításfrissessége nem ellenőrzött."]);
  }
  if (ext === "txt" || ext === "csv") {
    if (unit !== 0) throw new Error("A szövegfájl egy szövegegység.");
    return textPage(decoder.decode(bytes), ext.toUpperCase(), 1, unit, textOffset, "UTF-8 TextDecoder", ["Csak UTF-8 szöveg; CSV tartalom szövegként, képletek végrehajtása nélkül."]);
  }
  return { status: "unsupported", units: [], total_units: 0, next_unit: null, next_text_offset: null, parser: "none", limitations: ["Csak PDF, XLSX, DOCX, TXT és CSV támogatott; OCR és régi DOC/XLS nem része ennek a szakasznak."] };
}