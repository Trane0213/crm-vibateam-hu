// P1 – nagy tervcsomagok: tiszta, kliens- és szerverbiztos szabályok.
// A tárolási kulcsot mindig a szerver képzi; a kliens csak relatív útvonalat
// (megjelenítés + mappaszerkezet) és fájladatokat küld.

export type PackageParentKind = "project" | "quote";
export type PackageParent = { kind: PackageParentKind; id: string };

export const MiB = 1024 * 1024;
export const GiB = 1024 * MiB;

/** Alapértelmezett korlátok – a tulajdonos a `settings` táblában (document_package_limits) felülírhatja. */
export const DEFAULT_LIMITS = { maxFileBytes: 1 * GiB, maxParentBytes: 5 * GiB, maxFilesPerPackage: 5000 } as const;
export type PackageLimits = { maxFileBytes: number; maxParentBytes: number; maxFilesPerPackage: number };

/** Felső biztonsági határ a beállítható korlátokra (hibás beállítás ellen). */
const HARD_CAP = { maxFileBytes: 50 * GiB, maxParentBytes: 500 * GiB, maxFilesPerPackage: 50_000 };

export function resolveLimits(raw: unknown): PackageLimits {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (k: keyof PackageLimits) => {
    const n = Number(v[k]);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), HARD_CAP[k]) : DEFAULT_LIMITS[k];
  };
  return { maxFileBytes: pick("maxFileBytes"), maxParentBytes: pick("maxParentBytes"), maxFilesPerPackage: pick("maxFilesPerPackage") };
}

/** S3/R2 többrészes feltöltés: legalább 5 MiB darab (az utolsó kivételével), legfeljebb 10 000 darab. */
export const MIN_PART = 5 * MiB;
export const DEFAULT_PART = 16 * MiB;
export const MAX_PARTS = 10_000;
/** A szerveres továbbítás (tartalék út) felső határa darabonként. */
export const MAX_RELAY_PART = 64 * MiB;

export function planParts(size: number): { partSize: number; partCount: number } {
  if (!Number.isFinite(size) || size <= 0) throw new Error("Üres fájl nem tölthető fel.");
  let partSize = DEFAULT_PART;
  if (Math.ceil(size / partSize) > MAX_PARTS) partSize = Math.ceil(size / MAX_PARTS / MiB) * MiB;
  return { partSize, partCount: Math.max(1, Math.ceil(size / partSize)) };
}

export function partRange(size: number, partSize: number, partNumber: number): { start: number; end: number } {
  const start = (partNumber - 1) * partSize;
  if (partNumber < 1 || start >= size) throw new Error("Érvénytelen darabszám");
  return { start, end: Math.min(size, start + partSize) };
}

/** Fájlok, amelyek tervcsomagban elfogadottak. Futtatható/szkript fájl nem tölthető fel. */
export const PACKAGE_EXTENSIONS = {
  pdf: "pdf", png: "image", jpg: "image", jpeg: "image", tif: "image", tiff: "image", gif: "image", webp: "image", heic: "image", bmp: "image",
  xlsx: "spreadsheet", xlsm: "spreadsheet", xls: "spreadsheet", csv: "spreadsheet", ods: "spreadsheet",
  docx: "text", doc: "text", odt: "text", txt: "text", rtf: "text",
  dwg: "cad", dxf: "cad", ifc: "cad", dwf: "cad", rvt: "cad",
  zip: "archive",
  msg: "email", eml: "email",
} as const;
export type PackageFileKind = (typeof PACKAGE_EXTENSIONS)[keyof typeof PACKAGE_EXTENSIONS];

