// P2 – tervcsomag-feldolgozás: tiszta (böngészőben is használható) szabályok és a csomagjelentés.
// A tényleges feldolgozás az elkülönített feldolgozóban fut (services/package-processor), a CRM
// csak kiküldi a feladatot, aláírt visszajelzéseket fogad és menti az eredményt.
import { baseName, fileKindOf, normalizeRelativePath, type PackageFileKind } from "./package-policy";

export type JobKind = "pdf" | "spreadsheet" | "archive" | "image" | "text";
export type JobStatus = "queued" | "dispatched" | "running" | "done" | "failed" | "cancelled";
export type ExtractStatus = "done" | "partial" | "unreadable" | "not_supported" | "corrupt";

/** Mely fájlokat dolgoz fel a P2. CAD, levél, régi Word: csak tárolva (P4/később). */
export function jobKindOf(name: string): JobKind | null {
  const kind: PackageFileKind | null = fileKindOf(name);
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (kind === "pdf") return "pdf";
  if (kind === "spreadsheet") return "spreadsheet";
  if (kind === "archive") return "archive";
  if (kind === "image") return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? "image" : null;
  if (kind === "text") return ["txt", "docx", "odt"].includes(ext) ? "text" : null;
  return null;
}

/** A ZIP-ből kibontott fájl útvonala: a ZIP helye + a ZIP neve kiterjesztés nélkül + belső útvonal. */
export function extractedRelativePath(zipRelativePath: string, entry: string): string {
  const parts = normalizeRelativePath(zipRelativePath).split("/");
  const zipName = parts.pop()!;
  const stem = zipName.replace(/\.zip$/i, "") || "ZIP";
  return normalizeRelativePath([...parts, stem, normalizeRelativePath(entry)].join("/"));
}

export type ProcessingSettings = { ocrEnabled: boolean; ocrPagesPerPackage: number; maxZipEntries: number; maxExpandRatio: number };
export const DEFAULT_PROCESSING: ProcessingSettings = { ocrEnabled: true, ocrPagesPerPackage: 300, maxZipEntries: 20000, maxExpandRatio: 200 };
export function resolveProcessing(raw: unknown): ProcessingSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (k: keyof ProcessingSettings, min: number, max: number) => {
    const n = Number(v[k]);
    return Number.isFinite(n) && n >= min ? Math.min(Math.floor(n), max) : (DEFAULT_PROCESSING[k] as number);
  };
  return {
    ocrEnabled: typeof v.ocrEnabled === "boolean" ? v.ocrEnabled : DEFAULT_PROCESSING.ocrEnabled,
    ocrPagesPerPackage: num("ocrPagesPerPackage", 0, 20000),
    maxZipEntries: num("maxZipEntries", 1, 100000),
    maxExpandRatio: num("maxExpandRatio", 2, 2000),
  };
}

/** Képfelismerési keret: csomagonként ennyi oldal (a tulajdonos állítja). */
export function ocrAllowed(usedPages: number, s: ProcessingSettings): boolean {
  return s.ocrEnabled && usedPages < s.ocrPagesPerPackage;
}

/** Elakadt feladat: ennyi ideje nem jelzett a feldolgozó. */
export const STALE_AFTER_MS = 20 * 60 * 1000;
export function isStale(job: { status: string; heartbeat_at: string | null; dispatched_at: string | null }, now = Date.now()): boolean {
  if (job.status !== "dispatched" && job.status !== "running") return false;
  const t = Date.parse(job.heartbeat_at ?? job.dispatched_at ?? "");
  return Number.isFinite(t) && now - t > STALE_AFTER_MS;
}

