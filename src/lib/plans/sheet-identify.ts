/**
 * P4 — tervjel, lapszám, revízió, dátum, szakág és dokumentumtípus felismerése oldalanként,
 * visszakereshető bizonyítékkal (fájl, oldal, szövegrészlet). Bizonytalan felismerés jelölve, soha nem kitalált.
 */
import { clean, fold, pageLines, snip, type Evidence, type PlanFile, type PlanLine, type PlanPage } from "./plan-text";

export type DocType = "single_line" | "cabinet_view" | "floor_plan" | "legend" | "technical_description" | "designer_statement" | "lightning_protection" | "kitchen_plan" | "drawing_list" | "budget_sheet" | "unknown";
export type Discipline = "erosaram" | "gyengearam" | "villamvedelem" | "gepeszet" | "epiteszet" | "belsoepiteszet" | "ismeretlen";
export const DOC_TYPE_LABEL: Record<DocType, string> = {
  single_line: "Elosztó egyvonalas/kapcsolási rajz", cabinet_view: "Elosztó nézeti rajz", floor_plan: "Alaprajz / szerelési terv", legend: "Jelmagyarázat",
  technical_description: "Műszaki leírás", designer_statement: "Tervezői nyilatkozat", lightning_protection: "Villámvédelmi / földelési terv", kitchen_plan: "Konyhaterv / belsőépítészeti terv",
  drawing_list: "Tervjegyzék", budget_sheet: "Költségvetési munkalap", unknown: "Nem azonosított",
};
export const DISCIPLINE_LABEL: Record<Discipline, string> = { erosaram: "Erősáram", gyengearam: "Gyengeáram", villamvedelem: "Villámvédelem/földelés", gepeszet: "Gépészet", epiteszet: "Építészet", belsoepiteszet: "Belsőépítészet", ismeretlen: "Nem azonosított" };

export type Found<T> = { value: T; confidence: "high" | "medium" | "low"; evidence: Evidence } | null;
export type PageIdentity = {
  fileId: string; fileName: string; page: number; chars: number; readable: boolean; aiExtracted: boolean;
  drawingNo: Found<string>; sheetNo: Found<number>; sheetTotal: Found<number>; revision: Found<string>; date: Found<string>;
  title: Found<string>; docType: { value: DocType; score: number; evidence: Evidence | null }; discipline: { value: Discipline; evidence: Evidence | null };
  cabinetIds: { id: string; evidence: Evidence }[];
};

const DRAWING_RE = /^(?=[^\d]*\d)[A-ZÁÉÍÓÖŐÚÜŰ][A-Za-z0-9ÁÉÍÓÖŐÚÜŰáéíóöőúüű]{0,5}(?:[-_.][A-Za-z0-9ÁÉÍÓÖŐÚÜŰáéíóöőúüű]{1,6}){1,4}$/;
const NOT_DRAWING = /^(SBI|LC1|NG\d|IC60|ICT|IID|NSX|INS|H0\dR|MK\d|IP\d|NYY|NYM|CYKY|NAYY|YKY|N2XH|NHXH|JB|PV|DN|M\d+$|\d)/i;
const LABEL_RE = /(rajzszam|tervszam|tervjel|rajzjel|lapjel|lapszam|rajz sz|terv sz)/;

function ev(f: { fileId: string; fileName: string }, page: number, snippet: string, kind: Evidence["kind"] = "plan", ai = false): Evidence {
  return { kind, fileId: f.fileId, fileName: f.fileName, page, snippet: snip(snippet), aiExtracted: ai };
}
const fileStem = (n: string) => n.replace(/\.[a-z0-9]{2,5}$/i, "");
export const normDrawingNo = (s: string) => s.toUpperCase().replace(/[_\s]+/g, "-").replace(/\.+$/, "");

function titleRegion(p: PlanPage, l: PlanLine): boolean {
  if (!l.items || !p.width || !p.height || l.y == null) return false;
  return l.y < p.height * 0.22 && l.items.some((i) => i.x > p.width! * 0.55);
}

