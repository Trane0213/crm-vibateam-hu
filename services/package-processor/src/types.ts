// A CRM által küldött feladat. A feldolgozó NEM kap adatbázis-, tárhely- vagy AI-kulcsot:
// csak rövid életű, erre az egy fájlra aláírt letöltési/feltöltési címeket és a visszajelzési címet.
export type JobKind = "pdf" | "spreadsheet" | "archive" | "image" | "text";

export type ProcessorJob = {
  v: 1;
  jobId: string;
  token: string;
  fileId: string;
  kind: JobKind;
  name: string;
  relativePath: string;
  size: number;
  sha256: string;
  depth: number;
  sourceUrl: string;
  derivedPutUrl: string | null;
  callbackUrl: string;
  limits: {
    ocr: boolean;
    maxZipEntries: number;
    maxExpandRatio: number;
    maxEntryBytes: number;
    maxPdfPages: number;
    maxSpreadsheetBytes: number;
    maxUnitChars: number;
  };
};

export type Problem = { code: string; detail?: string; page?: number; entry?: string; sheet?: string };

export type Unit = {
  unitKind: "page" | "sheet" | "text";
  unitNo: number;
  label: string | null;
  source: "text_layer" | "ocr" | "sheet" | "text";
  text: string;
};

export type ExtractResult = {
  parser: string;
  status: "done" | "partial" | "unreadable" | "not_supported" | "corrupt";
  sha256Ok: boolean;
  pageCount?: number; textPages?: number; ocrPages?: number; ocrSkipped?: number; unreadablePages?: number;
  sheetCount?: number; formulaCount?: number; entryCount?: number; extractedCount?: number;
  hasMacros?: boolean; encrypted?: boolean; structureUploaded?: boolean;
  summary: Record<string, unknown>;
  problems: Problem[];
};

export function isJob(x: any): x is ProcessorJob {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return !!x && x.v === 1 && uuid.test(x.jobId) && uuid.test(x.token) && uuid.test(x.fileId)
    && ["pdf", "spreadsheet", "archive", "image", "text"].includes(x.kind)
    && typeof x.sourceUrl === "string" && /^https:\/\//.test(x.sourceUrl)
    && typeof x.callbackUrl === "string" && /^https:\/\//.test(x.callbackUrl)
    && (x.derivedPutUrl === null || typeof x.derivedPutUrl === "string")
    && /^[0-9a-f]{64}$/.test(x.sha256) && Number.isFinite(x.size) && x.size > 0
    && !!x.limits && typeof x.limits === "object";
}

/**
 * Hálózati korlát: a feldolgozó csak a beállított tárhely-hostra (aláírt R2-címek) és a
 * beállított CRM-címre kapcsolódhat. Üres beállításnál semmit nem fogad el (zárt alapállapot).
 */
export type Allow = { storageHosts: string[]; callbackOrigins: string[] };
export function allowFromEnv(env: Record<string, string | undefined>): Allow {
  const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { storageHosts: list(env.ALLOWED_STORAGE_HOSTS), callbackOrigins: list(env.ALLOWED_CALLBACK_ORIGINS) };
}
export function storageUrlAllowed(url: string, allow: Allow): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && allow.storageHosts.includes(u.host.toLowerCase()); } catch { return false; }
}
export function jobAllowed(job: ProcessorJob, allow: Allow): boolean {
  let cb: URL;
  try { cb = new URL(job.callbackUrl); } catch { return false; }
  return storageUrlAllowed(job.sourceUrl, allow)
    && (job.derivedPutUrl === null || storageUrlAllowed(job.derivedPutUrl, allow))
    && cb.protocol === "https:" && allow.callbackOrigins.includes(cb.origin.toLowerCase());
}