export const PROBLEM_LABEL: Record<string, string> = {
  integrity_mismatch: "A tárolt fájl ellenőrzőösszege eltér a feltöltöttől – nem dolgoztuk fel.",
  encrypted: "Jelszóval védett, nem olvasható.",
  pdf_damaged: "Sérült vagy nem szabványos PDF.",
  pdf_text_failed: "Egyes oldalak szövege nem olvasható ki.",
  page_limit: "Túl sok oldal; csak az első oldalak kerültek feldolgozásra.",
  ocr_disabled: "Szkennelt oldal; a képfelismerés ki van kapcsolva.",
  ocr_budget: "Szkennelt oldal; a csomag képfelismerési kerete elfogyott.",
  ocr_failed: "A képfelismerés nem sikerült ezen az oldalon.",
  ocr_unavailable: "A képfelismerő szolgáltatás nem elérhető.",
  ocr_sensitive: "Érzékeny adat gyanúja miatt a kiolvasott szöveg visszatartva.",
  render_failed: "Az oldal nem alakítható képpé.",
  page_image_too_large: "Az oldal képe túl nagy a képfelismeréshez.",
  spreadsheet_damaged: "Sérült vagy nem támogatott táblázat.",
  spreadsheet_too_large: "A táblázat túl nagy az egyben olvasáshoz (csak tárolva).",
  sheet_truncated: "Nagyon nagy munkalap; nem minden cella került be.",
  macros_present: "Makrót tartalmaz – nem futott, az eredeti változatlan.",
  hidden_sheet: "Rejtett munkalapot tartalmaz (megőriztük, jelöltük).",
  external_links: "Más fájlra hivatkozó képletet tartalmaz.",
  structure_upload_failed: "A táblázat teljes szerkezete nem menthető (a szöveg igen).",
  corrupt_archive: "Sérült vagy nem szabványos ZIP.",
  too_many_entries: "Túl sok fájl a ZIP-ben.",
  zip_bomb: "Gyanúsan nagy kibontott méret (tömörítési bomba) – nem bontottuk ki.",
  path_unsafe: "Veszélyes útvonal a ZIP-ben (kilépés a mappából) – kihagyva.",
  symlink_skipped: "Hivatkozás (link) a ZIP-ben – kihagyva.",
  entry_encrypted: "Jelszóval védett fájl a ZIP-ben – nem bontható ki.",
  empty_entry: "Üres fájl a ZIP-ben – kihagyva.",
  entry_damaged: "Sérült fájl a ZIP-ben.",
  entry_rejected: "Ez a fájltípus nem tölthető fel – kihagyva.",
  entry_upload_failed: "A kibontott fájl mentése nem sikerült.",
  not_allowed_type: "Ez a fájltípus nem tölthető fel – kihagyva.",
  file_too_large: "A fájl nagyobb a megengedettnél.",
  too_many_files: "A csomag elérte a fájlszám-korlátot.",
  too_deep: "ZIP a ZIP-ben a ZIP-ben – mélyebb szintet nem bontunk ki.",
  no_archive: "A ZIP nem érhető el.",
  unsupported_format: "Ez a formátum még nem olvasható (csak tárolva).",
  unsupported_image: "Ez a képformátum még nem olvasható (csak tárolva).",
  text_too_large: "A szöveges fájl túl nagy.",
  document_damaged: "Sérült dokumentum.",
  processor_error: "A feldolgozó váratlan hibát jelzett.",
  dispatch_failed: "A feldolgozó nem fogadta a feladatot.",
  stale: "A feldolgozó nem jelentkezett – újrapróbálható.",
  not_configured: "A feldolgozó még nincs bekapcsolva.",
};
export const problemText = (code: string) => PROBLEM_LABEL[code] ?? "Ismeretlen feldolgozási probléma.";

export type Problem = { code: string; detail?: string; page?: number; entry?: string; sheet?: string };

export type ReportFile = {
  id: string; relativePath: string; size: number; status: string; processingStatus: string; errorCode: string | null;
  extractedFrom: string | null; duplicateOf: string | null;
};
export type ReportExtract = {
  file_id: string; status: ExtractStatus; parser: string; page_count: number | null; text_pages: number | null; ocr_pages: number | null;
  ocr_skipped: number | null; unreadable_pages: number | null; sheet_count: number | null; formula_count: number | null;
  entry_count: number | null; extracted_count: number | null; has_macros: boolean; encrypted: boolean; problems: Problem[]; summary: Record<string, any>;
};
export type ReportJob = { file_id: string; status: JobStatus; error_code: string | null; heartbeat_at: string | null; dispatched_at: string | null; created_at: string };

export type ReportState = "processed" | "partial" | "unreadable" | "not_supported" | "waiting" | "running" | "failed" | "duplicate" | "upload_open";
export type ReportRow = {
  fileId: string; path: string; state: ReportState; label: string; reasons: string[]; details: string | null;
  fromArchive: boolean; retryable: boolean;
};
export type PackageReport = {
  totals: { files: number; processed: number; partial: number; unreadable: number; notSupported: number; waiting: number; running: number; failed: number; duplicates: number; extractedFromZip: number; ocrPages: number; textPages: number; sheets: number; formulas: number };
  rows: ReportRow[];
};

