/**
 * P3 — szerkezettartó XLSX-kimenet: az eredeti ZIP-részek bájtra változatlanok maradnak,
 * kivéve az érintett munkalapok kijelölt celláit és a workbook újraszámolási jelzőjét.
 * Nem ír új lapot, megjegyzést, rejtett adatot vagy metaadatot (belső kalkuláció nem szivárog).
 */
import { unzipSync, zipSync } from "fflate";
import { splitAddr, numToCol } from "./formula";

export type CellPatch = { sheet: string; address: string; kind: "value" | "cached"; value: number | string };
export const PATCH_LIMITS = { expandedBytes: 80 * 1024 * 1024, entries: 5000 };

const dec = new TextDecoder("utf-8"), enc = new TextEncoder();
const xmlUnescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const numText = (v: number) => { if (!Number.isFinite(v)) throw new Error("Nem véges szám nem írható."); return String(Number(v.toPrecision(15))); };

function sheetParts(files: Record<string, Uint8Array>): Map<string, string> {
  const wb = dec.decode(files["xl/workbook.xml"] ?? new Uint8Array());
  const rels = dec.decode(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  if (!wb || !rels) throw new Error("Hiányzó munkafüzet-szerkezet (workbook.xml).");
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1], target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) relMap.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace(/xl\/\.\.\//, ""));
  }
  const out = new Map<string, string>();
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1], rid = /\br:id="([^"]+)"|\b\w+:id="([^"]+)"/.exec(m[0]);
    const id = rid?.[1] ?? rid?.[2];
    if (name != null && id && relMap.has(id)) out.set(xmlUnescape(name), relMap.get(id)!);
  }
  return out;
}

function cellRe(a: string) { return new RegExp(`<(\\w+:)?c\\b(?=[^>]*\\sr="${esc(a)}")[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?c>)`); }

function attrs(startTag: string) { return startTag.replace(/^<(\w+:)?c\b/, "").replace(/\/?>$/, ""); }

function styleAbove(xml: string, col: string, row: number): string {
  for (let r = row - 1; r >= Math.max(1, row - 30); r--) { const m = cellRe(`${col}${r}`).exec(xml); const s = m && /\ss="(\d+)"/.exec(m[0].slice(0, m[0].indexOf(">") + 1)); if (s) return ` s="${s[1]}"`; }
  return "";
}

export function patchCell(xml: string, p: Omit<CellPatch, "sheet">): string {
  const { col, row } = splitAddr(p.address); const colL = numToCol(col);
  const m = cellRe(p.address).exec(xml);
  if (p.kind === "cached") {
    if (!m) throw new Error(`Képletcella nem található: ${p.address}`);
    const pre = m[1] ?? "", whole = m[0], tagEnd = whole.indexOf(">") + 1, start = whole.slice(0, tagEnd);
    if (!/<(\w+:)?f\b/.test(whole)) throw new Error(`Nem képletcella: ${p.address}`);
    const isStr = typeof p.value === "string";
    const newStart = start.replace(/\st="[^"]*"/, "").replace(/(\/?>)$/, isStr ? ` t="str"$1` : "$1").replace(/\/>$/, ">");
    let body = whole.endsWith("/>") ? "" : whole.slice(tagEnd, whole.lastIndexOf("<"));
    const v = `<${pre}v>${isStr ? xmlEscape(String(p.value)) : numText(Number(p.value))}</${pre}v>`;
    if (/<(\w+:)?v\b[^>]*\/>|<(\w+:)?v\b[^>]*>[\s\S]*?<\/(\w+:)?v>/.test(body)) body = body.replace(/<(\w+:)?v\b[^>]*\/>|<(\w+:)?v\b[^>]*>[\s\S]*?<\/(\w+:)?v>/, v);
    else body = body.replace(/(<(\w+:)?f\b[^>]*\/>|<(\w+:)?f\b[^>]*>[\s\S]*?<\/(\w+:)?f>)/, `$1${v}`);
    return xml.slice(0, m.index) + `${newStart}${body}</${pre}c>` + xml.slice(m.index + whole.length);
  }
  if (typeof p.value !== "number") throw new Error("Árcellába csak szám írható.");
  const v = numText(p.value);
  if (m) {
    const pre = m[1] ?? "", whole = m[0];
    if (/<(\w+:)?f\b/.test(whole)) throw new Error(`Képletcella nem írható felül: ${p.address}`);
    const a = attrs(whole.slice(0, whole.indexOf(">") + 1)).replace(/\st="[^"]*"/, "");
    return xml.slice(0, m.index) + `<${pre}c${a}><${pre}v>${v}</${pre}v></${pre}c>` + xml.slice(m.index + whole.length);
  }
  const rowRe = new RegExp(`<(\\w+:)?row\\b(?=[^>]*\\sr="${row}")[^>]*?(?:/>|>[\\s\\S]*?</(?:\\w+:)?row>)`);
  const rm = rowRe.exec(xml);
  const pre = rm?.[1] ?? (/<(\w+:)sheetData\b/.exec(xml)?.[1] ?? "");
  const cell = `<${pre}c r="${p.address}"${styleAbove(xml, colL, row)}><${pre}v>${v}</${pre}v></${pre}c>`;
  if (rm) {
    const whole = rm[0];
    if (whole.endsWith("/>")) return xml.slice(0, rm.index) + `${whole.slice(0, -2)}>${cell}</${pre}row>` + xml.slice(rm.index + whole.length);
    const open = whole.indexOf(">") + 1; let insertAt = whole.lastIndexOf("<");
    for (const cm of whole.slice(open).matchAll(/<(?:\w+:)?c\b[^>]*\sr="([A-Z]+)\d+"/g)) { if (splitAddr(`${cm[1]}1`).col > col) { insertAt = open + cm.index!; break; } }
    return xml.slice(0, rm.index) + whole.slice(0, insertAt) + cell + whole.slice(insertAt) + xml.slice(rm.index + whole.length);
  }
  const newRow = `<${pre}row r="${row}">${cell}</${pre}row>`;
  const sd = /<(\w+:)?sheetData\b[^>]*\/>/.exec(xml);
  if (sd) return xml.replace(sd[0], `<${pre}sheetData>${newRow}</${pre}sheetData>`);
  for (const r of xml.matchAll(/<(?:\w+:)?row\b[^>]*\sr="(\d+)"/g)) if (Number(r[1]) > row) return xml.slice(0, r.index) + newRow + xml.slice(r.index);
  const end = xml.search(/<\/(\w+:)?sheetData>/); if (end < 0) throw new Error("Hiányzó sheetData.");
  return xml.slice(0, end) + newRow + xml.slice(end);
}