function drawingCandidates(p: PlanPage, lines: PlanLine[], fileName: string) {
  const stem = fold(fileStem(fileName));
  const out = new Map<string, { raw: string; score: number; line: string; labelled: boolean }>();
  lines.forEach((l, i) => {
    const words = (l.items ? l.items.flatMap((it) => it.s.split(/\s+/)) : l.text.split(/\s+/)).map((w) => w.replace(/^[(„"']+|[)”"':;,]+$/g, ""));
    const labelled = LABEL_RE.test(fold(l.text)) || (i > 0 && LABEL_RE.test(fold(lines[i - 1]!.text)));
    for (const w of words) {
      if (w.length < 3 || w.length > 24 || !DRAWING_RE.test(w) || NOT_DRAWING.test(w) || /^\d+[.,]\d+$/.test(w)) continue;
      let score = 0;
      if (labelled) score += 3;
      if (titleRegion(p, l)) score += 2;
      const fw = fold(w);
      if (stem.startsWith(fw) || stem.includes(fw) || fw.includes(stem.split(/[\s_]/)[0] ?? "\u0000")) score += 2;
      if (score === 0) continue;
      const key = normDrawingNo(w), cur = out.get(key);
      if (!cur || cur.score < score) out.set(key, { raw: w, score, line: l.text, labelled });
    }
  });
  return [...out.entries()].sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]));
}

const TYPE_RULES: { type: DocType; re: RegExp; w: number }[] = [
  { type: "cabinet_view", re: /nezeti rajz|\b\d+\s*db\s+(kismegszakito|rcd|fi\b|fokapcsolo)/, w: 3 },
  { type: "single_line", re: /aramkor:|beep\.? telj|kismegszakito.*(1p|3p)|egyvonalas|kapcsolasi rajz|aram-?vedokapcsolo/, w: 2 },
  { type: "legend", re: /jelmagyarazat/, w: 3 },
  { type: "designer_statement", re: /tervezoi nyilatkozat/, w: 3 },
  { type: "technical_description", re: /muszaki leiras|muszaki tartalom|kiegeszito tajekoztat/, w: 3 },
  { type: "lightning_protection", re: /villamvedelem|foldelesi halozat|felfogo/, w: 2 },
  { type: "kitchen_plan", re: /konyhaterv/, w: 3 },
  { type: "drawing_list", re: /tervjegyzek|rajzjegyzek/, w: 3 },
  { type: "floor_plan", re: /alaprajz|foldszint|emelet|tetoter|pince|elektromos terve|dugalj|szerelesi terv/, w: 1 },
];
const DISC_RULES: { d: Discipline; re: RegExp }[] = [
  { d: "villamvedelem", re: /villamvedelem|foldeles/ }, { d: "gyengearam", re: /gyengearam|vagyonvedelem|beteghivo|strukturalt halozat/ },
  { d: "erosaram", re: /villamos|elektromos|erosaram|eloszto|kismegszakito|dugalj|ele\b/ }, { d: "gepeszet", re: /gepeszet|hvac|szellozes terv/ },
  { d: "belsoepiteszet", re: /konyhaterv|belsoepitesz/ }, { d: "epiteszet", re: /epitesz/ },
];

export function identifyPage(file: Pick<PlanFile, "fileId" | "fileName">, p: PlanPage): PageIdentity {
  const lines = pageLines(p);
  const all = lines.map((l) => l.text).join("\n");
  const f = fold(all);
  const chars = all.replace(/\s+/g, "").length;
  const res: PageIdentity = { fileId: file.fileId, fileName: file.fileName, page: p.page, chars, readable: chars >= 40, aiExtracted: p.aiExtracted,
    drawingNo: null, sheetNo: null, sheetTotal: null, revision: null, date: null, title: null,
    docType: { value: "unknown", score: 0, evidence: null }, discipline: { value: "ismeretlen", evidence: null }, cabinetIds: [] };
  if (p.source === "sheet") res.docType = { value: "budget_sheet", score: 3, evidence: ev(file, p.page, "munkalap", "plan") };

  const cands = drawingCandidates(p, lines, file.fileName);
  if (cands[0]) { const [key, c] = cands[0]; res.drawingNo = { value: key, confidence: c.score >= 4 ? "high" : c.score >= 2 ? "medium" : "low", evidence: ev(file, p.page, c.line, "plan", p.aiExtracted) }; }
  else {
    const stemTok = fileStem(file.fileName).split(/[\s_]+/)[0] ?? "";
    if (DRAWING_RE.test(stemTok) && !NOT_DRAWING.test(stemTok)) res.drawingNo = { value: normDrawingNo(stemTok), confidence: "low", evidence: { kind: "file_name", fileId: file.fileId, fileName: file.fileName, page: p.page, snippet: file.fileName } };
  }
  for (const l of lines) {
    const t = fold(l.text);
    const sh = t.match(/(?:^|\s)(\d{1,3})\s*\.\s*lap\b(?!ra|rol|on)/);
    if (sh && !res.sheetNo) res.sheetNo = { value: Number(sh[1]), confidence: titleRegion(p, l) || !l.items ? "high" : "medium", evidence: ev(file, p.page, l.text) };
    const tot = t.match(/(\d{1,3})\s*lapbol all|lapok szama\s*:?\s*(\d{1,3})|osszesen\s*(\d{1,3})\s*lap/);
    if (tot && !res.sheetTotal) res.sheetTotal = { value: Number(tot[1] ?? tot[2] ?? tot[3]), confidence: "high", evidence: ev(file, p.page, l.text) };
    const rev = l.text.match(/\b(?:rev(?:izio|ízió)?\.?\s*[:.]?\s*|módosítás\s*[:.]?\s*|R)([0-9]{2}|[A-Z])\b/i) ?? l.text.match(/\bREV\s*([0-9A-Z]{1,3})\b/i);
    if (rev && !res.revision && /rev|módosítás|^R\d{2}$|\bR\d{2}\b/i.test(rev[0])) res.revision = { value: rev[0].replace(/\s+/g, " ").trim(), confidence: /rev|módosítás/i.test(rev[0]) ? "high" : "medium", evidence: ev(file, p.page, l.text) };
    const d = l.text.match(/\b(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?/);
    if (d && !res.date) { const iso = `${d[1]}-${d[2]!.padStart(2, "0")}-${d[3]!.padStart(2, "0")}`; if (!Number.isNaN(Date.parse(iso))) res.date = { value: iso, confidence: titleRegion(p, l) ? "high" : "medium", evidence: ev(file, p.page, l.text) }; }
    const cab = [...t.matchAll(/(?:["„“”'\s]|^)([a-z]{1,3}\d{0,2}(?:-\d{1,2})?|\d{1,2}[a-z]{0,2})["„“”']?\s+jelu\s+(?:(?:fo|al|foldszinti|emeleti|pinceszinti)\s*)?eloszto/g)];
    for (const m of cab) { const id = m[1]!.toUpperCase(); if (!res.cabinetIds.some((c) => c.id === id)) res.cabinetIds.push({ id, evidence: ev(file, p.page, l.text) }); }
  }
  const fileHint = fold(fileStem(file.fileName));
  let best: { type: DocType; score: number; line: string } = { type: res.docType.value, score: res.docType.score, line: "" };
  for (const r of TYPE_RULES) {
    const hit = lines.find((l) => r.re.test(fold(l.text)));
    const s = (hit ? r.w : 0) + (r.re.test(fileHint) ? 1 : 0);
    if (s > best.score) best = { type: r.type, score: s, line: hit?.text ?? file.fileName };
  }
  if (best.type === "single_line" && /nezeti rajz/.test(f)) best = { type: "cabinet_view", score: best.score + 1, line: best.line };
  res.docType = { value: best.type, score: best.score, evidence: best.score ? ev(file, p.page, best.line) : null };
  for (const r of DISC_RULES) { const hit = lines.find((l) => r.re.test(fold(l.text))); if (hit || r.re.test(fileHint)) { res.discipline = { value: r.d, evidence: ev(file, p.page, hit?.text ?? file.fileName, hit ? "plan" : "file_name") }; break; } }
  const titleLine = [...lines].reverse().find((l) => /terve\b|rajza\b|leiras|jelmagyarazat|nyilatkozat|konyhaterv/.test(fold(l.text)) && l.text.length <= 90);
  if (titleLine) res.title = { value: clean(titleLine.text), confidence: titleRegion(p, titleLine) ? "high" : "medium", evidence: ev(file, p.page, titleLine.text) };
  return res;
}

export type DrawingEntry = {
  drawingNo: string; title: string | null; files: { fileId: string; fileName: string }[]; pages: { fileId: string; page: number; sheetNo: number | null; docType: DocType }[];
  sheetNos: number[]; sheetTotal: number | null; revisions: string[]; dates: string[]; disciplines: Discipline[]; cabinetIds: string[];
  issues: { code: "missing_sheets" | "revision_conflict" | "low_confidence"; message: string; evidence: Evidence[] }[];
};
export type FileMatrixRow = { fileId: string; fileName: string; origin: PlanFile["origin"]; status: "full" | "partial" | "unreadable" | "not_processed"; label: string; pages: number; readablePages: number; reasons: string[] };

export const MATRIX_LABEL: Record<FileMatrixRow["status"], string> = { full: "Teljesen feldolgozott", partial: "Részleges", unreadable: "Olvashatatlan (OCR szükséges)", not_processed: "Nem feldolgozott" };

export function buildRegistry(files: PlanFile[], ids: PageIdentity[]) {
  const map = new Map<string, DrawingEntry>();
  for (const p of ids) {
    if (!p.drawingNo) continue;
    const k = p.drawingNo.value;
    const e = map.get(k) ?? { drawingNo: k, title: null, files: [], pages: [], sheetNos: [], sheetTotal: null, revisions: [], dates: [], disciplines: [], cabinetIds: [], issues: [] };
    map.set(k, e);
    if (!e.files.some((f) => f.fileId === p.fileId)) e.files.push({ fileId: p.fileId, fileName: p.fileName });
    e.pages.push({ fileId: p.fileId, page: p.page, sheetNo: p.sheetNo?.value ?? null, docType: p.docType.value });
    if (p.sheetNo && !e.sheetNos.includes(p.sheetNo.value)) e.sheetNos.push(p.sheetNo.value);
    if (p.sheetTotal) e.sheetTotal = Math.max(e.sheetTotal ?? 0, p.sheetTotal.value);
    if (p.revision && !e.revisions.includes(p.revision.value)) e.revisions.push(p.revision.value);
    if (p.date && !e.dates.includes(p.date.value)) e.dates.push(p.date.value);
    if (p.discipline.value !== "ismeretlen" && !e.disciplines.includes(p.discipline.value)) e.disciplines.push(p.discipline.value);
    for (const c of p.cabinetIds) if (!e.cabinetIds.includes(c.id)) e.cabinetIds.push(c.id);
    if (!e.title && p.title) e.title = p.title.value;
  }
  for (const e of map.values()) {
    e.sheetNos.sort((a, b) => a - b);
    const pagesOf = ids.filter((p) => p.drawingNo?.value === e.drawingNo);
    if (e.sheetTotal) {
      const covered = new Set(e.sheetNos.length ? e.sheetNos : []);
      const pageCount = pagesOf.length;
      const missing = Array.from({ length: e.sheetTotal }, (_, i) => i + 1).filter((n) => !covered.has(n) && !(n === 1 && pageCount >= e.sheetTotal));
      const effectiveMissing = covered.size ? missing.filter((n) => n !== 1 || pageCount < e.sheetTotal) : pageCount < e.sheetTotal ? [pageCount + 1] : [];
      if (pageCount < e.sheetTotal || (covered.size && effectiveMissing.length && pageCount < e.sheetTotal))
        e.issues.push({ code: "missing_sheets", message: `A terv ${e.sheetTotal} lapból áll, de csak ${pageCount} oldal érhető el.`, evidence: pagesOf.filter((p) => p.sheetTotal).map((p) => p.sheetTotal!.evidence).slice(0, 2) });
    }
    const fileKeys = new Set(pagesOf.map((p) => p.fileId));
    if (fileKeys.size > 1 && (e.revisions.length > 1 || e.dates.length > 1))
      e.issues.push({ code: "revision_conflict", message: `Több fájl ugyanazzal a tervjellel, eltérő revízióval/dátummal (${[...e.revisions, ...e.dates].join(", ")}). Melyik az érvényes?`, evidence: pagesOf.map((p) => (p.revision ?? p.date)?.evidence).filter((x): x is Evidence => !!x).slice(0, 4) });
    if (pagesOf.every((p) => p.drawingNo!.confidence === "low")) e.issues.push({ code: "low_confidence", message: "A tervjel csak a fájlnévből vagy gyenge jelből azonosított.", evidence: pagesOf.map((p) => p.drawingNo!.evidence).slice(0, 1) });
  }
  const matrix: FileMatrixRow[] = files.map((f) => {
    const pages = ids.filter((p) => p.fileId === f.fileId);
    const readable = pages.filter((p) => p.readable).length;
    const reasons: string[] = [];
    if (f.status !== "read") return { fileId: f.fileId, fileName: f.fileName, origin: f.origin, status: "not_processed", label: MATRIX_LABEL.not_processed, pages: f.pageCount ?? 0, readablePages: 0, reasons: [f.statusReason ?? f.status] };
    const total = f.pageCount ?? pages.length;
    if (pages.length < total) reasons.push(`${total - pages.length} oldal nem került olvasásra (oldalkorlát).`);
    if (readable < pages.length) reasons.push(`${pages.length - readable} oldalon nincs szövegréteg — OCR szükséges (rajzi grafika nem értelmezett).`);
    if (pages.some((p) => p.aiExtracted)) reasons.push("Egyes oldalak AI-képfelismerésből: nem ellenőrzött forrás.");
    reasons.push("Rajzi szimbólumok (grafika) nem értelmezettek; csak a szövegréteg.");
    const status: FileMatrixRow["status"] = readable === 0 ? "unreadable" : readable === total && pages.length === total ? "full" : "partial";
    return { fileId: f.fileId, fileName: f.fileName, origin: f.origin, status, label: MATRIX_LABEL[status], pages: total, readablePages: readable, reasons };
  });
  return { drawings: [...map.values()].sort((a, b) => a.drawingNo.localeCompare(b.drawingNo, "hu", { numeric: true })), matrix,
    unidentifiedPages: ids.filter((p) => !p.drawingNo && p.readable).map((p) => ({ fileId: p.fileId, fileName: p.fileName, page: p.page, docType: p.docType.value })) };
}