export const REPORT_STATE_LABEL: Record<ReportState, string> = {
  processed: "Feldolgozva", partial: "Részben olvasható", unreadable: "Nem olvasható", not_supported: "Csak tárolva",
  waiting: "Feldolgozásra vár", running: "Feldolgozás alatt", failed: "Hiba – újrapróbálható", duplicate: "Már meglévő fájl", upload_open: "Feltöltés nincs kész",
};

function uniq<T>(xs: T[]) { return [...new Set(xs)]; }

function details(e: ReportExtract | undefined): string | null {
  if (!e) return null;
  const parts: string[] = [];
  if (e.page_count) parts.push(`${e.page_count} oldal`);
  if (e.text_pages) parts.push(`${e.text_pages} szöveges`);
  if (e.ocr_pages) parts.push(`${e.ocr_pages} képfelismeréssel`);
  if (e.unreadable_pages) parts.push(`${e.unreadable_pages} olvashatatlan`);
  if (e.sheet_count) parts.push(`${e.sheet_count} munkalap`);
  if (e.formula_count) parts.push(`${e.formula_count} képlet`);
  const ct = Array.isArray(e.summary?.costTables) ? e.summary.costTables : [];
  if (ct.length) parts.push(`${ct.reduce((s: number, t: any) => s + (t.itemRows ?? 0), 0)} költségvetési tétel (${ct.reduce((s: number, t: any) => s + (t.unpricedRows ?? 0), 0)} árazatlan)`);
  if (e.entry_count != null) parts.push(`${e.extracted_count ?? 0}/${e.entry_count} fájl kibontva`);
  return parts.length ? parts.join(" · ") : null;
}

/** Csomagjelentés: minden fájlról, hogy feldolgozható volt-e, és ha nem, miért. */
export function buildReport(files: ReportFile[], extracts: ReportExtract[], jobs: ReportJob[], now = Date.now()): PackageReport {
  const ex = new Map(extracts.map((e) => [e.file_id, e]));
  const lastJob = new Map<string, ReportJob>();
  for (const j of jobs) { const cur = lastJob.get(j.file_id); if (!cur || cur.created_at < j.created_at) lastJob.set(j.file_id, j); }
  const t = { files: 0, processed: 0, partial: 0, unreadable: 0, notSupported: 0, waiting: 0, running: 0, failed: 0, duplicates: 0, extractedFromZip: 0, ocrPages: 0, textPages: 0, sheets: 0, formulas: 0 };
  const rows: ReportRow[] = [];
  for (const f of files) {
    if (f.status === "aborted") continue;
    t.files++;
    if (f.extractedFrom) t.extractedFromZip++;
    const e = ex.get(f.id), j = lastJob.get(f.id);
    let state: ReportState; let reasons: string[] = [];
    if (f.status === "duplicate") state = "duplicate";
    else if (f.status !== "verified") { state = f.status === "failed" ? "failed" : "upload_open"; if (f.errorCode) reasons.push(problemText(f.errorCode)); }
    else if (e) {
      state = e.status === "done" ? "processed" : e.status === "partial" ? "partial" : e.status === "not_supported" ? "not_supported" : "unreadable";
      reasons = uniq((e.problems ?? []).map((p) => problemText(p.code)));
      t.ocrPages += e.ocr_pages ?? 0; t.textPages += e.text_pages ?? 0; t.sheets += e.sheet_count ?? 0; t.formulas += e.formula_count ?? 0;
    } else if (j && isStale(j, now)) { state = "failed"; reasons = [problemText("stale")]; }
    else if (j?.status === "failed") { state = "failed"; reasons = [problemText(j.error_code ?? "processor_error")]; }
    else if (j && (j.status === "dispatched" || j.status === "running")) state = "running";
    else if (f.processingStatus === "not_supported" || !jobKindOf(f.relativePath)) { state = "not_supported"; reasons = [problemText("unsupported_format")]; }
    else { state = "waiting"; if (j?.error_code) reasons = [problemText(j.error_code)]; }
    const key = ({ processed: "processed", partial: "partial", unreadable: "unreadable", not_supported: "notSupported", waiting: "waiting", running: "running", failed: "failed", duplicate: "duplicates", upload_open: "waiting" } as const)[state];
    t[key]++;
    rows.push({
      fileId: f.id, path: f.relativePath, state, label: REPORT_STATE_LABEL[state], reasons, details: details(e),
      fromArchive: !!f.extractedFrom,
      retryable: f.status === "verified" && !!jobKindOf(f.relativePath) && (state === "failed" || state === "waiting" || (state === "unreadable" && !e?.encrypted) || state === "partial"),
    });
  }
  const order: Record<ReportState, number> = { failed: 0, unreadable: 1, partial: 2, upload_open: 3, waiting: 4, running: 5, not_supported: 6, duplicate: 7, processed: 8 };
  rows.sort((a, b) => order[a.state] - order[b.state] || a.path.localeCompare(b.path, "hu"));
  return { totals: t, rows };
}