function forceRecalc(wb: string): string {
  const m = /<(\w+:)?calcPr\b[^>]*?\/?>/.exec(wb);
  if (m) { const tag = m[0].includes("fullCalcOnLoad=") ? m[0].replace(/fullCalcOnLoad="[^"]*"/, 'fullCalcOnLoad="1"') : m[0].replace(/(\s*\/?>)$/, ' fullCalcOnLoad="1"$1'); return wb.replace(m[0], tag); }
  const pre = /<(\w+:)?workbook\b/.exec(wb)?.[1] ?? "";
  let at = -1;
  for (const t of ["sheets", "functionGroups", "externalReferences", "definedNames"]) { const r = new RegExp(`</(\\w+:)?${t}>`).exec(wb); if (r) at = Math.max(at, r.index + r[0].length); }
  if (at < 0) throw new Error("A workbook.xml szerkezete nem ismert.");
  return wb.slice(0, at) + `<${pre}calcPr fullCalcOnLoad="1"/>` + wb.slice(at);
}

export function patchXlsx(bytes: Uint8Array, patches: CellPatch[]): { bytes: Uint8Array; changedParts: string[] } {
  let expanded = 0, entries = 0;
  const files = unzipSync(bytes, { filter: (f) => { entries++; expanded += f.originalSize; if (entries > PATCH_LIMITS.entries || expanded > PATCH_LIMITS.expandedBytes) throw new Error("A munkafüzet kibontott mérete meghaladja a korlátot."); return true; } });
  const parts = sheetParts(files);
  const bySheet = new Map<string, CellPatch[]>();
  for (const p of patches) bySheet.set(p.sheet, [...(bySheet.get(p.sheet) ?? []), p]);
  const changed: string[] = [];
  for (const [sheet, list] of bySheet) {
    const part = parts.get(sheet); if (!part || !files[part]) throw new Error(`Munkalap nem található a csomagban: ${sheet}`);
    let xml = dec.decode(files[part]);
    for (const p of list) xml = patchCell(xml, p);
    files[part] = enc.encode(xml); changed.push(part);
  }
  if (patches.length) { files["xl/workbook.xml"] = enc.encode(forceRecalc(dec.decode(files["xl/workbook.xml"]))); changed.push("xl/workbook.xml"); }
  const out: Record<string, Uint8Array> = {};
  for (const k of Object.keys(files)) out[k] = files[k];
  return { bytes: zipSync(out, { level: 6 }), changedParts: changed };
}

/** A két ZIP részenkénti összevetése: mely részek változtak bájtszinten. */
export function changedZipParts(a: Uint8Array, b: Uint8Array): { changed: string[]; added: string[]; removed: string[] } {
  const A = unzipSync(a), B = unzipSync(b);
  const same = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((v, i) => v === y[i]);
  return { changed: Object.keys(A).filter((k) => B[k] && !same(A[k], B[k])), added: Object.keys(B).filter((k) => !A[k]), removed: Object.keys(A).filter((k) => !B[k]) };
}