export function fileKindOf(name: string): PackageFileKind | null {
  const ext = extOf(name);
  return (PACKAGE_EXTENSIONS as Record<string, PackageFileKind>)[ext] ?? null;
}
export function extOf(name: string): string {
  const base = name.split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

/** Rejtett/rendszerfájlok, amelyeket mappafeltöltésnél kihagyunk (nem hiba). */
export function isSystemJunk(relativePath: string): boolean {
  const parts = relativePath.split("/");
  const base = parts[parts.length - 1] ?? "";
  return base === ".DS_Store" || base === "Thumbs.db" || base === "desktop.ini" || base.startsWith("~$") || parts.some((p) => p === "__MACOSX");
}

const CONTROL = /[\u0000-\u001f\u007f]/g;

/**
 * Relatív útvonal normalizálása: `\` → `/`, vezető `/` és `./` eltávolítása,
 * `.`/`..`/üres szegmens és vezérlőkarakter elutasítva. Az eredeti (ékezetes) nevek megmaradnak.
 */
export function normalizeRelativePath(input: string): string {
  if (typeof input !== "string") throw new Error("Érvénytelen útvonal");
  const raw = input.replace(/\\/g, "/").replace(CONTROL, "").trim();
  const segs = raw.split("/").filter((s, i) => !(i === 0 && (s === "" || s === ".")));
  if (!segs.length) throw new Error("Érvénytelen útvonal");
  for (const s of segs) {
    const t = s.trim();
    if (!t || t === "." || t === "..") throw new Error("Érvénytelen útvonal");
    if (t.length > 255) throw new Error("Túl hosszú fájl- vagy mappanév");
  }
  const out = segs.map((s) => s.trim()).join("/");
  if (out.length > 1000) throw new Error("Túl hosszú útvonal");
  return out;
}

export function folderOf(relativePath: string): string {
  const i = relativePath.lastIndexOf("/");
  return i > 0 ? relativePath.slice(0, i) : "";
}
export function baseName(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

/** Folytatáshoz: ugyanannak a helyi fájlnak a felismerése új böngészőmunkamenetben. */
export function fileFingerprint(f: { relativePath: string; size: number; lastModified: number }): string {
  return `${normalizeRelativePath(f.relativePath)}|${f.size}|${Math.floor(f.lastModified)}`;
}

const SAFE = /[^a-zA-Z0-9._-]+/g;
export function safeKeyName(name: string): string {
  const base = baseName(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(SAFE, "_").replace(/_+/g, "_").replace(/^[_.]+/, "");
  return (base || "file").slice(-120);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const isSha256 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
export const isMd5 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{32}$/.test(v);

/** A csomagfájl eredeti objektumának kulcsa – csak a szerver hívja. Az eredeti soha nem íródik felül. */
export function packageObjectKey(a: { parent: PackageParent; packageId: string; fileId: string; name: string }): string {
  if (!isUuid(a.parent.id) || !isUuid(a.packageId) || !isUuid(a.fileId)) throw new Error("Érvénytelen azonosító");
  return `document-packages/${a.parent.kind}/${a.parent.id}/${a.packageId}/${a.fileId}/original/${safeKeyName(a.name)}`;
}

/** Feltöltési szerepkörök – a meglévő projekt-/ajánlatdokumentum-szabályok tükre (Owner külön). */
export const PACKAGE_UPLOAD_ROLES: Record<PackageParentKind, readonly string[]> = {
  project: ["project_manager", "pm", "sales"],
  quote: ["project_manager", "pm", "sales"],
};
export function canUploadPackage(kind: PackageParentKind, role: string | null | undefined, isOwner: boolean): boolean {
  return isOwner || PACKAGE_UPLOAD_ROLES[kind].includes(String(role ?? ""));
}

export type FileCheckInput = { relativePath: string; size: number; mime?: string | null };
/** Fájlonkénti előzetes ellenőrzés (a szerver is lefuttatja). null = rendben. */
export function checkPackageFile(f: FileCheckInput, limits: PackageLimits): string | null {
  let path: string;
  try { path = normalizeRelativePath(f.relativePath); } catch (e) { return (e as Error).message; }
  if (!Number.isFinite(f.size) || f.size <= 0) return "Üres fájl nem tölthető fel.";
  if (f.size > limits.maxFileBytes) return `A fájl nagyobb a megengedettnél (${formatBytes(limits.maxFileBytes)}).`;
  if (!fileKindOf(path)) return "Ez a fájltípus tervcsomagban nem engedélyezett.";
  return null;
}

/** Szerveroldali regisztráció döntésének tükre (a SQL függvény ugyanezt teszi zárolás alatt). */
export type ExistingFile = { id: string; relativePath: string; sha256: string; size: number; status: FileStatus; revisionNo: number; revisionOf: string | null; duplicateOf: string | null };
export type RegisterDecision =
  | { action: "duplicate"; of: string }
  | { action: "upload"; revisionNo: number; revisionOf: string | null }
  | { action: "reject"; reason: "file_too_large" | "parent_quota" };

const COUNTING: readonly FileStatus[] = ["pending", "uploading", "verified"];

export function decideRegistration(
  f: { relativePath: string; size: number; sha256: string },
  existing: readonly ExistingFile[],
  limits: PackageLimits,
): RegisterDecision {
  const path = normalizeRelativePath(f.relativePath);
  if (f.size > limits.maxFileBytes) return { action: "reject", reason: "file_too_large" };
  const live = existing.filter((e) => COUNTING.includes(e.status));
  const same = live.find((e) => e.sha256 === f.sha256 && !e.duplicateOf);
  if (same) return { action: "duplicate", of: same.id };
  const used = live.filter((e) => !e.duplicateOf).reduce((s, e) => s + e.size, 0);
  if (used + f.size > limits.maxParentBytes) return { action: "reject", reason: "parent_quota" };
  const samePath = live.filter((e) => e.relativePath === path && !e.duplicateOf);
  if (!samePath.length) return { action: "upload", revisionNo: 1, revisionOf: null };
  const root = samePath.find((e) => !e.revisionOf)?.id ?? samePath[0].revisionOf ?? samePath[0].id;
  return { action: "upload", revisionNo: Math.max(...samePath.map((e) => e.revisionNo)) + 1, revisionOf: root };
}

export type FileStatus = "pending" | "uploading" | "verified" | "failed" | "aborted" | "duplicate";
export type ProcessingStatus = "waiting" | "not_supported" | "processing" | "done" | "partial" | "unreadable";

export const FILE_STATUS_LABEL: Record<FileStatus, string> = {
  pending: "Feltöltésre vár", uploading: "Feltöltés folyamatban", verified: "Feltöltve, ellenőrizve",
  failed: "Hibás feltöltés", aborted: "Megszakítva", duplicate: "Már feltöltve (nem tároltuk újra)",
};
export const PROCESSING_LABEL: Record<ProcessingStatus, string> = {
  waiting: "Feldolgozásra vár", not_supported: "Tartalma nem olvasható (csak tárolva)", processing: "Feldolgozás alatt",
  done: "Feldolgozva", partial: "Részben olvasható", unreadable: "Nem olvasható",
};

/** P1: a feldolgozás még nem fut; a tárolt fájl P2-ben kerül sorra. CAD/levél egyelőre csak tárolva. */
export function initialProcessingStatus(path: string): ProcessingStatus {
  const k = fileKindOf(path);
  return k === "cad" || k === "email" ? "not_supported" : "waiting";
}

export type PackageStatus = "open" | "complete" | "partial" | "empty";
/** A csomag összesített állapota a fájlokból (a felület ezt mutatja). */
export function packageStatus(files: readonly { status: FileStatus }[]): PackageStatus {
  if (!files.length) return "empty";
  if (files.some((f) => f.status === "pending" || f.status === "uploading")) return "open";
  if (files.some((f) => f.status === "failed")) return "partial";
  return "complete";
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "–";
  if (n >= GiB) return `${(n / GiB).toFixed(n >= 10 * GiB ? 0 : 1).replace(".", ",")} GB`;
  if (n >= MiB) return `${(n / MiB).toFixed(n >= 100 * MiB ? 0 : 1).replace(".", ",")} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} kB`;
  return `${n} B`;
}

/** Hibakódok emberi nyelven – technikai részlet nélkül. */
export const ERROR_TEXT: Record<string, string> = {
  file_too_large: "A fájl nagyobb a megengedettnél.",
  parent_quota: "Az ügy tárhelykerete betelt. A tulajdonos tudja növelni.",
  not_allowed_type: "Ez a fájltípus nem engedélyezett.",
  integrity: "A feltöltött adat nem egyezik a helyi fájllal. Próbáld újra.",
  network: "Megszakadt a kapcsolat. A feltöltés folytatható.",
  storage: "A tárhely nem érhető el. Később folytatható.",
  forbidden: "Ehhez az ügyhöz nincs feltöltési jogosultságod.",
  changed_local: "A helyi fájl megváltozott a feltöltés óta. Töltsd fel új fájlként.",
};

/** A szerver regisztrációs válasza fájlonként (a feltöltőmotor ezt követi). */
export type RegisterResult =
  | { relativePath: string; action: "upload" | "resume"; fileId: string; partSize: number; partCount: number; doneParts: number[]; revisionNo?: number }
  | { relativePath: string; action: "verified"; fileId: string }
  | { relativePath: string; action: "duplicate"; fileId: string; ofPath: string | null }
  | { relativePath: string; action: "reject"; reason: string };

/** Csomaglista és fájlnézet (szerver → felület). */
export type PackageSummary = {
  id: string; parentKind: PackageParentKind; parentId: string; parentTitle: string | null; title: string; source: string;
  createdAt: string; createdBy: string; mine: boolean;
  fileCount: number; verified: number; open: number; failed: number; duplicates: number; bytes: number;
};
export type PackageFileView = {
  id: string; relativePath: string; name: string; size: number; kind: string | null; status: string; processingStatus: string;
  errorCode: string | null; revisionNo: number; revisionOf: string | null; duplicateOf: string | null; openKey: string | null;
  mine: boolean; createdAt: string; partCount: number | null;
};