/** Visszajelzési üzenetek alakja (a feldolgozótól érkező adat nem megbízható – mindent ellenőrzünk). */
export const CALLBACK_ACTIONS = ["started", "units", "ocr", "entry", "entry_done", "result", "failed"] as const;
export type CallbackAction = (typeof CALLBACK_ACTIONS)[number];
export const MAX_UNIT_CHARS = 200_000;
export const MAX_UNITS_PER_CALL = 50;

export type UnitIn = { unitKind: "page" | "sheet" | "text"; unitNo: number; label: string | null; source: "text_layer" | "ocr" | "sheet" | "text"; text: string };
export function parseUnits(raw: unknown): UnitIn[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_UNITS_PER_CALL) return null;
  const out: UnitIn[] = [];
  for (const u of raw as any[]) {
    if (!u || !["page", "sheet", "text"].includes(u.unitKind) || !["text_layer", "sheet", "text"].includes(u.source)) return null;
    if (!Number.isInteger(u.unitNo) || u.unitNo < 1 || u.unitNo > 100000 || typeof u.text !== "string") return null;
    out.push({ unitKind: u.unitKind, unitNo: u.unitNo, label: typeof u.label === "string" ? u.label.slice(0, 200) : null, source: u.source, text: u.text.slice(0, MAX_UNIT_CHARS).replace(/\u0000/g, "") });
  }
  return out;
}

export function parseResult(raw: any): { status: ExtractStatus; parser: string; sha256Ok: boolean; problems: Problem[]; summary: Record<string, unknown>; nums: Record<string, number | null>; hasMacros: boolean; encrypted: boolean; structureUploaded: boolean } | null {
  if (!raw || !["done", "partial", "unreadable", "not_supported", "corrupt"].includes(raw.status) || typeof raw.parser !== "string") return null;
  const n = (k: string) => (Number.isInteger(raw[k]) && raw[k] >= 0 && raw[k] < 10_000_000 ? raw[k] : null);
  const problems: Problem[] = (Array.isArray(raw.problems) ? raw.problems : []).slice(0, 2000).filter((p: any) => p && typeof p.code === "string").map((p: any) => ({
    code: String(p.code).slice(0, 60), detail: typeof p.detail === "string" ? p.detail.slice(0, 300) : undefined,
    page: Number.isInteger(p.page) ? p.page : undefined, entry: typeof p.entry === "string" ? p.entry.slice(0, 500) : undefined, sheet: typeof p.sheet === "string" ? p.sheet.slice(0, 200) : undefined,
  }));
  const summary = raw.summary && typeof raw.summary === "object" ? raw.summary : {};
  if (JSON.stringify(summary).length > 200_000) return null;
  return {
    status: raw.status, parser: raw.parser.slice(0, 60), sha256Ok: raw.sha256Ok === true, problems, summary,
    nums: { page_count: n("pageCount"), text_pages: n("textPages"), ocr_pages: n("ocrPages"), ocr_skipped: n("ocrSkipped"), unreadable_pages: n("unreadablePages"), sheet_count: n("sheetCount"), formula_count: n("formulaCount"), entry_count: n("entryCount"), extracted_count: n("extractedCount") },
    hasMacros: raw.hasMacros === true, encrypted: raw.encrypted === true, structureUploaded: raw.structureUploaded === true,
  };
}

export { baseName };
